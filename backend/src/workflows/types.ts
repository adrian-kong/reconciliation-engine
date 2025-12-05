import { DocumentType, ProcessingResult, ExtractedInvoice, ExtractedPayment } from '../processors/types.js';

// ============ Workflow Step Types ============

export type WorkflowStepType = 
  | 'upload'        // Upload to storage
  | 'classify'      // Classify document type
  | 'extract'       // Extract data
  | 'validate'      // Validate extracted data
  | 'transform'     // Transform data format
  | 'save'          // Save to database
  | 'notify';       // Send notification

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  processorId?: string;          // For extract steps
  config?: Record<string, unknown>;
  onSuccess?: string;            // Next step ID on success
  onFailure?: string;            // Next step ID on failure
  retryCount?: number;
  retryDelayMs?: number;
}

// ============ Workflow Definition ============

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  defaultProcessor?: string;
}

export interface WorkflowTrigger {
  type: 'upload' | 'schedule' | 'manual' | 'api';
  config?: {
    fileTypes?: string[];
    schedule?: string;           // Cron expression
    endpoint?: string;
  };
}

// ============ Workflow Execution ============

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  startedAt: string;
  completedAt?: string;
  currentStepId?: string;
  stepResults: StepResult[];
  input: WorkflowInput;
  output?: WorkflowOutput;
  error?: string;
}

export type WorkflowStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface StepResult {
  stepId: string;
  status: 'success' | 'failure' | 'skipped';
  startedAt: string;
  completedAt: string;
  output?: unknown;
  error?: string;
}

export interface WorkflowInput {
  fileKey?: string;
  fileBuffer?: Buffer;
  fileName?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowOutput {
  documentType?: DocumentType;
  extractedData?: ExtractedInvoice | ExtractedPayment;
  processingResult?: ProcessingResult;
  savedRecordId?: string;
}

// ============ Predefined Workflows ============

export const DEFAULT_INVOICE_WORKFLOW: WorkflowDefinition = {
  id: 'invoice-processing',
  name: 'Invoice Processing',
  description: 'Standard workflow for processing invoice PDFs',
  version: '1.0.0',
  trigger: { type: 'upload', config: { fileTypes: ['application/pdf'] } },
  defaultProcessor: 'mistral-ocr',
  steps: [
    {
      id: 'upload',
      type: 'upload',
      onSuccess: 'classify',
    },
    {
      id: 'classify',
      type: 'classify',
      onSuccess: 'extract',
      onFailure: 'notify-failure',
    },
    {
      id: 'extract',
      type: 'extract',
      onSuccess: 'validate',
      onFailure: 'notify-failure',
      retryCount: 2,
      retryDelayMs: 1000,
    },
    {
      id: 'validate',
      type: 'validate',
      onSuccess: 'save',
      onFailure: 'notify-review',
    },
    {
      id: 'save',
      type: 'save',
      onSuccess: 'notify-success',
    },
    {
      id: 'notify-success',
      type: 'notify',
      config: { type: 'success' },
    },
    {
      id: 'notify-failure',
      type: 'notify',
      config: { type: 'failure' },
    },
    {
      id: 'notify-review',
      type: 'notify',
      config: { type: 'review' },
    },
  ],
};

export const DEFAULT_PAYMENT_WORKFLOW: WorkflowDefinition = {
  id: 'payment-processing',
  name: 'Payment Processing',
  description: 'Standard workflow for processing payment PDFs',
  version: '1.0.0',
  trigger: { type: 'upload', config: { fileTypes: ['application/pdf'] } },
  defaultProcessor: 'mistral-ocr',
  steps: [
    {
      id: 'upload',
      type: 'upload',
      onSuccess: 'classify',
    },
    {
      id: 'classify',
      type: 'classify',
      onSuccess: 'extract',
    },
    {
      id: 'extract',
      type: 'extract',
      onSuccess: 'validate',
      retryCount: 2,
    },
    {
      id: 'validate',
      type: 'validate',
      onSuccess: 'save',
    },
    {
      id: 'save',
      type: 'save',
    },
  ],
};

