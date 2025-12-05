import { nanoid } from 'nanoid';
import type { 
  Invoice, 
  Payment, 
  Reconciliation, 
  Exception,
  InvoiceStatus,
  PaymentStatus,
  ReconciliationStatus,
  ExceptionStatus
} from './types.js';

// In-memory store (replace with database in production)
class Store {
  private invoices: Map<string, Invoice> = new Map();
  private payments: Map<string, Payment> = new Map();
  private reconciliations: Map<string, Reconciliation> = new Map();
  private exceptions: Map<string, Exception> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {
    // Seed sample invoices
    const sampleInvoices: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        invoiceNumber: 'INV-2024-001',
        vendorName: 'Acme Corporation',
        vendorId: 'V001',
        amount: 15750.00,
        currency: 'USD',
        issueDate: '2024-01-15',
        dueDate: '2024-02-15',
        description: 'Q1 Software License Renewal',
        lineItems: [
          { id: nanoid(), description: 'Enterprise License', quantity: 1, unitPrice: 12000, amount: 12000 },
          { id: nanoid(), description: 'Support Package', quantity: 1, unitPrice: 3750, amount: 3750 }
        ],
        status: 'pending'
      },
      {
        invoiceNumber: 'INV-2024-002',
        vendorName: 'TechFlow Systems',
        vendorId: 'V002',
        amount: 8500.00,
        currency: 'USD',
        issueDate: '2024-01-20',
        dueDate: '2024-02-20',
        description: 'Cloud Infrastructure Services',
        lineItems: [
          { id: nanoid(), description: 'Cloud Hosting', quantity: 1, unitPrice: 6000, amount: 6000 },
          { id: nanoid(), description: 'CDN Services', quantity: 1, unitPrice: 2500, amount: 2500 }
        ],
        status: 'pending'
      },
      {
        invoiceNumber: 'INV-2024-003',
        vendorName: 'Global Supplies Inc',
        vendorId: 'V003',
        amount: 3250.75,
        currency: 'USD',
        issueDate: '2024-01-25',
        dueDate: '2024-02-25',
        description: 'Office Equipment Purchase',
        lineItems: [
          { id: nanoid(), description: 'Standing Desks', quantity: 5, unitPrice: 450, amount: 2250 },
          { id: nanoid(), description: 'Ergonomic Chairs', quantity: 5, unitPrice: 200.15, amount: 1000.75 }
        ],
        status: 'pending'
      },
      {
        invoiceNumber: 'INV-2024-004',
        vendorName: 'DataCore Analytics',
        vendorId: 'V004',
        amount: 22000.00,
        currency: 'USD',
        issueDate: '2024-02-01',
        dueDate: '2024-03-01',
        description: 'Data Analytics Platform Subscription',
        lineItems: [
          { id: nanoid(), description: 'Platform License', quantity: 1, unitPrice: 18000, amount: 18000 },
          { id: nanoid(), description: 'Premium Support', quantity: 1, unitPrice: 4000, amount: 4000 }
        ],
        status: 'pending'
      },
      {
        invoiceNumber: 'INV-2024-005',
        vendorName: 'Acme Corporation',
        vendorId: 'V001',
        amount: 4500.00,
        currency: 'USD',
        issueDate: '2024-02-05',
        dueDate: '2024-03-05',
        description: 'Additional User Licenses',
        lineItems: [
          { id: nanoid(), description: 'User License Pack (10)', quantity: 1, unitPrice: 4500, amount: 4500 }
        ],
        status: 'pending'
      }
    ];

    sampleInvoices.forEach(inv => {
      const id = nanoid();
      const now = new Date().toISOString();
      this.invoices.set(id, { ...inv, id, createdAt: now, updatedAt: now });
    });

    // Seed sample payments
    const samplePayments: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        paymentReference: 'PAY-2024-001',
        payerName: 'Internal Accounts',
        payerId: 'P001',
        amount: 15750.00,
        currency: 'USD',
        paymentDate: '2024-02-10',
        paymentMethod: 'bank_transfer',
        bankReference: 'BNK-TRF-89234',
        description: 'Payment for INV-2024-001',
        status: 'pending'
      },
      {
        paymentReference: 'PAY-2024-002',
        payerName: 'Internal Accounts',
        payerId: 'P001',
        amount: 8000.00,
        currency: 'USD',
        paymentDate: '2024-02-15',
        paymentMethod: 'bank_transfer',
        bankReference: 'BNK-TRF-89235',
        description: 'Partial payment for cloud services',
        status: 'pending'
      },
      {
        paymentReference: 'PAY-2024-003',
        payerName: 'Internal Accounts',
        payerId: 'P001',
        amount: 3250.75,
        currency: 'USD',
        paymentDate: '2024-02-20',
        paymentMethod: 'check',
        bankReference: 'CHK-45678',
        description: 'Office equipment payment',
        status: 'pending'
      },
      {
        paymentReference: 'PAY-2024-004',
        payerName: 'Internal Accounts',
        payerId: 'P001',
        amount: 25000.00,
        currency: 'USD',
        paymentDate: '2024-02-25',
        paymentMethod: 'bank_transfer',
        bankReference: 'BNK-TRF-89236',
        description: 'DataCore platform payment',
        status: 'pending'
      },
      {
        paymentReference: 'PAY-2024-005',
        payerName: 'Internal Accounts',
        payerId: 'P001',
        amount: 5500.00,
        currency: 'USD',
        paymentDate: '2024-02-28',
        paymentMethod: 'direct_debit',
        bankReference: 'DD-78901',
        description: 'Miscellaneous vendor payment',
        status: 'pending'
      }
    ];

    samplePayments.forEach(pay => {
      const id = nanoid();
      const now = new Date().toISOString();
      this.payments.set(id, { ...pay, id, createdAt: now, updatedAt: now });
    });
  }

  // Invoice methods
  getAllInvoices(): Invoice[] {
    return Array.from(this.invoices.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getInvoice(id: string): Invoice | undefined {
    return this.invoices.get(id);
  }

  createInvoice(invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>): Invoice {
    const id = nanoid();
    const now = new Date().toISOString();
    const newInvoice: Invoice = { ...invoice, id, createdAt: now, updatedAt: now };
    this.invoices.set(id, newInvoice);
    return newInvoice;
  }

  updateInvoice(id: string, updates: Partial<Invoice>): Invoice | undefined {
    const invoice = this.invoices.get(id);
    if (!invoice) return undefined;
    const updated = { ...invoice, ...updates, updatedAt: new Date().toISOString() };
    this.invoices.set(id, updated);
    return updated;
  }

  updateInvoiceStatus(id: string, status: InvoiceStatus): Invoice | undefined {
    return this.updateInvoice(id, { status });
  }

  // Payment methods
  getAllPayments(): Payment[] {
    return Array.from(this.payments.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getPayment(id: string): Payment | undefined {
    return this.payments.get(id);
  }

  createPayment(payment: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Payment {
    const id = nanoid();
    const now = new Date().toISOString();
    const newPayment: Payment = { ...payment, id, createdAt: now, updatedAt: now };
    this.payments.set(id, newPayment);
    return newPayment;
  }

  updatePayment(id: string, updates: Partial<Payment>): Payment | undefined {
    const payment = this.payments.get(id);
    if (!payment) return undefined;
    const updated = { ...payment, ...updates, updatedAt: new Date().toISOString() };
    this.payments.set(id, updated);
    return updated;
  }

  updatePaymentStatus(id: string, status: PaymentStatus): Payment | undefined {
    return this.updatePayment(id, { status });
  }

  // Reconciliation methods
  getAllReconciliations(): Reconciliation[] {
    return Array.from(this.reconciliations.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getReconciliation(id: string): Reconciliation | undefined {
    return this.reconciliations.get(id);
  }

  createReconciliation(reconciliation: Omit<Reconciliation, 'id' | 'createdAt' | 'updatedAt'>): Reconciliation {
    const id = nanoid();
    const now = new Date().toISOString();
    const newReconciliation: Reconciliation = { ...reconciliation, id, createdAt: now, updatedAt: now };
    this.reconciliations.set(id, newReconciliation);
    return newReconciliation;
  }

  updateReconciliationStatus(id: string, status: ReconciliationStatus): Reconciliation | undefined {
    const reconciliation = this.reconciliations.get(id);
    if (!reconciliation) return undefined;
    const updated = { ...reconciliation, status, updatedAt: new Date().toISOString() };
    this.reconciliations.set(id, updated);
    return updated;
  }

  // Exception methods
  getAllExceptions(): Exception[] {
    return Array.from(this.exceptions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getException(id: string): Exception | undefined {
    return this.exceptions.get(id);
  }

  createException(exception: Omit<Exception, 'id' | 'createdAt'>): Exception {
    const id = nanoid();
    const now = new Date().toISOString();
    const newException: Exception = { ...exception, id, createdAt: now };
    this.exceptions.set(id, newException);
    return newException;
  }

  updateExceptionStatus(id: string, status: ExceptionStatus, resolvedBy?: string): Exception | undefined {
    const exception = this.exceptions.get(id);
    if (!exception) return undefined;
    const updated: Exception = { 
      ...exception, 
      status,
      ...(status === 'resolved' && resolvedBy ? { resolvedBy, resolvedAt: new Date().toISOString() } : {})
    };
    this.exceptions.set(id, updated);
    return updated;
  }

  // Utility methods
  getUnreconciledInvoices(): Invoice[] {
    return this.getAllInvoices().filter(inv => inv.status === 'pending');
  }

  getUnreconciledPayments(): Payment[] {
    return this.getAllPayments().filter(pay => pay.status === 'pending' || pay.status === 'unmatched');
  }
}

export const store = new Store();

