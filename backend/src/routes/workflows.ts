import { Hono } from "hono";
import { workflowEngine } from "../workflows/engine.js";

const workflows = new Hono();

workflows.get("/", (c) => {
  const workflows = workflowEngine.getAllWorkflows();
  return c.json(workflows);
});

workflows.get("/:id", (c) => {
  const workflow = workflowEngine.getWorkflow(c.req.param("id"));
  if (!workflow) {
    return c.json({ error: "Workflow not found" }, 404);
  }
  return c.json(workflow);
});

export { workflows };
