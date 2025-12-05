import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { store } from './store.js';
import { reconciliationEngine } from './reconciliation-engine.js';
import type { Invoice, Payment, ExceptionStatus, ReconciliationStatus } from './types.js';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'Invoice Reconciliation Engine' }));

// ============ Dashboard ============
app.get('/api/dashboard/stats', (c) => {
  const stats = reconciliationEngine.getDashboardStats();
  return c.json(stats);
});

// ============ Invoices ============
app.get('/api/invoices', (c) => {
  const invoices = store.getAllInvoices();
  return c.json(invoices);
});

app.get('/api/invoices/:id', (c) => {
  const invoice = store.getInvoice(c.req.param('id'));
  if (!invoice) {
    return c.json({ error: 'Invoice not found' }, 404);
  }
  return c.json(invoice);
});

app.post('/api/invoices', async (c) => {
  const body = await c.req.json<Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>>();
  const invoice = store.createInvoice(body);
  return c.json(invoice, 201);
});

app.patch('/api/invoices/:id', async (c) => {
  const body = await c.req.json<Partial<Invoice>>();
  const invoice = store.updateInvoice(c.req.param('id'), body);
  if (!invoice) {
    return c.json({ error: 'Invoice not found' }, 404);
  }
  return c.json(invoice);
});

// ============ Payments ============
app.get('/api/payments', (c) => {
  const payments = store.getAllPayments();
  return c.json(payments);
});

app.get('/api/payments/:id', (c) => {
  const payment = store.getPayment(c.req.param('id'));
  if (!payment) {
    return c.json({ error: 'Payment not found' }, 404);
  }
  return c.json(payment);
});

app.post('/api/payments', async (c) => {
  const body = await c.req.json<Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>>();
  const payment = store.createPayment(body);
  return c.json(payment, 201);
});

app.patch('/api/payments/:id', async (c) => {
  const body = await c.req.json<Partial<Payment>>();
  const payment = store.updatePayment(c.req.param('id'), body);
  if (!payment) {
    return c.json({ error: 'Payment not found' }, 404);
  }
  return c.json(payment);
});

// ============ Reconciliation ============
app.get('/api/reconciliations', (c) => {
  const reconciliations = store.getAllReconciliations();
  return c.json(reconciliations);
});

// Get match suggestions - must be before /:id route
app.get('/api/reconciliations/suggestions', (c) => {
  const suggestions = reconciliationEngine.generateSuggestions();
  return c.json(suggestions);
});

app.get('/api/reconciliations/:id', (c) => {
  const reconciliation = store.getReconciliation(c.req.param('id'));
  if (!reconciliation) {
    return c.json({ error: 'Reconciliation not found' }, 404);
  }
  return c.json(reconciliation);
});

// Auto-reconcile with confidence threshold
app.post('/api/reconciliations/auto', async (c) => {
  const body = await c.req.json<{ minConfidence?: number }>().catch(() => ({}));
  const reconciled = reconciliationEngine.autoReconcile(body.minConfidence);
  return c.json({ 
    message: `Auto-reconciled ${reconciled.length} items`,
    reconciliations: reconciled 
  });
});

// Manual reconciliation
app.post('/api/reconciliations', async (c) => {
  const body = await c.req.json<{ invoiceId: string; paymentId: string; notes?: string }>();
  const reconciliation = reconciliationEngine.createReconciliation(
    body.invoiceId,
    body.paymentId,
    'manual',
    body.notes
  );
  if (!reconciliation) {
    return c.json({ error: 'Failed to create reconciliation. Check invoice and payment IDs.' }, 400);
  }
  return c.json(reconciliation, 201);
});

// Update reconciliation status
app.patch('/api/reconciliations/:id/status', async (c) => {
  const body = await c.req.json<{ status: ReconciliationStatus }>();
  const reconciliation = store.updateReconciliationStatus(c.req.param('id'), body.status);
  if (!reconciliation) {
    return c.json({ error: 'Reconciliation not found' }, 404);
  }
  return c.json(reconciliation);
});

// ============ Exceptions ============
app.get('/api/exceptions', (c) => {
  const exceptions = store.getAllExceptions();
  return c.json(exceptions);
});

app.get('/api/exceptions/:id', (c) => {
  const exception = store.getException(c.req.param('id'));
  if (!exception) {
    return c.json({ error: 'Exception not found' }, 404);
  }
  return c.json(exception);
});

// Identify and create new exceptions
app.post('/api/exceptions/identify', (c) => {
  const newExceptions = reconciliationEngine.identifyExceptions();
  return c.json({
    message: `Identified ${newExceptions.length} new exceptions`,
    exceptions: newExceptions
  });
});

// Update exception status
app.patch('/api/exceptions/:id/status', async (c) => {
  const body = await c.req.json<{ status: ExceptionStatus; resolvedBy?: string }>();
  const exception = store.updateExceptionStatus(c.req.param('id'), body.status, body.resolvedBy);
  if (!exception) {
    return c.json({ error: 'Exception not found' }, 404);
  }
  return c.json(exception);
});

// ============ Bulk Import ============
app.post('/api/import/invoices', async (c) => {
  const body = await c.req.json<{ invoices: Omit<Invoice, 'id' | 'createdAt' | 'updatedAt'>[] }>();
  const created = body.invoices.map(inv => store.createInvoice(inv));
  return c.json({ message: `Imported ${created.length} invoices`, invoices: created }, 201);
});

app.post('/api/import/payments', async (c) => {
  const body = await c.req.json<{ payments: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>[] }>();
  const created = body.payments.map(pay => store.createPayment(pay));
  return c.json({ message: `Imported ${created.length} payments`, payments: created }, 201);
});

// Start server
const port = 3456;
console.log(`🚀 Invoice Reconciliation Engine running on http://localhost:${port}`);

serve({
  fetch: app.fetch,
  port
});

