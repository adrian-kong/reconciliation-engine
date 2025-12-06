import { createMiddleware } from "hono/factory";
import type { Context, Next } from "hono";
import { authClient } from "../lib/auth";

// Types for context variables
export interface AuthVariables {
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
    activeOrganizationId?: string;
  } | null;
  organizationId: string | null;
}

// Session middleware - sets user and session on context
export const sessionMiddleware = createMiddleware(
  async (c: Context, next: Next) => {
    const session = await authClient.api.getSession({
      headers: c.req.raw.headers,
    });

    c.set("user", session?.user ?? null);
    c.set("session", session?.session ?? null);

    await next();
  }
);

// Auth required middleware - returns 401 if no session
export const requireAuth = createMiddleware(async (c: Context, next: Next) => {
  const session = c.get("session");
  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

// Organization middleware - extracts and validates organizationId
export const requireOrg = createMiddleware(async (c: Context, next: Next) => {
  const session = c.get("session");
  if (!session?.activeOrganizationId) {
    return c.json({ error: "No organization selected" }, 403);
  }
  c.set("organizationId", session.activeOrganizationId);
  await next();
});
