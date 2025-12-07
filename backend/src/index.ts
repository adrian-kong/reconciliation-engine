import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { initDatabase } from "./lib/db.js";
import { sessionMiddleware } from "./middleware/auth.js";
import { processorRegistry } from "./processors/index.js";
import { workflowEngine } from "./workflows/engine.js";
import { authClient } from "./lib/auth.js";
import {
  invoices,
  payments,
  reconciliations,
  exceptions,
  uploads,
  dashboard,
  workflows,
  processors,
  importRoutes,
  remittances,
} from "./routes/index.js";
import { config } from "./lib/config.js";

// Type augmentation for Hono context
declare module "hono" {
  interface ContextVariableMap {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
    } | null;
    session: {
      id: string;
      userId: string;
      expiresAt: Date;
      activeOrganizationId?: string | null;
    } | null;
    organizationId: string | null;
  }
}

const app = new Hono();

// Initialize services
async function init() {
  await initDatabase(config.MONGODB_URI);
}

// CORS configuration
app.use(
  "*",
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.use("*", logger());

// Auth routes (public - before session middleware)
app.on(["POST", "GET"], "/api/auth/*", (c) => authClient.handler(c.req.raw));

// Session middleware on all routes
app.use("*", sessionMiddleware);

// Health check (public)
app.get("/", (c) =>
  c.json({
    status: "ok",
    service: "Invoice Reconciliation Engine",
    version: "2.0.0",
    processors: processorRegistry.getAll().map((p) => p.config),
    workflows: workflowEngine
      .getAllWorkflows()
      .map((w) => ({ id: w.id, name: w.name })),
  })
);

// Mount routes
app.route("/api/processors", processors);
app.route("/api/workflows", workflows);
app.route("/api/dashboard", dashboard);
app.route("/api/upload", uploads);
app.route("/api/uploads", uploads);
app.route("/api/invoices", invoices);
app.route("/api/payments", payments);
app.route("/api/reconciliations", reconciliations);
app.route("/api/exceptions", exceptions);
app.route("/api/import", importRoutes);
app.route("/api/remittances", remittances);

// Start server
const port = 3456;

init()
  .then(() => {
    console.log(
      `Invoice Reconciliation Engine v2.0 running on http://localhost:${port}`
    );
    console.log(
      `Processors: ${processorRegistry
        .getAll()
        .map((p) => p.config.id)
        .join(", ")}`
    );
    console.log(
      `Workflows: ${workflowEngine
        .getAllWorkflows()
        .map((w) => w.id)
        .join(", ")}`
    );

    serve({
      fetch: app.fetch,
      port,
    });
  })
  .catch((error) => {
    console.error("Failed to initialize server:", error);
    process.exit(1);
  });
