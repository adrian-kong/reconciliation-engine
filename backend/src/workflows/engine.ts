import { nanoid } from "nanoid";
import {
  processorRegistry,
  ProcessorContext,
  ExtractedInvoice,
  ExtractedPayment,
  ExtractedRemittance,
} from "../processors/types";
import { mongoStore } from "../store/mongo-store.js";
import {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowInput,
  WorkflowOutput,
  WorkflowStep,
  StepResult,
  WorkflowStatus,
  DEFAULT_INVOICE_WORKFLOW,
  DEFAULT_PAYMENT_WORKFLOW,
} from "./types";
import { r2 } from "../storage";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "../lib/config";

// ============ Workflow Engine ============

export class WorkflowEngine {
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private executions: Map<string, WorkflowExecution> = new Map();

  constructor() {
    // Register default workflows
    this.registerWorkflow(DEFAULT_INVOICE_WORKFLOW);
    this.registerWorkflow(DEFAULT_PAYMENT_WORKFLOW);
  }

  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
  }

  getWorkflow(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  getAllWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  getExecution(id: string): WorkflowExecution | undefined {
    return this.executions.get(id);
  }

  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Execute a workflow
   */
  async execute(
    workflowId: string,
    input: WorkflowInput,
    options: { processorId?: string } = {}
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const execution: WorkflowExecution = {
      id: nanoid(),
      workflowId,
      status: "running",
      startedAt: new Date().toISOString(),
      stepResults: [],
      input,
    };

    this.executions.set(execution.id, execution);

    try {
      const processorId = options.processorId || workflow.defaultProcessor;
      const output = await this.runSteps(
        workflow,
        execution,
        input,
        processorId
      );

      execution.status = "completed";
      execution.completedAt = new Date().toISOString();
      execution.output = output;
    } catch (error) {
      execution.status = "failed";
      execution.completedAt = new Date().toISOString();
      execution.error =
        error instanceof Error ? error.message : "Unknown error";
    }

    return execution;
  }

  /**
   * Run workflow steps
   */
  private async runSteps(
    workflow: WorkflowDefinition,
    execution: WorkflowExecution,
    input: WorkflowInput,
    processorId?: string
  ): Promise<WorkflowOutput> {
    const output: WorkflowOutput = {};
    let currentStepId: string | undefined = workflow.steps[0]?.id;

    // Context that accumulates through steps
    let context: ProcessorContext | null = null;
    let fileKey: string | undefined = input.fileKey;

    while (currentStepId) {
      const step = workflow.steps.find((s) => s.id === currentStepId);
      if (!step) break;

      execution.currentStepId = currentStepId;
      const stepStartTime = Date.now();
      let stepResult: StepResult;

      try {
        const result = await this.executeStep(step, {
          input,
          output,
          context,
          fileKey,
          processorId,
        });

        stepResult = {
          stepId: step.id,
          status: "success",
          startedAt: new Date(stepStartTime).toISOString(),
          completedAt: new Date().toISOString(),
          output: result.data,
        };

        // Update context and output based on step results
        if (result.context) context = result.context;
        if (result.fileKey) fileKey = result.fileKey;
        if (result.extractedData) output.extractedData = result.extractedData;
        if (result.documentType) output.documentType = result.documentType;
        if (result.savedRecordId) output.savedRecordId = result.savedRecordId;

        currentStepId = step.onSuccess;
      } catch (error) {
        // Handle retry logic
        if (step.retryCount && step.retryCount > 0) {
          let retried = false;
          for (let i = 0; i < step.retryCount; i++) {
            if (step.retryDelayMs) {
              await this.delay(step.retryDelayMs);
            }
            try {
              const result = await this.executeStep(step, {
                input,
                output,
                context,
                fileKey,
                processorId,
              });
              stepResult = {
                stepId: step.id,
                status: "success",
                startedAt: new Date(stepStartTime).toISOString(),
                completedAt: new Date().toISOString(),
                output: result.data,
              };
              if (result.context) context = result.context;
              if (result.fileKey) fileKey = result.fileKey;
              if (result.extractedData)
                output.extractedData = result.extractedData;
              currentStepId = step.onSuccess;
              retried = true;
              break;
            } catch {
              // Continue retrying
            }
          }
          if (retried) {
            execution.stepResults.push(stepResult!);
            continue;
          }
        }

        stepResult = {
          stepId: step.id,
          status: "failure",
          startedAt: new Date(stepStartTime).toISOString(),
          completedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        };

        currentStepId = step.onFailure;

        if (!currentStepId) {
          execution.stepResults.push(stepResult);
          throw error;
        }
      }

      execution.stepResults.push(stepResult);
    }

    return output;
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: WorkflowStep,
    state: {
      input: WorkflowInput;
      output: WorkflowOutput;
      context: ProcessorContext | null;
      fileKey?: string;
      processorId?: string;
    }
  ): Promise<{
    data?: unknown;
    context?: ProcessorContext;
    fileKey?: string;
    extractedData?: ExtractedInvoice | ExtractedPayment | ExtractedRemittance;
    documentType?:
      | "invoice"
      | "payment"
      | "statement"
      | "remittance"
      | "unknown";
    savedRecordId?: string;
  }> {
    const { input, output, context, fileKey, processorId } = state;

    switch (step.type) {
      case "upload": {
        if (!input.fileBuffer) {
          throw new Error("No file buffer provided");
        }
        const Key = `documents/${input.metadata?.organizationId}/${input.fileName}`;

        const result = await r2.send(
          new PutObjectCommand({
            Bucket: config.R2_BUCKET,
            Key,
            Body: input.fileBuffer,
            ContentType: input.mimeType,
          })
        );

        return {
          data: result,
          fileKey: Key,
          context: {
            fileBuffer: input.fileBuffer,
            fileName: input.fileName || "document.pdf",
            mimeType: input.mimeType || "application/pdf",
          },
        };
      }

      case "classify": {
        if (!context) {
          throw new Error("No context available for classification");
        }

        const processor = processorId
          ? processorRegistry.get(processorId)
          : processorRegistry.getAll()[0];

        if (!processor) {
          throw new Error("No processor available");
        }

        const classification = await processor.classifyDocument(context);
        return {
          data: classification,
          documentType: classification.type,
        };
      }

      case "extract": {
        if (!context) {
          throw new Error("No context available for extraction");
        }

        const processor = processorId
          ? processorRegistry.get(processorId)
          : processorRegistry.getAll()[0];

        if (!processor) {
          throw new Error("No processor available");
        }

        const documentType = output.documentType || "invoice";
        let result;

        if (documentType === "invoice") {
          result = await processor.extractInvoice(context);
        } else if (documentType === "payment") {
          result = await processor.extractPayment(context);
        } else {
          result = await processor.process(context);
        }

        if (!result.success) {
          throw new Error(result.error || "Extraction failed");
        }

        return {
          data: result,
          extractedData: result.data as ExtractedInvoice | ExtractedPayment,
        };
      }

      case "validate": {
        if (!output.extractedData) {
          throw new Error("No extracted data to validate");
        }

        const data = output.extractedData;
        const errors: string[] = [];

        // Basic validation
        if ("invoiceNumber" in data) {
          if (!data.invoiceNumber) errors.push("Missing invoice number");
          if (!data.amount || data.amount <= 0) errors.push("Invalid amount");
          if (!data.vendorName) errors.push("Missing vendor name");
        } else if ("paymentReference" in data) {
          if (!data.paymentReference) errors.push("Missing payment reference");
          if (!data.amount || data.amount <= 0) errors.push("Invalid amount");
        }

        if (errors.length > 0) {
          throw new Error(`Validation failed: ${errors.join(", ")}`);
        }

        return { data: { valid: true } };
      }

      case "save": {
        if (!output.extractedData) {
          throw new Error("No extracted data to save");
        }

        const organizationId = input.metadata?.organizationId as string;
        if (!organizationId) {
          throw new Error("No organizationId provided for save step");
        }

        const data = output.extractedData;
        let savedId: string;

        if ("invoiceNumber" in data) {
          const invoice = await mongoStore.createInvoice(organizationId, {
            invoiceNumber: data.invoiceNumber,
            vendorName: data.vendorName,
            vendorId: data.vendorId || `V-${Date.now()}`,
            amount: data.amount,
            currency: data.currency,
            issueDate: data.issueDate,
            dueDate: data.dueDate || data.issueDate,
            description: data.description || "",
            lineItems: (data.lineItems || []).map((item, i) => ({
              id: `LI-${i}`,
              description: item.description,
              quantity: item.quantity || 1,
              unitPrice: item.unitPrice || item.amount,
              amount: item.amount,
            })),
            status: "pending",
          });
          savedId = invoice.id;
        } else {
          const paymentData = data as ExtractedPayment;
          const payment = await mongoStore.createPayment(organizationId, {
            paymentReference: paymentData.paymentReference,
            payerName: paymentData.payerName,
            payerId: paymentData.payerId || `P-${Date.now()}`,
            amount: paymentData.amount,
            currency: paymentData.currency,
            paymentDate: paymentData.paymentDate,
            paymentMethod: paymentData.paymentMethod || "other",
            bankReference: paymentData.bankReference,
            description: paymentData.description || "",
            status: "pending",
          });
          savedId = payment.id;
        }

        return { data: { savedId }, savedRecordId: savedId };
      }

      case "notify": {
        // Notification logic - could integrate with webhooks, email, etc.
        const notifyType = step.config?.type as string;
        console.log(`[Workflow] Notification: ${notifyType}`, {
          documentType: output.documentType,
          savedRecordId: output.savedRecordId,
        });
        return { data: { notified: true, type: notifyType } };
      }

      case "transform": {
        // Transform logic - could be custom transformations
        return { data: output.extractedData };
      }

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const workflowEngine = new WorkflowEngine();
