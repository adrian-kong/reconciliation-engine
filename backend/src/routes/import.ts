import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, requireOrg } from "../middleware/auth.js";
import { mongoStore } from "../store/mongo-store.js";
import { importInvoicesSchema, importPaymentsSchema } from "./schemas.js";

const importRoutes = new Hono();

importRoutes.post(
  "/invoices",
  requireAuth,
  requireOrg,
  zValidator("json", importInvoicesSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const body = c.req.valid("json");
    const created = await Promise.all(
      body.invoices.map((inv) => mongoStore.createInvoice(organizationId, inv))
    );
    return c.json(
      { message: `Imported ${created.length} invoices`, invoices: created },
      201
    );
  }
);

importRoutes.post(
  "/payments",
  requireAuth,
  requireOrg,
  zValidator("json", importPaymentsSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const body = c.req.valid("json");
    const created = await Promise.all(
      body.payments.map((pay) => mongoStore.createPayment(organizationId, pay))
    );
    return c.json(
      { message: `Imported ${created.length} payments`, payments: created },
      201
    );
  }
);

export { importRoutes };
