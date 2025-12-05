# Reconcile - Invoice Reconciliation Engine

A modern, modular reconciliation engine for central billing invoices with PDF processing support. Built with React, TypeScript, Hono, and shadcn/ui.

## Features

### Core Reconciliation
- **Dashboard**: Real-time overview of reconciliation status, match rates, and key metrics
- **Invoice Management**: View, filter, and track all billing invoices
- **Payment Tracking**: Monitor payments with status tracking and filtering
- **Smart Reconciliation**: AI-powered matching suggestions with confidence scores
- **Manual Matching**: Interface for manual invoice-payment matching
- **Exception Handling**: Identify and resolve discrepancies with workflow management

### PDF Processing (v2.0)
- **Modular Processors**: Pluggable architecture for different extraction methods
- **Mistral OCR + LLM**: Vision-based OCR with structured LLM extraction
- **Cloudflare R2 Storage**: Scalable PDF storage with presigned URLs
- **Customizable Workflows**: Configure processing pipelines per document type
- **Future: Positional Regex**: AI-generated deterministic parsing scripts (planned)

## Tech Stack

### Backend
- **Hono** - Fast, lightweight web framework
- **TypeScript** - Type-safe development
- **Node.js** - Runtime environment

### Frontend
- **React 18** - UI library
- **TypeScript** - Type-safe development
- **Vite** - Build tool and dev server
- **TailwindCSS** - Utility-first CSS framework
- **shadcn/ui** - Beautiful, accessible components
- **React Query** - Server state management
- **React Router** - Client-side routing
- **Recharts** - Data visualization
- **Lucide Icons** - Beautiful icons

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Mistral AI API key (for PDF processing)
- Cloudflare R2 bucket (optional, for PDF storage)

### Environment Configuration

Create a `.env` file in the `backend` directory:

```bash
# Mistral AI API Key (required for PDF processing)
MISTRAL_API_KEY=your-mistral-api-key

# Cloudflare R2 Configuration (optional - uses mock storage if not set)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=your-bucket-name
```

### Installation

```bash
# Install dependencies
pnpm install

# Start development servers (both frontend and backend)
pnpm dev

# Or run them separately
pnpm dev:backend   # Backend on http://localhost:3456
pnpm dev:frontend  # Frontend on http://localhost:5173
```

### Available Scripts

- `pnpm dev` - Start both frontend and backend in development mode
- `pnpm dev:backend` - Start only the backend server
- `pnpm dev:frontend` - Start only the frontend dev server
- `pnpm build` - Build both frontend and backend for production

## Project Structure

```
invoice-reconciliation-engine/
├── backend/
│   └── src/
│       ├── index.ts                    # Hono API server
│       ├── types.ts                    # TypeScript types
│       ├── store.ts                    # In-memory data store
│       ├── reconciliation-engine.ts    # Matching logic
│       ├── processors/                 # Modular document processors
│       │   ├── types.ts               # Processor interfaces
│       │   ├── mistral-ocr.ts         # Mistral OCR + LLM processor
│       │   └── positional-regex.ts    # Future: Deterministic parser
│       ├── workflows/                  # Processing workflows
│       │   ├── types.ts               # Workflow definitions
│       │   └── engine.ts              # Workflow orchestrator
│       └── storage/                    # Storage adapters
│           └── r2.ts                  # Cloudflare R2 client
├── frontend/
│   └── src/
│       ├── components/           # React components
│       │   ├── ui/              # shadcn/ui components
│       │   └── layout/          # Layout components
│       ├── pages/               # Page components
│       ├── lib/                 # Utilities and API client
│       └── types.ts             # TypeScript types
└── README.md
```

## Architecture

### Processor System

The engine uses a modular processor architecture:

```typescript
// Register a custom processor
class MyCustomProcessor extends BaseProcessor {
  async process(context: ProcessorContext): Promise<ProcessingResult> {
    // Your extraction logic
  }
}
processorRegistry.register(new MyCustomProcessor());
```

**Built-in Processors:**
- `mistral-ocr`: Vision OCR + LLM for structured extraction
- `positional-regex`: (Planned) AI-generated deterministic parsing

### Workflow Engine

Configure custom processing pipelines:

```typescript
const workflow: WorkflowDefinition = {
  id: 'custom-invoice-workflow',
  name: 'Custom Invoice Processing',
  steps: [
    { id: 'upload', type: 'upload', onSuccess: 'extract' },
    { id: 'extract', type: 'extract', processorId: 'mistral-ocr' },
    { id: 'validate', type: 'validate', onSuccess: 'save' },
    { id: 'save', type: 'save' },
  ],
};
```

## API Endpoints

### System
- `GET /` - Health check with processor/workflow info
- `GET /api/processors` - List available processors
- `GET /api/workflows` - List available workflows

### PDF Upload & Processing
- `POST /api/upload/process` - Upload and process PDF in one step
- `POST /api/upload` - Upload PDF only (no processing)
- `POST /api/upload/:fileKey/process` - Process previously uploaded file
- `POST /api/upload/presign` - Get presigned upload URL for direct upload
- `GET /api/uploads` - List uploaded files

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics

### Invoices
- `GET /api/invoices` - List all invoices
- `GET /api/invoices/:id` - Get invoice by ID
- `POST /api/invoices` - Create new invoice
- `PATCH /api/invoices/:id` - Update invoice

### Payments
- `GET /api/payments` - List all payments
- `GET /api/payments/:id` - Get payment by ID
- `POST /api/payments` - Create new payment
- `PATCH /api/payments/:id` - Update payment

### Reconciliation
- `GET /api/reconciliations` - List all reconciliations
- `GET /api/reconciliations/suggestions` - Get AI matching suggestions
- `POST /api/reconciliations/auto` - Run auto-reconciliation
- `POST /api/reconciliations` - Create manual reconciliation
- `PATCH /api/reconciliations/:id/status` - Update reconciliation status

### Exceptions
- `GET /api/exceptions` - List all exceptions
- `POST /api/exceptions/identify` - Identify new exceptions
- `PATCH /api/exceptions/:id/status` - Update exception status

### Import
- `POST /api/import/invoices` - Bulk import invoices
- `POST /api/import/payments` - Bulk import payments

## Reconciliation Logic

The engine uses multiple factors to match invoices with payments:

1. **Amount Matching** - Exact or partial amount matches
2. **Reference Matching** - Invoice numbers in payment descriptions
3. **Vendor/Payer Matching** - Name similarity detection
4. **Date Proximity** - Payment timing relative to due date

Match confidence is calculated based on these factors, with configurable thresholds for auto-reconciliation.

## Data Import Format

### Invoice JSON Format
```json
[
  {
    "invoiceNumber": "INV-2024-001",
    "vendorName": "Acme Corp",
    "vendorId": "V001",
    "amount": 1500.00,
    "currency": "USD",
    "issueDate": "2024-01-15",
    "dueDate": "2024-02-15",
    "description": "Monthly service fee",
    "lineItems": [
      {
        "id": "1",
        "description": "Service",
        "quantity": 1,
        "unitPrice": 1500,
        "amount": 1500
      }
    ],
    "status": "pending"
  }
]
```

### Payment JSON Format
```json
[
  {
    "paymentReference": "PAY-2024-001",
    "payerName": "Internal Accounts",
    "payerId": "P001",
    "amount": 1500.00,
    "currency": "USD",
    "paymentDate": "2024-02-10",
    "paymentMethod": "bank_transfer",
    "bankReference": "BNK-12345",
    "description": "Payment for INV-2024-001",
    "status": "pending"
  }
]
```

## License

MIT

