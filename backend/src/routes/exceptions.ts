import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, requireOrg } from "../middleware/auth.js";
import { mongoStore } from "../store/mongo-store.js";
import { reconciliationEngine } from "../reconciliation-engine.js";
import { updateExceptionStatusSchema } from "./schemas.js";

const exceptions = new Hono();

exceptions.get("/", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const exceptions = await mongoStore.getAllExceptions(organizationId);
  return c.json(exceptions);
});

exceptions.get("/:id", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const exception = await mongoStore.getException(
    organizationId,
    c.req.param("id")
  );
  if (!exception) {
    return c.json({ error: "Exception not found" }, 404);
  }
  return c.json(exception);
});

exceptions.post("/identify", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const newExceptions = await reconciliationEngine.identifyExceptions(organizationId);
  return c.json({
    message: `Identified ${newExceptions.length} new exceptions`,
    exceptions: newExceptions,
  });
});

exceptions.patch(
  "/:id/status",
  requireAuth,
  requireOrg,
  zValidator("json", updateExceptionStatusSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const body = c.req.valid("json");
    const exception = await mongoStore.updateExceptionStatus(
      organizationId,
      c.req.param("id"),
      body.status,
      body.resolvedBy
    );
    if (!exception) {
      return c.json({ error: "Exception not found" }, 404);
    }
    return c.json(exception);
  }
);

export { exceptions };
