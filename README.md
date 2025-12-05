# ReconcileIQ - Invoice Reconciliation Engine

A modern, full-stack application for reconciling central billing invoices with payments. Built with React, TypeScript, Hono, and shadcn/ui.

## Features

- **Dashboard**: Real-time overview of reconciliation status, match rates, and key metrics
- **Invoice Management**: View, filter, and track all billing invoices
- **Payment Tracking**: Monitor payments with status tracking and filtering
- **Smart Reconciliation**: AI-powered matching suggestions with confidence scores
- **Manual Matching**: Drag-and-drop interface for manual reconciliation
- **Exception Handling**: Identify and resolve discrepancies with workflow management
- **Data Import**: Bulk import invoices and payments via JSON files
- **Dark/Light Mode**: Full theme support for comfortable viewing

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

### Installation

```bash
# Install dependencies
pnpm install

# Start development servers (both frontend and backend)
pnpm dev

# Or run them separately
pnpm dev:backend   # Backend on http://localhost:3001
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
│       ├── index.ts              # Hono API server
│       ├── types.ts              # TypeScript types
│       ├── store.ts              # In-memory data store
│       └── reconciliation-engine.ts  # Matching logic
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

## API Endpoints

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

