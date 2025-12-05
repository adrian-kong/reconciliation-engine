export interface Invoice {
  id: string;
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

