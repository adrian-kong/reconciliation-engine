import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, requireOrg } from "../middleware/auth.js";
import { mongoStore } from "../store/mongo-store.js";
import { createPaymentSchema, updatePaymentSchema } from "./schemas.js";

const payments = new Hono();

payments.get("/", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const payments = await mongoStore.getAllPayments(organizationId);
  return c.json(payments);
});

payments.get("/:id", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const payment = await mongoStore.getPayment(
    organizationId,
    c.req.param("id")
  );
  if (!payment) {
    return c.json({ error: "Payment not found" }, 404);
  }
  return c.json(payment);
});

payments.post(
  "/",
  requireAuth,
  requireOrg,
  zValidator("json", createPaymentSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const body = c.req.valid("json");
    const payment = await mongoStore.createPayment(organizationId, body);
    return c.json(payment, 201);
  }
);

payments.patch(
  "/:id",
  requireAuth,
  requireOrg,
  zValidator("json", updatePaymentSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const body = c.req.valid("json");
    const payment = await mongoStore.updatePayment(
      organizationId,
      c.req.param("id"),
      body
    );
    if (!payment) {
      return c.json({ error: "Payment not found" }, 404);
    }
    return c.json(payment);
  }
);

export { payments };
