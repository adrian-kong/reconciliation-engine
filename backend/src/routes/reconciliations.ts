import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, requireOrg } from "../middleware/auth.js";
import { mongoStore } from "../store/mongo-store.js";
import { reconciliationEngine } from "../reconciliation-engine.js";
import {
  createReconciliationSchema,
  updateReconciliationStatusSchema,
  autoReconcileSchema,
} from "./schemas.js";

const reconciliations = new Hono();

reconciliations.get("/", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const reconciliations = await mongoStore.getAllReconciliations(organizationId);
  return c.json(reconciliations);
});

reconciliations.get("/suggestions", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const suggestions = await reconciliationEngine.generateSuggestions(organizationId);
  return c.json(suggestions);
});

reconciliations.get("/:id", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const reconciliation = await mongoStore.getReconciliation(
    organizationId,
    c.req.param("id")
  );
  if (!reconciliation) {
    return c.json({ error: "Reconciliation not found" }, 404);
  }
  return c.json(reconciliation);
});

reconciliations.post(
  "/auto",
  requireAuth,
  requireOrg,
  zValidator("json", autoReconcileSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const body = c.req.valid("json");
    const reconciled = await reconciliationEngine.autoReconcile(
      organizationId,
      body.minConfidence
    );
    return c.json({
      message: `Auto-reconciled ${reconciled.length} items`,
      reconciliations: reconciled,
    });
  }
);

reconciliations.post(
  "/",
  requireAuth,
  requireOrg,
  zValidator("json", createReconciliationSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const body = c.req.valid("json");
    const reconciliation = await reconciliationEngine.createReconciliation(
      organizationId,
      body.invoiceId,
      body.paymentId,
      "manual",
      body.notes
    );
    if (!reconciliation) {
      return c.json(
        {
          error:
            "Failed to create reconciliation. Check invoice and payment IDs.",
        },
        400
      );
    }
    return c.json(reconciliation, 201);
  }
);

reconciliations.patch(
  "/:id/status",
  requireAuth,
  requireOrg,
  zValidator("json", updateReconciliationStatusSchema),
  async (c) => {
    const organizationId = c.get("organizationId")!;
    const body = c.req.valid("json");
    const reconciliation = await mongoStore.updateReconciliationStatus(
      organizationId,
      c.req.param("id"),
      body.status
    );
    if (!reconciliation) {
      return c.json({ error: "Reconciliation not found" }, 404);
    }
    return c.json(reconciliation);
  }
);

export { reconciliations };
