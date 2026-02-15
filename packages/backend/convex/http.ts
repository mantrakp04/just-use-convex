import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { env } from "@just-use-convex/env/backend";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK ROUTE: POST /webhooks/workflows?id={workflowId}
// ═══════════════════════════════════════════════════════════════════

const handleWorkflowWebhook = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const workflowId = url.searchParams.get("id");

  if (!workflowId) {
    return new Response(JSON.stringify({ error: "Missing workflow id" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
    });
  }

  // Fetch workflow to validate
  const workflow = await ctx.runQuery(internal.workflows.webhookQuery.getEnabledWorkflow, {
    workflowId,
  });

  if (!workflow) {
    return new Response(JSON.stringify({ error: "Workflow not found or disabled" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
    });
  }

  // Validate HMAC signature
  let trigger: { type: string; secret?: string };
  try {
    trigger = JSON.parse(workflow.trigger);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid workflow trigger" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
    });
  }

  if (trigger.type !== "webhook") {
    return new Response(JSON.stringify({ error: "Workflow is not webhook-triggered" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
    });
  }

  // Validate signature header
  const signature = request.headers.get("x-webhook-signature");
  if (trigger.secret && signature !== trigger.secret) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
    });
  }

  // Parse body
  let body = "{}";
  try {
    body = await request.text();
  } catch {
    // empty body is fine
  }

  const triggerPayload = JSON.stringify({
    type: "webhook",
    body: body ? JSON.parse(body) : {},
    headers: extractHeaders(request.headers),
    timestamp: Date.now(),
  });

  // Schedule dispatch
  await ctx.scheduler.runAfter(0, internal.workflows.dispatch.dispatchWorkflow, {
    workflowId: workflow._id,
    triggerPayload,
    userId: workflow.memberId,
    activeOrganizationId: workflow.organizationId,
    organizationRole: "owner",
    memberId: workflow.memberId,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
  });
});

http.route({
  path: "/webhooks/workflows",
  method: "POST",
  handler: handleWorkflowWebhook,
});

export const handleCors = httpAction(async (_ctx, request) => {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request),
  });
});

http.route({
  pathPrefix: "/",
  method: "OPTIONS",
  handler: handleCors,
});

export default http;

function buildCorsHeaders(request: Request): Record<string, string> {
  const origin =
    request.headers.get("Origin") ?? request.headers.get("origin") ?? "";
  const allowedOrigins = [
    env.SITE_URL,
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ].filter(Boolean) as string[];
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };

  if (allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function extractHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
