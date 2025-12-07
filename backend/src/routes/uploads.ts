import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth, requireOrg } from "../middleware/auth.js";
import { workflowEngine } from "../workflows/engine.js";
import { r2 } from "../lib/config.js";
import { processFileSchema, presignUploadSchema } from "./schemas.js";
import type { DocumentType } from "../processors/types.js";
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { config } from "../lib/config.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const uploads = new Hono();

uploads.post("/process", requireAuth, requireOrg, async (c) => {
  try {
    const organizationId = c.get("organizationId")!;
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const documentType = formData.get("documentType") as DocumentType | null;
    const workflowId = formData.get("workflowId") as string | null;
    const processorId = formData.get("processorId") as string | null;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const selectedWorkflow =
      workflowId ||
      (documentType === "payment"
        ? "payment-processing"
        : "invoice-processing");

    const execution = await workflowEngine.execute(
      selectedWorkflow,
      {
        fileBuffer: buffer,
        fileName: file.name,
        mimeType: file.type || "application/pdf",
        metadata: { documentType, organizationId },
      },
      { processorId: processorId || undefined }
    );

    return c.json({
      success: execution.status === "completed",
      execution,
    });
  } catch (error) {
    const e = error instanceof Error ? error : new Error("Upload failed");
    return c.json({ error: e.message }, 500);
  }
});

uploads.post("/", requireAuth, requireOrg, async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await r2.send(
      new PutObjectCommand({
        Bucket: config.R2_BUCKET,
        Key: file.name,
        Body: buffer,
        ContentType: file.type || "application/pdf",
      })
    );

    return c.json({ success: true, ...result });
  } catch (error) {
    const e = error instanceof Error ? error : new Error("Upload failed");
    return c.json({ error: e.message }, 500);
  }
});

uploads.post(
  "/:fileKey/process",
  requireAuth,
  requireOrg,
  zValidator("json", processFileSchema),
  async (c) => {
    try {
      const organizationId = c.get("organizationId")!;
      const fileKey = c.req.param("fileKey");
      const body = c.req.valid("json");

      // Fetch the object from R2
      const objectResponse = await r2.send(
        new GetObjectCommand({
          Bucket: config.R2_BUCKET,
          Key: fileKey,
        })
      );

      // Convert stream → buffer
      const fileBuffer = Buffer.from(
        (await objectResponse.Body?.transformToByteArray()) || new Uint8Array()
      );

      // Fetch metadata (Cloudflare R2 via S3-compatible HeadObject)
      const head = await r2.send(
        new HeadObjectCommand({
          Bucket: config.R2_BUCKET,
          Key: fileKey,
        })
      );

      const originalName =
        head.Metadata?.originalname || head.Metadata?.originalName;
      const contentType = head.ContentType || "application/octet-stream";

      const selectedWorkflow =
        body.workflowId ||
        (body.documentType === "payment"
          ? "payment-processing"
          : "invoice-processing");

      const execution = await workflowEngine.execute(
        selectedWorkflow,
        {
          fileKey,
          fileBuffer,
          fileName: originalName || "document.pdf",
          mimeType: contentType,
          metadata: { documentType: body.documentType, organizationId },
        },
        { processorId: body.processorId }
      );

      return c.json({
        success: execution.status === "completed",
        execution,
      });
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "Processing failed",
        },
        500
      );
    }
  }
);

uploads.post(
  "/presign",
  requireAuth,
  requireOrg,
  zValidator("json", presignUploadSchema),
  async (c) => {
    try {
      const body = c.req.valid("json");
      const fileId = `uploads/${Date.now()}-${body.fileName}`;
      const command = new GetObjectCommand({
        Bucket: config.R2_BUCKET,
        Key: fileId,
      });
      const url = await getSignedUrl(r2, command, { expiresIn: 3600 * 1000 });
      return c.json({ url, fileKey: fileId });
    } catch (error) {
      const e =
        error instanceof Error ? error : new Error("Failed to generate URL");
      return c.json({ error: e.message }, 500);
    }
  }
);

uploads.get("/", requireAuth, requireOrg, async (c) => {
  try {
    const prefix = c.req.query("prefix") || "uploads";
    const result = await r2.send(
      new ListObjectsV2Command({
        Bucket: config.R2_BUCKET,
        Prefix: prefix,
      })
    );
    return c.json(result);
  } catch (error) {
    const e =
      error instanceof Error ? error : new Error("Failed to list files");
    return c.json({ error: e.message }, 500);
  }
});

export { uploads };
