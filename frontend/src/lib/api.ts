import type { 
  Invoice, 
  Payment, 
  Reconciliation, 
  Exception, 
  DashboardStats, 
  ReconciliationSuggestion,
  ExceptionStatus,
  ReconciliationStatus 
} from '@/types';

const API_BASE = 'http://localhost:3456/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include', // Send cookies with requests
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  // Handle auth errors
  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (response.status === 403) {
    window.location.href = '/select-org';
    throw new Error('No organization selected');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'API request failed');
  }

  return response.json();
}

// Dashboard
export const getDashboardStats = () => fetchApi<DashboardStats>('/dashboard/stats');

// Invoices
export const getInvoices = () => fetchApi<Invoice[]>('/invoices');
export const getInvoice = (id: string) => fetchApi<Invoice>(`/invoices/${id}`);
export const createInvoice = (invoice: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>) => 
  fetchApi<Invoice>('/invoices', { method: 'POST', body: JSON.stringify(invoice) });
export const updateInvoice = (id: string, updates: Partial<Invoice>) =>
  fetchApi<Invoice>(`/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });

// Payments
export const getPayments = () => fetchApi<Payment[]>('/payments');
export const getPayment = (id: string) => fetchApi<Payment>(`/payments/${id}`);
export const createPayment = (payment: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>) =>
  fetchApi<Payment>('/payments', { method: 'POST', body: JSON.stringify(payment) });
export const updatePayment = (id: string, updates: Partial<Payment>) =>
  fetchApi<Payment>(`/payments/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });

// Reconciliations
export const getReconciliations = () => fetchApi<Reconciliation[]>('/reconciliations');
export const getReconciliation = (id: string) => fetchApi<Reconciliation>(`/reconciliations/${id}`);
export const getSuggestions = () => fetchApi<ReconciliationSuggestion[]>('/reconciliations/suggestions');
export const autoReconcile = (minConfidence?: number) =>
  fetchApi<{ message: string; reconciliations: Reconciliation[] }>(
    '/reconciliations/auto',
    { method: 'POST', body: JSON.stringify({ minConfidence }) }
  );
export const createReconciliation = (invoiceId: string, paymentId: string, notes?: string) =>
  fetchApi<Reconciliation>('/reconciliations', {
    method: 'POST',
    body: JSON.stringify({ invoiceId, paymentId, notes }),
  });
export const updateReconciliationStatus = (id: string, status: ReconciliationStatus) =>
  fetchApi<Reconciliation>(`/reconciliations/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

// Exceptions
export const getExceptions = () => fetchApi<Exception[]>('/exceptions');
export const getException = (id: string) => fetchApi<Exception>(`/exceptions/${id}`);
export const identifyExceptions = () =>
  fetchApi<{ message: string; exceptions: Exception[] }>('/exceptions/identify', { method: 'POST' });
export const updateExceptionStatus = (id: string, status: ExceptionStatus, resolvedBy?: string) =>
  fetchApi<Exception>(`/exceptions/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, resolvedBy }),
  });

// Bulk Import
export const importInvoices = (invoices: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>[]) =>
  fetchApi<{ message: string; invoices: Invoice[] }>('/import/invoices', {
    method: 'POST',
    body: JSON.stringify({ invoices }),
  });
export const importPayments = (payments: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>[]) =>
  fetchApi<{ message: string; payments: Payment[] }>('/import/payments', {
    method: 'POST',
    body: JSON.stringify({ payments }),
  });

