import { mongoStore } from './store/mongo-store.js';
import type {
  Invoice,
  Payment,
  Reconciliation,
  ReconciliationSuggestion,
  MatchType,
  DiscrepancyType,
  DashboardStats,
  Exception,
} from './types.js';

const AMOUNT_TOLERANCE = 0.01; // 1 cent tolerance for floating point
const PARTIAL_MATCH_THRESHOLD = 0.8; // 80% match threshold

export class ReconciliationEngine {
  /**
   * Generate matching suggestions for unreconciled invoices and payments
   */
  async generateSuggestions(organizationId: string): Promise<ReconciliationSuggestion[]> {
    const unreconciledInvoices = await mongoStore.getUnreconciledInvoices(organizationId);
    const unreconciledPayments = await mongoStore.getUnreconciledPayments(organizationId);
    const suggestions: ReconciliationSuggestion[] = [];

    for (const invoice of unreconciledInvoices) {
      for (const payment of unreconciledPayments) {
        const suggestion = this.evaluateMatch(invoice, payment);
        if (suggestion && suggestion.confidence > 0.3) {
          suggestions.push(suggestion);
        }
      }
    }

    // Sort by confidence descending
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Evaluate potential match between invoice and payment
   */
  private evaluateMatch(
    invoice: Invoice,
    payment: Payment
  ): ReconciliationSuggestion | null {
    const matchReasons: string[] = [];
    let confidenceScore = 0;

    // Check currency match (required)
    if (invoice.currency !== payment.currency) {
      return null;
    }

    // Exact amount match
    const amountDiff = Math.abs(invoice.amount - payment.amount);
    if (amountDiff <= AMOUNT_TOLERANCE) {
      matchReasons.push('Exact amount match');
      confidenceScore += 0.5;
    } else if (payment.amount >= invoice.amount * PARTIAL_MATCH_THRESHOLD) {
      // Partial match
      const matchPercentage =
        Math.min(payment.amount, invoice.amount) /
        Math.max(payment.amount, invoice.amount);
      matchReasons.push(`Amount ${(matchPercentage * 100).toFixed(1)}% match`);
      confidenceScore += matchPercentage * 0.4;
    }

    // Reference matching (invoice number in payment description)
    if (
      payment.description
        .toLowerCase()
        .includes(invoice.invoiceNumber.toLowerCase())
    ) {
      matchReasons.push('Invoice reference in payment description');
      confidenceScore += 0.3;
    }

    // Vendor/Payer name similarity
    if (
      this.fuzzyMatch(invoice.vendorName, payment.description) ||
      this.fuzzyMatch(invoice.vendorName, payment.payerName)
    ) {
      matchReasons.push('Vendor name match');
      confidenceScore += 0.1;
    }

    // Date proximity (payment within 30 days of invoice due date)
    const daysDiff = this.daysBetween(invoice.dueDate, payment.paymentDate);
    if (daysDiff <= 30) {
      matchReasons.push('Payment within 30 days of due date');
      confidenceScore += 0.1;
    } else if (daysDiff <= 60) {
      matchReasons.push('Payment within 60 days of due date');
      confidenceScore += 0.05;
    }

    if (matchReasons.length === 0) {
      return null;
    }

    return {
      invoiceId: invoice.id,
      paymentId: payment.id,
      confidence: Math.min(confidenceScore, 1),
      matchReasons,
      discrepancyAmount: payment.amount - invoice.amount,
    };
  }

  /**
   * Execute auto-reconciliation for high-confidence matches
   */
  async autoReconcile(organizationId: string, minConfidence: number = 0.8): Promise<Reconciliation[]> {
    const suggestions = await this.generateSuggestions(organizationId);
    const reconciled: Reconciliation[] = [];
    const usedInvoices = new Set<string>();
    const usedPayments = new Set<string>();

    for (const suggestion of suggestions) {
      if (suggestion.confidence < minConfidence) continue;
      if (usedInvoices.has(suggestion.invoiceId)) continue;
      if (usedPayments.has(suggestion.paymentId)) continue;

      const reconciliation = await this.createReconciliation(
        organizationId,
        suggestion.invoiceId,
        suggestion.paymentId,
        'auto'
      );

      if (reconciliation) {
        reconciled.push(reconciliation);
        usedInvoices.add(suggestion.invoiceId);
        usedPayments.add(suggestion.paymentId);
      }
    }

    return reconciled;
  }

  /**
   * Create a manual reconciliation between invoice and payment
   */
  async createReconciliation(
    organizationId: string,
    invoiceId: string,
    paymentId: string,
    matchedBy: 'auto' | 'manual',
    notes: string = ''
  ): Promise<Reconciliation | null> {
    const invoice = await mongoStore.getInvoice(organizationId, invoiceId);
    const payment = await mongoStore.getPayment(organizationId, paymentId);

    if (!invoice || !payment) {
      return null;
    }

    const amountDiff = payment.amount - invoice.amount;
    const matchType = this.determineMatchType(invoice.amount, payment.amount);
    const discrepancyType = this.determineDiscrepancyType(
      amountDiff,
      invoice,
      payment
    );

    const reconciliation = await mongoStore.createReconciliation(organizationId, {
      invoiceId,
      paymentId,
      matchedAmount: Math.min(invoice.amount, payment.amount),
      matchType,
      matchConfidence: matchedBy === 'auto' ? 0.9 : 1,
      discrepancyAmount: amountDiff,
      discrepancyType,
      status:
        Math.abs(amountDiff) > AMOUNT_TOLERANCE ? 'pending_review' : 'approved',
      notes,
      matchedBy,
    });

    // Update invoice and payment statuses
    if (Math.abs(amountDiff) <= AMOUNT_TOLERANCE) {
      await mongoStore.updateInvoiceStatus(organizationId, invoiceId, 'matched');
      await mongoStore.updatePaymentStatus(organizationId, paymentId, 'matched');
    } else if (payment.amount < invoice.amount) {
      await mongoStore.updateInvoiceStatus(organizationId, invoiceId, 'partially_matched');
      await mongoStore.updatePaymentStatus(organizationId, paymentId, 'matched');
    } else {
      await mongoStore.updateInvoiceStatus(organizationId, invoiceId, 'matched');
      await mongoStore.updatePaymentStatus(organizationId, paymentId, 'partially_matched');
    }

    // Create exception if there's a significant discrepancy
    if (Math.abs(amountDiff) > AMOUNT_TOLERANCE) {
      await this.createDiscrepancyException(
        organizationId,
        reconciliation,
        invoice,
        payment,
        amountDiff
      );
    }

    return reconciliation;
  }

  /**
   * Create an exception for amount discrepancy
   */
  private async createDiscrepancyException(
    organizationId: string,
    reconciliation: Reconciliation,
    invoice: Invoice,
    payment: Payment,
    amountDiff: number
  ): Promise<Exception> {
    const severity =
      Math.abs(amountDiff) > 1000
        ? 'high'
        : Math.abs(amountDiff) > 100
        ? 'medium'
        : 'low';

    const type = 'amount_discrepancy';
    const description =
      amountDiff > 0
        ? `Overpayment of ${Math.abs(amountDiff).toFixed(2)} ${
            payment.currency
          } for invoice ${invoice.invoiceNumber}`
        : `Underpayment of ${Math.abs(amountDiff).toFixed(2)} ${
            payment.currency
          } for invoice ${invoice.invoiceNumber}`;

    const suggestedAction =
      amountDiff > 0
        ? 'Issue credit note or apply to future invoices'
        : 'Request additional payment or write off balance';

    return mongoStore.createException(organizationId, {
      type,
      severity,
      invoiceId: invoice.id,
      paymentId: payment.id,
      reconciliationId: reconciliation.id,
      description,
      suggestedAction,
      status: 'open',
    });
  }

  /**
   * Determine the type of match based on amounts
   */
  private determineMatchType(
    invoiceAmount: number,
    paymentAmount: number
  ): MatchType {
    const diff = paymentAmount - invoiceAmount;
    if (Math.abs(diff) <= AMOUNT_TOLERANCE) return 'exact';
    if (diff > 0) return 'overpayment';
    return 'underpayment';
  }

  /**
   * Determine discrepancy type if any
   */
  private determineDiscrepancyType(
    amountDiff: number,
    invoice: Invoice,
    payment: Payment
  ): DiscrepancyType | undefined {
    if (Math.abs(amountDiff) <= AMOUNT_TOLERANCE) return undefined;
    if (invoice.currency !== payment.currency) return 'currency_mismatch';
    return 'amount_mismatch';
  }

  /**
   * Simple fuzzy string matching
   */
  private fuzzyMatch(str1: string, str2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const n1 = normalize(str1);
    const n2 = normalize(str2);
    return n2.includes(n1) || n1.includes(n2);
  }

  /**
   * Calculate days between two dates
   */
  private daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Generate dashboard statistics
   */
  async getDashboardStats(organizationId: string): Promise<DashboardStats> {
    const invoices = await mongoStore.getAllInvoices(organizationId);
    const payments = await mongoStore.getAllPayments(organizationId);
    const reconciliations = await mongoStore.getAllReconciliations(organizationId);
    const exceptions = await mongoStore.getAllExceptions(organizationId);

    const totalInvoiceAmount = invoices.reduce(
      (sum, inv) => sum + inv.amount,
      0
    );
    const totalPaymentAmount = payments.reduce(
      (sum, pay) => sum + pay.amount,
      0
    );
    const reconciledAmount = reconciliations.reduce(
      (sum, rec) => sum + rec.matchedAmount,
      0
    );

    const matchedInvoices = invoices.filter(
      (inv) => inv.status === 'matched' || inv.status === 'partially_matched'
    );
    const unreconciledInvoices = invoices.filter(
      (inv) => inv.status === 'pending'
    );
    const unreconciledPayments = payments.filter(
      (pay) => pay.status === 'pending' || pay.status === 'unmatched'
    );

    return {
      totalInvoices: invoices.length,
      totalPayments: payments.length,
      totalReconciled: reconciliations.length,
      totalExceptions: exceptions.filter((e) => e.status === 'open').length,
      totalInvoiceAmount,
      totalPaymentAmount,
      reconciledAmount,
      unreconciledInvoiceAmount: unreconciledInvoices.reduce(
        (sum, inv) => sum + inv.amount,
        0
      ),
      unreconciledPaymentAmount: unreconciledPayments.reduce(
        (sum, pay) => sum + pay.amount,
        0
      ),
      matchRate:
        invoices.length > 0
          ? (matchedInvoices.length / invoices.length) * 100
          : 0,
      avgProcessingTime: 2.5, // Mock value - would be calculated from actual timestamps
    };
  }

  /**
   * Identify and create exceptions for unmatched items
   */
  async identifyExceptions(organizationId: string): Promise<Exception[]> {
    const newExceptions: Exception[] = [];
    const unreconciledInvoices = await mongoStore.getUnreconciledInvoices(organizationId);
    const unreconciledPayments = await mongoStore.getUnreconciledPayments(organizationId);
    const existingExceptions = await mongoStore.getAllExceptions(organizationId);

    // Check for overdue unmatched invoices
    const today = new Date();
    for (const invoice of unreconciledInvoices) {
      const dueDate = new Date(invoice.dueDate);
      const hasException = existingExceptions.some(
        (e) => e.invoiceId === invoice.id && e.status !== 'resolved'
      );

      if (!hasException && dueDate < today) {
        const exception = await mongoStore.createException(organizationId, {
          type: 'unmatched_invoice',
          severity:
            this.daysBetween(invoice.dueDate, today.toISOString()) > 30
              ? 'high'
              : 'medium',
          invoiceId: invoice.id,
          description: `Invoice ${invoice.invoiceNumber} is overdue and has no matching payment`,
          suggestedAction: 'Review payment records or follow up with payer',
          status: 'open',
        });
        newExceptions.push(exception);
      }
    }

    // Check for unmatched payments
    for (const payment of unreconciledPayments) {
      const hasException = existingExceptions.some(
        (e) => e.paymentId === payment.id && e.status !== 'resolved'
      );

      if (!hasException) {
        const exception = await mongoStore.createException(organizationId, {
          type: 'unmatched_payment',
          severity: payment.amount > 10000 ? 'high' : 'medium',
          paymentId: payment.id,
          description: `Payment ${payment.paymentReference} has no matching invoice`,
          suggestedAction: 'Identify corresponding invoice or process refund',
          status: 'open',
        });
        newExceptions.push(exception);
      }
    }

    return newExceptions;
  }
}

export const reconciliationEngine = new ReconciliationEngine();
