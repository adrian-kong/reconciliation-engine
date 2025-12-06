import { Hono } from "hono";
import { requireAuth, requireOrg } from "../middleware/auth.js";
import { reconciliationEngine } from "../reconciliation-engine.js";

const dashboard = new Hono();

dashboard.get("/stats", requireAuth, requireOrg, async (c) => {
  const organizationId = c.get("organizationId")!;
  const stats = await reconciliationEngine.getDashboardStats(organizationId);
  return c.json(stats);
});

export { dashboard };
