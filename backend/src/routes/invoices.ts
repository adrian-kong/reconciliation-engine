import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, requireOrg } from "../middleware/auth.js";
import { mongoStore } from "../store/mongo-store.js";
import { createInvoiceSchema, updateInvoiceSchema } from "./schemas.js";

const invoices = new Hono();

invoices.get("/", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const invoices = await mongoStore.getAllInvoices(organizationId);
  return c.json(invoices);
});

invoices.get("/:id", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const invoice = await mongoStore.getInvoice(
    organizationId,
    c.req.param("id")
  );
  if (!invoice) {
    return c.json({ error: "Invoice not found" }, 404);
  }
  return c.json(invoice);
});

invoices.post(
  "/",
  requireAuth,
  requireOrg,
  zValidator("json", createInvoiceSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const body = c.req.valid("json");
    const invoice = await mongoStore.createInvoice(organizationId, body);
    return c.json(invoice, 201);
  }
);

invoices.patch(
  "/:id",
  requireAuth,
  requireOrg,
  zValidator("json", updateInvoiceSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const body = c.req.valid("json");
    const invoice = await mongoStore.updateInvoice(
      organizationId,
      c.req.param("id"),
      body
    );
    if (!invoice) {
      return c.json({ error: "Invoice not found" }, 404);
    }
    return c.json(invoice);
  }
);

export { invoices };
