import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { store } from './store.js';
import { reconciliationEngine } from './reconciliation-engine.js';
import { processorRegistry } from './processors/index.js';
import { workflowEngine } from './workflows/engine.js';
import { getR2, initR2 } from './storage/r2.js';
import type { Invoice, Payment, ExceptionStatus, ReconciliationStatus } from './types.js';
import type { DocumentType } from './processors/types.js';

const app = new Hono();

// Initialize R2 if configured
if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME) {
  initR2({
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
  });
  console.log('✅ R2 storage initialized');
}

// Middleware
app.use('*', cors());
app.use('*', logger());

// Health check
app.get('/', (c) => c.json({ 
  status: 'ok', 
  service: 'Invoice Reconciliation Engine',
  version: '2.0.0',
  processors: processorRegistry.getAll().map(p => p.config),
  workflows: workflowEngine.getAllWorkflows().map(w => ({ id: w.id, name: w.name })),
}));

// ============ Dashboard ============
app.get('/api/dashboard/stats', (c) => {
  const stats = reconciliationEngine.getDashboardStats();
  return c.json(stats);
});

// ============ Processors ============
app.get('/api/processors', (c) => {
  const processors = processorRegistry.getAll().map(p => p.config);
  return c.json(processors);
});

// ============ Workflows ============
app.get('/api/workflows', (c) => {
  const workflows = workflowEngine.getAllWorkflows();
  return c.json(workflows);
});

app.get('/api/workflows/:id', (c) => {
  const workflow = workflowEngine.getWorkflow(c.req.param('id'));
  if (!workflow) {
    return c.json({ error: 'Workflow not found' }, 404);
  }
  return c.json(workflow);
});

app.get('/api/workflows/executions', (c) => {
  const executions = workflowEngine.getAllExecutions();
  return c.json(executions);
});

app.get('/api/workflows/executions/:id', (c) => {
  const execution = workflowEngine.getExecution(c.req.param('id'));
  if (!execution) {
    return c.json({ error: 'Execution not found' }, 404);
  }
  return c.json(execution);
});

// ============ PDF Upload & Processing ============

// Upload and process PDF
app.post('/api/upload/process', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const documentType = formData.get('documentType') as DocumentType | null;
    const workflowId = formData.get('workflowId') as string | null;
    const processorId = formData.get('processorId') as string | null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const selectedWorkflow = workflowId || (documentType === 'payment' ? 'payment-processing' : 'invoice-processing');

    const execution = await workflowEngine.execute(
      selectedWorkflow,
      {
        fileBuffer: buffer,
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        metadata: { documentType },
      },
      { processorId: processorId || undefined }
    );

    return c.json({
      success: execution.status === 'completed',
      execution,
    });
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    }, 500);
  }
});

// Upload PDF only (no processing)
app.post('/api/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const r2 = getR2();
    const result = await r2.upload(buffer, {
      fileName: file.name,
      prefix: 'uploads',
      contentType: file.type || 'application/pdf',
    });

    return c.json({ success: true, ...result });
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    }, 500);
  }
});

// Process already uploaded file
app.post('/api/upload/:fileKey/process', async (c) => {
  try {
    const fileKey = c.req.param('fileKey');
    const body = await c.req.json<{
      documentType?: DocumentType;
      workflowId?: string;
      processorId?: string;
    }>().catch(() => ({}));

    const r2 = getR2();
    const buffer = await r2.get(fileKey);
    const metadata = await r2.getMetadata(fileKey);

    const selectedWorkflow = body.workflowId || 
      (body.documentType === 'payment' ? 'payment-processing' : 'invoice-processing');

    const execution = await workflowEngine.execute(
      selectedWorkflow,
      {
        fileKey,
        fileBuffer: buffer,
        fileName: metadata.metadata?.originalName || 'document.pdf',
        mimeType: metadata.contentType,
        metadata: { documentType: body.documentType },
      },
      { processorId: body.processorId }
    );

    return c.json({
      success: execution.status === 'completed',
      execution,
    });
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Processing failed' 
    }, 500);
  }
});

// Get presigned upload URL
app.post('/api/upload/presign', async (c) => {
  try {
    const body = await c.req.json<{ fileName: string; contentType?: string }>();
    const r2 = getR2();
    
    const fileId = `uploads/${Date.now()}-${body.fileName}`;
    const url = await r2.getUploadUrl(fileId, {
      contentType: body.contentType || 'application/pdf',
      expiresIn: 3600,
    });

    return c.json({ url, fileKey: fileId });
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to generate URL' 
    }, 500);
  }
});

// List uploaded files
app.get('/api/uploads', async (c) => {
  try {
    const prefix = c.req.query('prefix') || 'uploads';
    const r2 = getR2();
    const result = await r2.list(prefix);
    return c.json(result);
  } catch (error) {
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to list files' 
    }, 500);
  }
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
console.log(`🚀 Invoice Reconciliation Engine v2.0 running on http://localhost:${port}`);
console.log(`📦 Processors: ${processorRegistry.getAll().map(p => p.config.id).join(', ')}`);
console.log(`🔄 Workflows: ${workflowEngine.getAllWorkflows().map(w => w.id).join(', ')}`);

serve({
  fetch: app.fetch,
  port
});
