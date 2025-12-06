import { nanoid } from 'nanoid';
import { collections, OrgInvoice, OrgPayment, OrgReconciliation, OrgException } from '../lib/db.js';
import type {
  Invoice,
  Payment,
  Reconciliation,
  Exception,
  InvoiceStatus,
  PaymentStatus,
  ReconciliationStatus,
  ExceptionStatus,
} from '../types.js';

export class MongoStore {
  // ============ Invoice Methods ============
  async getAllInvoices(organizationId: string): Promise<OrgInvoice[]> {
    return collections.invoices()
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getInvoice(organizationId: string, id: string): Promise<OrgInvoice | null> {
    return collections.invoices().findOne({ id, organizationId });
  }

  async createInvoice(
    organizationId: string,
    invoice: Omit<Invoice, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
  ): Promise<OrgInvoice> {
    const now = new Date().toISOString();
    const doc: OrgInvoice = {
      ...invoice,
      id: nanoid(),
      organizationId,
      createdAt: now,
      updatedAt: now,
    };
    await collections.invoices().insertOne(doc);
    return doc;
  }

  async updateInvoice(
    organizationId: string,
    id: string,
    updates: Partial<Invoice>
  ): Promise<OrgInvoice | null> {
    const result = await collections.invoices().findOneAndUpdate(
      { id, organizationId },
      { $set: { ...updates, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    );
    return result ?? null;
  }

  async updateInvoiceStatus(
    organizationId: string,
    id: string,
    status: InvoiceStatus
  ): Promise<OrgInvoice | null> {
    return this.updateInvoice(organizationId, id, { status });
  }

  // ============ Payment Methods ============
  async getAllPayments(organizationId: string): Promise<OrgPayment[]> {
    return collections.payments()
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getPayment(organizationId: string, id: string): Promise<OrgPayment | null> {
    return collections.payments().findOne({ id, organizationId });
  }

  async createPayment(
    organizationId: string,
    payment: Omit<Payment, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
  ): Promise<OrgPayment> {
    const now = new Date().toISOString();
    const doc: OrgPayment = {
      ...payment,
      id: nanoid(),
      organizationId,
      createdAt: now,
      updatedAt: now,
    };
    await collections.payments().insertOne(doc);
    return doc;
  }

  async updatePayment(
    organizationId: string,
    id: string,
    updates: Partial<Payment>
  ): Promise<OrgPayment | null> {
    const result = await collections.payments().findOneAndUpdate(
      { id, organizationId },
      { $set: { ...updates, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    );
    return result ?? null;
  }

  async updatePaymentStatus(
    organizationId: string,
    id: string,
    status: PaymentStatus
  ): Promise<OrgPayment | null> {
    return this.updatePayment(organizationId, id, { status });
  }

  // ============ Reconciliation Methods ============
  async getAllReconciliations(organizationId: string): Promise<OrgReconciliation[]> {
    return collections.reconciliations()
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getReconciliation(organizationId: string, id: string): Promise<OrgReconciliation | null> {
    return collections.reconciliations().findOne({ id, organizationId });
  }

  async createReconciliation(
    organizationId: string,
    reconciliation: Omit<Reconciliation, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
  ): Promise<OrgReconciliation> {
    const now = new Date().toISOString();
    const doc: OrgReconciliation = {
      ...reconciliation,
      id: nanoid(),
      organizationId,
      createdAt: now,
      updatedAt: now,
    };
    await collections.reconciliations().insertOne(doc);
    return doc;
  }

  async updateReconciliationStatus(
    organizationId: string,
    id: string,
    status: ReconciliationStatus
  ): Promise<OrgReconciliation | null> {
    const result = await collections.reconciliations().findOneAndUpdate(
      { id, organizationId },
      { $set: { status, updatedAt: new Date().toISOString() } },
      { returnDocument: 'after' }
    );
    return result ?? null;
  }

  // ============ Exception Methods ============
  async getAllExceptions(organizationId: string): Promise<OrgException[]> {
    return collections.exceptions()
      .find({ organizationId })
      .sort({ createdAt: -1 })
      .toArray();
  }

  async getException(organizationId: string, id: string): Promise<OrgException | null> {
    return collections.exceptions().findOne({ id, organizationId });
  }

  async createException(
    organizationId: string,
    exception: Omit<Exception, 'id' | 'organizationId' | 'createdAt'>
  ): Promise<OrgException> {
    const now = new Date().toISOString();
    const doc: OrgException = {
      ...exception,
      id: nanoid(),
      organizationId,
      createdAt: now,
    };
    await collections.exceptions().insertOne(doc);
    return doc;
  }

  async updateExceptionStatus(
    organizationId: string,
    id: string,
    status: ExceptionStatus,
    resolvedBy?: string
  ): Promise<OrgException | null> {
    const updates: Partial<OrgException> = { status };
    if (status === 'resolved' && resolvedBy) {
      updates.resolvedBy = resolvedBy;
      updates.resolvedAt = new Date().toISOString();
    }
    const result = await collections.exceptions().findOneAndUpdate(
      { id, organizationId },
      { $set: updates },
      { returnDocument: 'after' }
    );
    return result ?? null;
  }

  // ============ Utility Methods ============
  async getUnreconciledInvoices(organizationId: string): Promise<OrgInvoice[]> {
    return collections.invoices()
      .find({ organizationId, status: 'pending' })
      .toArray();
  }

  async getUnreconciledPayments(organizationId: string): Promise<OrgPayment[]> {
    return collections.payments()
      .find({ organizationId, status: { $in: ['pending', 'unmatched'] } })
      .toArray();
  }
}

export const mongoStore = new MongoStore();
