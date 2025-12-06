import { z } from "zod";

// ============ Enums ============
export const invoiceStatusSchema = z.enum([
  "pending",
  "partially_matched",
  "matched",
  "disputed",
  "written_off",
]);

export const paymentMethodSchema = z.enum([
  "bank_transfer",
  "check",
  "credit_card",
  "direct_debit",
  "cash",
  "other",
]);

export const paymentStatusSchema = z.enum([
  "pending",
  "partially_matched",
  "matched",
  "unmatched",
  "refunded",
]);

export const reconciliationStatusSchema = z.enum([
  "pending_review",
  "approved",
  "rejected",
  "resolved",
]);

export const exceptionStatusSchema = z.enum([
  "open",
  "in_review",
  "resolved",
  "escalated",
]);

export const documentTypeSchema = z.enum(["invoice", "payment"]);

// ============ Common Schemas ============
export const lineItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  amount: z.number(),
});

// ============ Invoice Schemas ============
export const createInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1),
  vendorName: z.string().min(1),
  vendorId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  issueDate: z.string(),
  dueDate: z.string(),
  description: z.string(),
  lineItems: z.array(lineItemSchema).default([]),
  status: invoiceStatusSchema.default("pending"),
});

export const updateInvoiceSchema = createInvoiceSchema.partial();

// ============ Payment Schemas ============
export const createPaymentSchema = z.object({
  paymentReference: z.string().min(1),
  payerName: z.string().min(1),
  payerId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().length(3),
  paymentDate: z.string(),
  paymentMethod: paymentMethodSchema,
  bankReference: z.string().optional(),
  description: z.string(),
  status: paymentStatusSchema.default("pending"),
});

export const updatePaymentSchema = createPaymentSchema.partial();

// ============ Reconciliation Schemas ============
export const createReconciliationSchema = z.object({
  invoiceId: z.string().min(1),
  paymentId: z.string().min(1),
  notes: z.string().optional(),
});

export const updateReconciliationStatusSchema = z.object({
  status: reconciliationStatusSchema,
});

export const autoReconcileSchema = z.object({
  minConfidence: z.number().min(0).max(1).optional(),
});

// ============ Exception Schemas ============
export const updateExceptionStatusSchema = z.object({
  status: exceptionStatusSchema,
  resolvedBy: z.string().optional(),
});

// ============ Upload Schemas ============
export const processFileSchema = z.object({
  documentType: documentTypeSchema.optional(),
  workflowId: z.string().optional(),
  processorId: z.string().optional(),
});

export const presignUploadSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().optional(),
});

// ============ Import Schemas ============
export const importInvoicesSchema = z.object({
  invoices: z.array(createInvoiceSchema),
});

export const importPaymentsSchema = z.object({
  payments: z.array(createPaymentSchema),
});

// ============ Auth Schemas ============
export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});
