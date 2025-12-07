import { z } from 'zod';

// ============ Extracted Data Schemas ============

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
  amount: z.number(),
});

export const ExtractedInvoiceSchema = z.object({
  invoiceNumber: z.string(),
  vendorName: z.string(),
  vendorId: z.string().optional(),
  vendorAddress: z.string().optional(),
  amount: z.number(),
  currency: z.string().default('USD'),
  issueDate: z.string(),
  dueDate: z.string().optional(),
  description: z.string().optional(),
  lineItems: z.array(LineItemSchema).optional(),
  taxAmount: z.number().optional(),
  subtotal: z.number().optional(),
  confidence: z.number().min(0).max(1).optional(),
  rawText: z.string().optional(),
});

export const ExtractedPaymentSchema = z.object({
  paymentReference: z.string(),
  payerName: z.string(),
  payerId: z.string().optional(),
  amount: z.number(),
  currency: z.string().default('USD'),
  paymentDate: z.string(),
  paymentMethod: z.enum(['bank_transfer', 'check', 'credit_card', 'direct_debit', 'cash', 'other']).optional(),
  bankReference: z.string().optional(),
  description: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  rawText: z.string().optional(),
});

// ============ Remittance Job Schema (Fleet → Mechanic Franchise) ============

export const RemittanceJobSchema = z.object({
  workOrderNumber: z.string(),
  vehicleInfo: z.string().optional(), // e.g., "2019 Ford F-150 - ABC123"
  serviceDate: z.string(),
  description: z.string(),
  laborAmount: z.number().optional(),
  partsAmount: z.number().optional(),
  totalAmount: z.number(),
  status: z.enum(['paid', 'partial', 'disputed', 'pending']).optional(),
});

export const ExtractedRemittanceSchema = z.object({
  remittanceNumber: z.string(),
  fleetCompanyName: z.string(),
  fleetCompanyId: z.string().optional(),
  shopName: z.string().optional(),
  shopId: z.string().optional(),
  remittanceDate: z.string(),
  paymentDate: z.string().optional(),
  totalAmount: z.number(),
  currency: z.string().default('USD'),
  paymentMethod: z.enum(['bank_transfer', 'check', 'credit_card', 'direct_debit', 'ach', 'other']).optional(),
  checkNumber: z.string().optional(),
  bankReference: z.string().optional(),
  jobs: z.array(RemittanceJobSchema),
  deductions: z.array(z.object({
    description: z.string(),
    amount: z.number(),
  })).optional(),
  notes: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  rawText: z.string().optional(),
});

export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;
export type ExtractedPayment = z.infer<typeof ExtractedPaymentSchema>;
export type ExtractedRemittance = z.infer<typeof ExtractedRemittanceSchema>;
export type RemittanceJob = z.infer<typeof RemittanceJobSchema>;
export type LineItem = z.infer<typeof LineItemSchema>;

// ============ Document Types ============

export type DocumentType = 'invoice' | 'payment' | 'statement' | 'remittance' | 'unknown';

export interface DocumentClassification {
  type: DocumentType;
  confidence: number;
  reasoning?: string;
}

// ============ Processing Result ============

export type ProcessingResult<T = ExtractedInvoice | ExtractedPayment | ExtractedRemittance> =
  | {
      success: true;
      data: T;
      documentType?: DocumentType;
      error?: undefined;
      processorId: string;
      processingTimeMs: number;
      metadata?: Record<string, unknown>;
    }
  | {
      success: false;
      data?: undefined;
      documentType?: DocumentType;
      error: string;
      processorId: string;
      processingTimeMs: number;
      metadata?: Record<string, unknown>;
    };

// ============ Processor Interface ============

export interface ProcessorConfig {
  id: string;
  name: string;
  description: string;
  supportedTypes: DocumentType[];
  options?: Record<string, unknown>;
}

export interface ProcessorContext {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  hints?: {
    expectedType?: DocumentType;
    vendorHint?: string;
    dateHint?: string;
  };
}

export abstract class BaseProcessor {
  abstract readonly config: ProcessorConfig;

  abstract process(context: ProcessorContext): Promise<ProcessingResult>;

  abstract classifyDocument(context: ProcessorContext): Promise<DocumentClassification>;

  abstract extractInvoice(context: ProcessorContext): Promise<ProcessingResult<ExtractedInvoice>>;

  abstract extractPayment(context: ProcessorContext): Promise<ProcessingResult<ExtractedPayment>>;

  abstract extractRemittance(context: ProcessorContext): Promise<ProcessingResult<ExtractedRemittance>>;

  protected createResult<T>(
    success: true,
    startTime: number,
    data: T,
    error?: undefined,
    metadata?: Record<string, unknown>
  ): ProcessingResult<T>;
  protected createResult<T>(
    success: false,
    startTime: number,
    data: undefined,
    error: string,
    metadata?: Record<string, unknown>
  ): ProcessingResult<T>;
  protected createResult<T>(
    success: boolean,
    startTime: number,
    data: T | undefined,
    error: string | undefined,
    metadata?: Record<string, unknown>
  ): ProcessingResult<T> {
    if (success) {
      return {
        success: true,
        data: data as T,
        processorId: this.config.id,
        processingTimeMs: Date.now() - startTime,
        metadata,
      };
    } else {
      return {
        success: false,
        error: error!,
        processorId: this.config.id,
        processingTimeMs: Date.now() - startTime,
        metadata,
      };
    }
  }
}

// ============ Processor Registry ============

export class ProcessorRegistry {
  private processors: Map<string, BaseProcessor> = new Map();

  register(processor: BaseProcessor): void {
    this.processors.set(processor.config.id, processor);
  }

  get(id: string): BaseProcessor | undefined {
    return this.processors.get(id);
  }

  getAll(): BaseProcessor[] {
    return Array.from(this.processors.values());
  }

  getByType(type: DocumentType): BaseProcessor[] {
    return this.getAll().filter(p => p.config.supportedTypes.includes(type));
  }
}

export const processorRegistry = new ProcessorRegistry();

