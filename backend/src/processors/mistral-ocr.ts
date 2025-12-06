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
    description: 'Uses Mistral AI vision for OCR and LLM for structured extraction',
    supportedTypes: ['invoice', 'payment', 'statement', 'remittance'],
  };

  private client: Mistral | null = null;
  private model: string = 'pixtral-12b-2409'; // Vision model for OCR
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
   * Classify document type using vision model
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
      const client = this.getClient();
      const base64 = context.fileBuffer.toString('base64');

      const response = await client.chat.complete({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Classify this document. What type is it?

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
              {
                type: 'image_url',
                imageUrl: `data:${context.mimeType};base64,${base64}`,
              },
            ],
          },
        ],
      });

      const content = response.choices?.[0]?.message?.content;
      if (typeof content === 'string') {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            type: parsed.type as DocumentType,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning,
          };
        }
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
      const client = this.getClient();
      const base64 = context.fileBuffer.toString('base64');

      // Step 1: OCR with vision model
      const ocrResponse = await client.chat.complete({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract all text from this invoice document. Include all details like:
- Invoice number
- Vendor/company name and address
- Dates (issue date, due date)
- Line items with descriptions, quantities, prices
- Subtotal, tax, total amounts
- Payment terms

Return the extracted text in a structured format.`,
              },
              {
                type: 'image_url',
                imageUrl: `data:${context.mimeType};base64,${base64}`,
              },
            ],
          },
        ],
      });

      const ocrText = ocrResponse.choices?.[0]?.message?.content;
      if (typeof ocrText !== 'string') {
        return this.createResult(false, startTime, undefined, 'OCR extraction failed');
      }

      // Step 2: Structure extraction with text model
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
        ocrModel: this.model,
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
      const client = this.getClient();
      const base64 = context.fileBuffer.toString('base64');

      // Step 1: OCR with vision model
      const ocrResponse = await client.chat.complete({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract all text from this payment document/receipt. Include all details like:
- Payment/transaction reference number
- Payer name
- Amount paid
- Payment date
- Payment method (bank transfer, check, card, etc.)
- Bank reference if available
- Description or memo

Return the extracted text in a structured format.`,
              },
              {
                type: 'image_url',
                imageUrl: `data:${context.mimeType};base64,${base64}`,
              },
            ],
          },
        ],
      });

      const ocrText = ocrResponse.choices?.[0]?.message?.content;
      if (typeof ocrText !== 'string') {
        return this.createResult(false, startTime, undefined, 'OCR extraction failed');
      }

      // Step 2: Structure extraction with text model
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
        ocrModel: this.model,
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
      const client = this.getClient();
      const base64 = context.fileBuffer.toString('base64');

      // Step 1: OCR with vision model
      const ocrResponse = await client.chat.complete({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract all text from this remittance advice document. This is a payment notice from a fleet company to a mechanic shop/franchise listing work orders being paid.

Include all details:
- Remittance/payment reference number
- Fleet company name and details
- Shop/franchise name if shown
- Remittance date and payment date
- Payment method, check number, bank reference
- List of all work orders/jobs with:
  - Work order number
  - Vehicle info (year, make, model, plate/unit number)
  - Service date
  - Description of work
  - Labor amount
  - Parts amount
  - Total amount
  - Payment status
- Any deductions or adjustments
- Total payment amount

Return the extracted text in a structured format.`,
              },
              {
                type: 'image_url',
                imageUrl: `data:${context.mimeType};base64,${base64}`,
              },
            ],
          },
        ],
      });

      const ocrText = ocrResponse.choices?.[0]?.message?.content;
      if (typeof ocrText !== 'string') {
        return this.createResult(false, startTime, undefined, 'OCR extraction failed');
      }

      // Step 2: Structure extraction with text model
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
        ocrModel: this.model,
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

