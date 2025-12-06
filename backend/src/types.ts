export interface Invoice {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  vendorName: string;
  vendorId: string;
  amount: number;
  currency: string;
  issueDate: string;
  dueDate: string;
  description: string;
  lineItems: LineItem[];
  status: InvoiceStatus;
  reconciliationId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export type InvoiceStatus = 
  | 'pending'
  | 'partially_matched'
  | 'matched'
  | 'disputed'
  | 'written_off';

export interface Payment {
  id: string;
  organizationId: string;
  paymentReference: string;
  payerName: string;
  payerId: string;
  amount: number;
  currency: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  bankReference?: string;
  description: string;
  status: PaymentStatus;
  reconciliationId?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentMethod = 
  | 'bank_transfer'
  | 'check'
  | 'credit_card'
  | 'direct_debit'
  | 'cash'
  | 'other';

export type PaymentStatus = 
  | 'pending'
  | 'partially_matched'
  | 'matched'
  | 'unmatched'
  | 'refunded';

export interface Reconciliation {
  id: string;
  organizationId: string;
  invoiceId: string;
  paymentId: string;
  matchedAmount: number;
  matchType: MatchType;
  matchConfidence: number;
  discrepancyAmount: number;
  discrepancyType?: DiscrepancyType;
  status: ReconciliationStatus;
  notes: string;
  matchedBy: 'auto' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export type MatchType = 
  | 'exact'
  | 'partial'
  | 'overpayment'
  | 'underpayment'
  | 'reference_match';

export type DiscrepancyType = 
  | 'amount_mismatch'
  | 'date_variance'
  | 'duplicate_payment'
  | 'missing_invoice'
  | 'missing_payment'
  | 'currency_mismatch';

export type ReconciliationStatus = 
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'resolved';

export interface Exception {
  id: string;
  organizationId: string;
  type: ExceptionType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  invoiceId?: string;
  paymentId?: string;
  reconciliationId?: string;
  description: string;
  suggestedAction: string;
  status: ExceptionStatus;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export type ExceptionType = 
  | 'unmatched_invoice'
  | 'unmatched_payment'
  | 'amount_discrepancy'
  | 'duplicate_entry'
  | 'date_variance'
  | 'vendor_mismatch';

export type ExceptionStatus = 
  | 'open'
  | 'in_review'
  | 'resolved'
  | 'escalated';

export interface DashboardStats {
  totalInvoices: number;
  totalPayments: number;
  totalReconciled: number;
  totalExceptions: number;
  totalInvoiceAmount: number;
  totalPaymentAmount: number;
  reconciledAmount: number;
  unreconciledInvoiceAmount: number;
  unreconciledPaymentAmount: number;
  matchRate: number;
  avgProcessingTime: number;
}

export interface ReconciliationSuggestion {
  invoiceId: string;
  paymentId: string;
  confidence: number;
  matchReasons: string[];
  discrepancyAmount: number;
}

// ============ Remittance Types ============

export interface Remittance {
  id: string;
  organizationId: string;
  remittanceNumber: string;
  fleetCompanyName: string;
  fleetCompanyId?: string;
  shopName?: string;
  shopId?: string;
  remittanceDate: string;
  paymentDate?: string;
  totalAmount: number;
  currency: string;
  paymentMethod?: PaymentMethod | 'ach';
  checkNumber?: string;
  bankReference?: string;
  jobs: RemittanceJob[];
  deductions?: RemittanceDeduction[];
  notes?: string;
  sourceFileKey?: string;
  processingJobId?: string;
  status: RemittanceStatus;
  confidence?: number;
  rawText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemittanceJob {
  id: string;
  workOrderNumber: string;
  vehicleInfo?: string;
  serviceDate: string;
  description: string;
  laborAmount?: number;
  partsAmount?: number;
  totalAmount: number;
  status: 'paid' | 'partial' | 'disputed' | 'pending';
}

export interface RemittanceDeduction {
  description: string;
  amount: number;
}

export type RemittanceStatus = 
  | 'processing'
  | 'completed'
  | 'failed'
  | 'review_required';

// ============ Processing Job Types ============

export interface ProcessingJob {
  id: string;
  organizationId: string;
  fileName: string;
  fileKey?: string;
  fileSize: number;
  mimeType: string;
  documentType: 'invoice' | 'payment' | 'remittance' | 'unknown';
  status: ProcessingStatus;
  workflowId: string;
  currentStep?: string;
  progress: number;
  result?: ProcessingJobResult;
  error?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
}

export type ProcessingStatus =
  | 'queued'
  | 'uploading'
  | 'processing'
  | 'extracting'
  | 'validating'
  | 'saving'
  | 'completed'
  | 'failed';

export interface ProcessingJobResult {
  documentType: string;
  extractedData?: unknown;
  savedRecordId?: string;
  processingTimeMs: number;
  confidence?: number;
}

