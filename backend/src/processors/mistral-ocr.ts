import { Mistral } from '@mistralai/mistralai';
import {
  BaseProcessor,
  ProcessorConfig,
  ProcessorContext,
  ProcessingResult,
  DocumentClassification,
  DocumentType,
  ExtractedInvoice,
  ExtractedPayment,
  ExtractedRemittance,
  ExtractedInvoiceSchema,
  ExtractedPaymentSchema,
  ExtractedRemittanceSchema,
  processorRegistry,
} from './types.js';

// ============ Mistral OCR Processor ============

export class MistralOCRProcessor extends BaseProcessor {
  readonly config: ProcessorConfig = {
    id: 'mistral-ocr',
    name: 'Mistral OCR + LLM',
    description: 'Uses Mistral AI OCR API for document processing and LLM for structured extraction',
    supportedTypes: ['invoice', 'payment', 'statement', 'remittance'],
  };

  private client: Mistral | null = null;
  private ocrModel: string = 'mistral-ocr-latest'; // Dedicated OCR model
  private textModel: string = 'mistral-large-latest'; // For structured extraction

  constructor(apiKey?: string) {
    super();
    if (apiKey) {
      this.client = new Mistral({ apiKey });
    }
  }

  private getClient(): Mistral {
    if (!this.client) {
      const apiKey = process.env.MISTRAL_API_KEY;
      if (!apiKey) {
        throw new Error('MISTRAL_API_KEY not configured');
      }
      this.client = new Mistral({ apiKey });
    }
    return this.client;
  }

  /**
   * Perform OCR on a document URL using Mistral's dedicated OCR API
   */
  private async performOCR(documentUrl: string): Promise<string> {
    const client = this.getClient();

    const ocrResponse = await client.ocr.process({
      model: this.ocrModel,
      document: {
        type: 'document_url',
        documentUrl,
      },
    });

    // Combine all pages' markdown content
    const markdown = ocrResponse.pages
      .map((page) => page.markdown)
      .join('\n\n---\n\n');

    return markdown;
  }

  /**
   * Main processing entry point
   */
  async process(context: ProcessorContext): Promise<ProcessingResult> {
    const startTime = Date.now();

    try {
      // First, classify the document
      const classification = await this.classifyDocument(context);

      // Then extract based on type
      if (classification.type === 'invoice') {
        return this.extractInvoice(context);
      } else if (classification.type === 'payment') {
        return this.extractPayment(context);
      } else if (classification.type === 'remittance') {
        return this.extractRemittance(context);
      } else {
        return this.createResult(
          false,
          startTime,
          undefined,
          `Unsupported document type: ${classification.type}`
        );
      }
    } catch (error) {
      return this.createResult(
        false,
        startTime,
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Classify document type using OCR + LLM
   */
  async classifyDocument(context: ProcessorContext): Promise<DocumentClassification> {
    // If hint provided, use it
    if (context.hints?.expectedType) {
      return {
        type: context.hints.expectedType,
        confidence: 1.0,
        reasoning: 'Type provided as hint',
      };
    }

    try {
      // Step 1: OCR the document
      const ocrText = await this.performOCR(context.fileUrl);

      // Step 2: Classify using LLM
      const client = this.getClient();
      const response = await client.chat.complete({
        model: this.textModel,
        messages: [
          {
            role: 'user',
            content: `Classify this document based on its content. What type is it?

Document text:
${ocrText}

Document types:
- "remittance" - A remittance advice showing payment details for multiple work orders/jobs (common in fleet/mechanic billing)
- "invoice" - A single invoice requesting payment
- "payment" - A payment record or receipt
- "statement" - A bank or account statement
- "unknown" - Cannot determine

Respond with JSON only:
{
  "type": "remittance" | "invoice" | "payment" | "statement" | "unknown",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}`,
          },
        ],
        responseFormat: { type: 'json_object' },
      });

      const content = response.choices?.[0]?.message?.content;
      if (typeof content === 'string') {
        const parsed = JSON.parse(content);
        return {
          type: parsed.type as DocumentType,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
        };
      }

      return { type: 'unknown', confidence: 0.5 };
    } catch (error) {
      console.error('Classification error:', error);
      return { type: 'unknown', confidence: 0 };
    }
  }

  /**
   * Extract invoice data using OCR + LLM
   */
  async extractInvoice(context: ProcessorContext): Promise<ProcessingResult<ExtractedInvoice>> {
    const startTime = Date.now();

    try {
      // Step 1: OCR with dedicated OCR API
      const ocrText = await this.performOCR(context.fileUrl);

      // Step 2: Structure extraction with text model
      const client = this.getClient();
      const structureResponse = await client.chat.complete({
        model: this.textModel,
        messages: [
          {
            role: 'system',
            content: `You are an invoice data extraction expert. Extract structured data from invoice text.
Always respond with valid JSON only, no markdown or explanations.`,
          },
          {
            role: 'user',
            content: `Extract invoice data from this text and return as JSON:

${ocrText}

Required JSON format:
{
  "invoiceNumber": "string",
  "vendorName": "string",
  "vendorId": "string or null",
  "vendorAddress": "string or null",
  "amount": number (total amount),
  "currency": "USD" (or detected currency),
  "issueDate": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD or null",
  "description": "brief description",
  "lineItems": [
    {
      "description": "string",
      "quantity": number or null,
      "unitPrice": number or null,
      "amount": number
    }
  ],
  "taxAmount": number or null,
  "subtotal": number or null,
  "confidence": 0.0-1.0 (your confidence in extraction accuracy)
}`,
          },
        ],
        responseFormat: { type: 'json_object' },
      });

      const structuredContent = structureResponse.choices?.[0]?.message?.content;
      if (typeof structuredContent !== 'string') {
        return this.createResult(false, startTime, undefined, 'Structure extraction failed');
      }

      const parsed = JSON.parse(structuredContent);
      const validated = ExtractedInvoiceSchema.parse({
        ...parsed,
        rawText: ocrText,
      });

      return this.createResult(true, startTime, validated, undefined, {
        ocrModel: this.ocrModel,
        structureModel: this.textModel,
      });
    } catch (error) {
      return this.createResult(
        false,
        startTime,
        undefined,
        error instanceof Error ? error.message : 'Invoice extraction failed'
      );
    }
  }

  /**
   * Extract payment data using OCR + LLM
   */
  async extractPayment(context: ProcessorContext): Promise<ProcessingResult<ExtractedPayment>> {
    const startTime = Date.now();

    try {
      // Step 1: OCR with dedicated OCR API
      const ocrText = await this.performOCR(context.fileUrl);

      // Step 2: Structure extraction with text model
      const client = this.getClient();
      const structureResponse = await client.chat.complete({
        model: this.textModel,
        messages: [
          {
            role: 'system',
            content: `You are a payment data extraction expert. Extract structured data from payment records.
Always respond with valid JSON only, no markdown or explanations.`,
          },
          {
            role: 'user',
            content: `Extract payment data from this text and return as JSON:

${ocrText}

Required JSON format:
{
  "paymentReference": "string",
  "payerName": "string",
  "payerId": "string or null",
  "amount": number,
  "currency": "USD" (or detected currency),
  "paymentDate": "YYYY-MM-DD",
  "paymentMethod": "bank_transfer" | "check" | "credit_card" | "direct_debit" | "cash" | "other",
  "bankReference": "string or null",
  "description": "string or null",
  "confidence": 0.0-1.0 (your confidence in extraction accuracy)
}`,
          },
        ],
        responseFormat: { type: 'json_object' },
      });

      const structuredContent = structureResponse.choices?.[0]?.message?.content;
      if (typeof structuredContent !== 'string') {
        return this.createResult(false, startTime, undefined, 'Structure extraction failed');
      }

      const parsed = JSON.parse(structuredContent);
      const validated = ExtractedPaymentSchema.parse({
        ...parsed,
        rawText: ocrText,
      });

      return this.createResult(true, startTime, validated, undefined, {
        ocrModel: this.ocrModel,
        structureModel: this.textModel,
      });
    } catch (error) {
      return this.createResult(
        false,
        startTime,
        undefined,
        error instanceof Error ? error.message : 'Payment extraction failed'
      );
    }
  }

  /**
   * Extract remittance data (fleet company → mechanic franchise)
   */
  async extractRemittance(context: ProcessorContext): Promise<ProcessingResult<ExtractedRemittance>> {
    const startTime = Date.now();

    try {
      // Step 1: OCR with dedicated OCR API
      const ocrText = await this.performOCR(context.fileUrl);

      // Step 2: Structure extraction with text model
      const client = this.getClient();
      const structureResponse = await client.chat.complete({
        model: this.textModel,
        messages: [
          {
            role: 'system',
            content: `You are a remittance document extraction expert for mechanic/fleet billing. Extract structured data from remittance advice documents.
Always respond with valid JSON only, no markdown or explanations.`,
          },
          {
            role: 'user',
            content: `Extract remittance data from this text and return as JSON:

${ocrText}

Required JSON format:
{
  "remittanceNumber": "string (payment/remittance reference)",
  "fleetCompanyName": "string",
  "fleetCompanyId": "string or null",
  "shopName": "string or null (mechanic shop/franchise name)",
  "shopId": "string or null",
  "remittanceDate": "YYYY-MM-DD",
  "paymentDate": "YYYY-MM-DD or null",
  "totalAmount": number,
  "currency": "USD",
  "paymentMethod": "bank_transfer" | "check" | "credit_card" | "direct_debit" | "ach" | "other",
  "checkNumber": "string or null",
  "bankReference": "string or null",
  "jobs": [
    {
      "workOrderNumber": "string",
      "vehicleInfo": "string (e.g. '2019 Ford F-150 - Unit 123')",
      "serviceDate": "YYYY-MM-DD",
      "description": "string",
      "laborAmount": number or null,
      "partsAmount": number or null,
      "totalAmount": number,
      "status": "paid" | "partial" | "disputed" | "pending"
    }
  ],
  "deductions": [
    {
      "description": "string",
      "amount": number
    }
  ],
  "notes": "string or null",
  "confidence": 0.0-1.0
}`,
          },
        ],
        responseFormat: { type: 'json_object' },
      });

      const structuredContent = structureResponse.choices?.[0]?.message?.content;
      if (typeof structuredContent !== 'string') {
        return this.createResult(false, startTime, undefined, 'Structure extraction failed');
      }

      const parsed = JSON.parse(structuredContent);
      const validated = ExtractedRemittanceSchema.parse({
        ...parsed,
        rawText: ocrText,
      });

      return this.createResult(true, startTime, validated, undefined, {
        ocrModel: this.ocrModel,
        structureModel: this.textModel,
        jobCount: validated.jobs.length,
      });
    } catch (error) {
      return this.createResult(
        false,
        startTime,
        undefined,
        error instanceof Error ? error.message : 'Remittance extraction failed'
      );
    }
  }
}

// Register the processor
export const mistralOCRProcessor = new MistralOCRProcessor();
processorRegistry.register(mistralOCRProcessor);

