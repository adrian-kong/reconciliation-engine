import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { requireAuth, requireOrg } from "../middleware/auth.js";
import { collections, OrgRemittance, OrgProcessingJob } from "../lib/db.js";
import { r2 } from "../storage/r2.js";
import { processorRegistry } from "../processors/types.js";
import type { ProcessingJob, Remittance, RemittanceJob } from "../types.js";
import type { ExtractedRemittance } from "../processors/types.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../lib/config.js";

const remittances = new Hono();

// In-memory event emitter for SSE updates
type SSECallback = (event: ProcessingEvent) => void;
const sseClients = new Map<string, Set<SSECallback>>();

export interface ProcessingEvent {
  type: "job_created" | "job_updated" | "job_completed" | "job_failed";
  jobId: string;
  data: Partial<ProcessingJob>;
}

function emitEvent(organizationId: string, event: ProcessingEvent) {
  const clients = sseClients.get(organizationId);
  if (clients) {
    clients.forEach((cb) => cb(event));
  }
}

// ============ SSE Endpoint for Real-time Updates ============

remittances.get("/events", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;

  return streamSSE(c, async (stream) => {
    // Register this client
    if (!sseClients.has(organizationId)) {
      sseClients.set(organizationId, new Set());
    }
    const clients = sseClients.get(organizationId)!;

    const callback: SSECallback = (event) => {
      stream.writeSSE({
        event: event.type,
        data: JSON.stringify(event),
      });
    };

    clients.add(callback);

    // Send initial connection event
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ message: "Connected to processing events" }),
    });

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: "ping", data: "" });
    }, 30000);

    // Cleanup on disconnect
    stream.onAbort(() => {
      clearInterval(heartbeat);
      clients.delete(callback);
    });

    // Keep stream open
    await new Promise(() => {});
  });
});

// ============ Upload and Process Remittance PDF ============

remittances.post("/upload", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const jobId = nanoid();
    const now = new Date().toISOString();

    // Create processing job
    const job: OrgProcessingJob = {
      id: jobId,
      organizationId,
      fileName: file.name,
      fileSize: buffer.length,
      mimeType: file.type || "application/pdf",
      documentType: "remittance",
      status: "queued",
      workflowId: "remittance-processing",
      progress: 0,
      startedAt: now,
      createdAt: now,
    };

    await collections.processingJobs().insertOne(job);

    // Emit job created event
    emitEvent(organizationId, {
      type: "job_created",
      jobId,
      data: job,
    });

    // Process asynchronously
    processRemittanceAsync(organizationId, jobId, buffer, file.name).catch(
      console.error
    );

    return c.json({ success: true, jobId, job });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      500
    );
  }
});

// ============ Bulk Upload ============

remittances.post("/upload/bulk", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;

  try {
    const formData = await c.req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return c.json({ error: "No files provided" }, 400);
    }

    const jobs: ProcessingJob[] = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const jobId = nanoid();
      const now = new Date().toISOString();

      const job: OrgProcessingJob = {
        id: jobId,
        organizationId,
        fileName: file.name,
        fileSize: buffer.length,
        mimeType: file.type || "application/pdf",
        documentType: "remittance",
        status: "queued",
        workflowId: "remittance-processing",
        progress: 0,
        startedAt: now,
        createdAt: now,
      };

      await collections.processingJobs().insertOne(job);
      jobs.push(job);

      emitEvent(organizationId, {
        type: "job_created",
        jobId,
        data: job,
      });

      // Process each file asynchronously
      processRemittanceAsync(organizationId, jobId, buffer, file.name).catch(
        console.error
      );
    }

    return c.json({ success: true, jobs });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Bulk upload failed" },
      500
    );
  }
});

// ============ Get Processing Jobs ============

remittances.get("/jobs", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const status = c.req.query("status");

  const filter: Record<string, unknown> = { organizationId };
  if (status) {
    filter.status = status;
  }

  const jobs = await collections
    .processingJobs()
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  return c.json(jobs);
});

remittances.get("/jobs/:id", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const id = c.req.param("id");

  const job = await collections
    .processingJobs()
    .findOne({ id, organizationId });
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json(job);
});

// Get presigned URL for job's PDF file
remittances.get("/jobs/:id/file-url", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const id = c.req.param("id");

  const job = await collections
    .processingJobs()
    .findOne({ id, organizationId });
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  if (!job.fileKey) {
    return c.json({ error: "No file available" }, 404);
  }

  const command = new GetObjectCommand({
    Bucket: config.R2_BUCKET,
    Key: job.fileKey,
  });
  const url = await getSignedUrl(r2, command, { expiresIn: 3600 * 1000 });
  return c.json({ url });
});

// Retry a failed processing job
remittances.post("/jobs/:id/retry", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const id = c.req.param("id");

  const job = await collections
    .processingJobs()
    .findOne({ id, organizationId });
  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }
  if (job.status !== "failed") {
    return c.json({ error: "Can only retry failed jobs" }, 400);
  }
  if (!job.fileKey) {
    return c.json({ error: "No file to retry" }, 400);
  }

  // Reset job status
  await collections.processingJobs().updateOne(
    { id, organizationId },
    {
      $set: {
        status: "queued",
        progress: 0,
        error: undefined,
        currentStep: undefined,
        startedAt: new Date().toISOString(),
        completedAt: undefined,
      },
    }
  );

  // Emit job updated event
  emitEvent(organizationId, {
    type: "job_updated",
    jobId: id,
    data: { status: "queued", progress: 0 },
  });

  // Re-fetch file from R2 and reprocess
  const command = new GetObjectCommand({
    Bucket: config.R2_BUCKET,
    Key: job.fileKey,
  });
  const objectResponse = await r2.send(command);
  const fileBuffer = Buffer.from(
    (await objectResponse.Body?.transformToByteArray()) || new Uint8Array()
  );
  processRemittanceAsync(organizationId, id, fileBuffer, job.fileName).catch(
    console.error
  );

  return c.json({ success: true, jobId: id });
});

// ============ Get Remittances ============

remittances.get("/", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");

  const remittancesList = await collections
    .remittances()
    .find({ organizationId })
    .sort({ createdAt: -1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  const total = await collections
    .remittances()
    .countDocuments({ organizationId });

  return c.json({ remittances: remittancesList, total, limit, offset });
});

remittances.get("/:id", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const id = c.req.param("id");

  const remittance = await collections
    .remittances()
    .findOne({ id, organizationId });
  if (!remittance) {
    return c.json({ error: "Remittance not found" }, 404);
  }

  return c.json(remittance);
});

// Get presigned URL for remittance's source PDF file
remittances.get("/:id/file-url", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const id = c.req.param("id");

  const remittance = await collections
    .remittances()
    .findOne({ id, organizationId });
  if (!remittance) {
    return c.json({ error: "Remittance not found" }, 404);
  }
  if (!remittance.sourceFileKey) {
    return c.json({ error: "No file available" }, 404);
  }

  const command = new GetObjectCommand({
    Bucket: config.R2_BUCKET,
    Key: remittance.sourceFileKey,
  });
  const url = await getSignedUrl(r2, command, { expiresIn: 3600 * 1000 });
  return c.json({ url });
});

// ============ Dashboard Stats ============

remittances.get("/stats/summary", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;

  const [totalRemittances, totalJobs, completedJobs, failedJobs] =
    await Promise.all([
      collections.remittances().countDocuments({ organizationId }),
      collections.processingJobs().countDocuments({ organizationId }),
      collections
        .processingJobs()
        .countDocuments({ organizationId, status: "completed" }),
      collections
        .processingJobs()
        .countDocuments({ organizationId, status: "failed" }),
    ]);

  // Get totals from remittances
  const aggregation = await collections
    .remittances()
    .aggregate([
      { $match: { organizationId } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$totalAmount" },
          totalJobs: { $sum: { $size: "$jobs" } },
        },
      },
    ])
    .toArray();

  const totals = aggregation[0] || { totalAmount: 0, totalJobs: 0 };

  return c.json({
    totalRemittances,
    totalProcessingJobs: totalJobs,
    completedJobs,
    failedJobs,
    pendingJobs: totalJobs - completedJobs - failedJobs,
    totalAmount: totals.totalAmount,
    totalWorkOrders: totals.totalJobs,
  });
});

// ============ Async Processing Function ============

async function processRemittanceAsync(
  organizationId: string,
  jobId: string,
  buffer: Buffer,
  fileName: string
) {
  const updateJob = async (updates: Partial<ProcessingJob>) => {
    await collections
      .processingJobs()
      .updateOne({ id: jobId, organizationId }, { $set: updates });
  };

  try {
    // Step 1: Upload to R2
    await updateJob({
      status: "uploading",
      currentStep: "upload",
      progress: 10,
    });
    emitEvent(organizationId, {
      type: "job_updated",
      jobId,
      data: { status: "uploading", currentStep: "upload", progress: 10 },
    });
    const Key = `remittances/${organizationId}/${fileName}`;
    const uploadResult = await r2.send(
      new PutObjectCommand({
        Bucket: config.R2_BUCKET,
        Key,
        Body: buffer,
        ContentType: "application/pdf",
      })
    );

    await updateJob({ fileKey: Key, progress: 20 });
    emitEvent(organizationId, {
      type: "job_updated",
      jobId,
      data: { progress: 20 },
    });

    // Step 2: OCR
    await updateJob({ status: "processing", currentStep: "ocr", progress: 30 });
    emitEvent(organizationId, {
      type: "job_updated",
      jobId,
      data: { status: "processing", currentStep: "ocr", progress: 30 },
    });

    const processor = processorRegistry.get("mistral-ocr");
    if (!processor) {
      throw new Error("Mistral OCR processor not available");
    }

    // Step 3: Extract
    await updateJob({
      status: "extracting",
      currentStep: "extract",
      progress: 50,
    });
    emitEvent(organizationId, {
      type: "job_updated",
      jobId,
      data: { status: "extracting", currentStep: "extract", progress: 50 },
    });

    const extractResult = await processor.extractRemittance({
      fileBuffer: buffer,
      fileName,
      mimeType: "application/pdf",
      hints: { expectedType: "remittance" },
    });

    if (!extractResult.success || !extractResult.data) {
      throw new Error(extractResult.error || "Extraction failed");
    }

    await updateJob({ progress: 70 });
    emitEvent(organizationId, {
      type: "job_updated",
      jobId,
      data: { progress: 70 },
    });

    // Step 4: Validate
    await updateJob({
      status: "validating",
      currentStep: "validate",
      progress: 80,
    });
    emitEvent(organizationId, {
      type: "job_updated",
      jobId,
      data: { status: "validating", currentStep: "validate", progress: 80 },
    });

    const extracted = extractResult.data as ExtractedRemittance;

    // Basic validation
    if (!extracted.remittanceNumber) {
      throw new Error("Missing remittance number");
    }
    if (!extracted.jobs || extracted.jobs.length === 0) {
      throw new Error("No jobs found in remittance");
    }

    await updateJob({ progress: 90 });
    emitEvent(organizationId, {
      type: "job_updated",
      jobId,
      data: { progress: 90 },
    });

    // Step 5: Save
    await updateJob({ status: "saving", currentStep: "save" });
    emitEvent(organizationId, {
      type: "job_updated",
      jobId,
      data: { status: "saving", currentStep: "save" },
    });

    const remittanceId = nanoid();
    const now = new Date().toISOString();

    const remittance: OrgRemittance = {
      id: remittanceId,
      organizationId,
      remittanceNumber: extracted.remittanceNumber,
      fleetCompanyName: extracted.fleetCompanyName,
      fleetCompanyId: extracted.fleetCompanyId,
      shopName: extracted.shopName,
      shopId: extracted.shopId,
      remittanceDate: extracted.remittanceDate,
      paymentDate: extracted.paymentDate,
      totalAmount: extracted.totalAmount,
      currency: extracted.currency,
      paymentMethod: extracted.paymentMethod,
      checkNumber: extracted.checkNumber,
      bankReference: extracted.bankReference,
      jobs: extracted.jobs.map((job, i) => ({
        id: nanoid(),
        workOrderNumber: job.workOrderNumber,
        vehicleInfo: job.vehicleInfo,
        serviceDate: job.serviceDate,
        description: job.description,
        laborAmount: job.laborAmount,
        partsAmount: job.partsAmount,
        totalAmount: job.totalAmount,
        status: job.status || "paid",
      })),
      deductions: extracted.deductions,
      notes: extracted.notes,
      sourceFileKey: Key,
      processingJobId: jobId,
      status: "completed",
      confidence: extracted.confidence,
      rawText: extracted.rawText,
      createdAt: now,
      updatedAt: now,
    };

    await collections.remittances().insertOne(remittance);

    // Complete the job
    const completedAt = new Date().toISOString();
    await updateJob({
      status: "completed",
      progress: 100,
      completedAt,
      result: {
        documentType: "remittance",
        extractedData: extracted,
        savedRecordId: remittanceId,
        processingTimeMs: Date.now() - new Date(now).getTime(),
        confidence: extracted.confidence,
      },
    });

    emitEvent(organizationId, {
      type: "job_completed",
      jobId,
      data: {
        status: "completed",
        progress: 100,
        result: {
          documentType: "remittance",
          savedRecordId: remittanceId,
          processingTimeMs: Date.now() - new Date(now).getTime(),
        },
      },
    });
  } catch (error) {
    console.error(error);
    const errorMessage =
      error instanceof Error ? error.message : "Processing failed";

    await updateJob({
      status: "failed",
      error: errorMessage,
      completedAt: new Date().toISOString(),
    });

    emitEvent(organizationId, {
      type: "job_failed",
      jobId,
      data: { status: "failed", error: errorMessage },
    });
  }
}

export { remittances };
