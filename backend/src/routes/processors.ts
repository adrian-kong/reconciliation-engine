import { Hono } from "hono";
import { processorRegistry } from "../processors/index.js";

const processors = new Hono();

processors.get("/", (c) => {
  const processors = processorRegistry.getAll().map((p) => p.config);
  return c.json(processors);
});

export { processors };
