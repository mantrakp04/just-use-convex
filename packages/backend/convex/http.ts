import { httpRouter, type FunctionReturnType } from "convex/server";
import type { Id } from "./_generated/dataModel";

import { authComponent, createAuth } from "./auth";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { env } from "@just-use-convex/env/backend";
import { triggerSchema } from "./tables/workflows";
import { resolveWorkflowMemberIdentity } from "./workflows/memberIdentity";

const http = httpRouter();
const SENSITIVE_WEBHOOK_HEADERS = ["x-webhook-signature", "authorization", "cookie"];

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
  let workflow: FunctionReturnType<typeof internal.workflows.webhookQuery.getEnabledWorkflow>;
  try {
    workflow = await ctx.runQuery(internal.workflows.webhookQuery.getEnabledWorkflow, {
      workflowId: workflowId as Id<"workflows">,
    });
  } catch {
    return new Response(JSON.stringify({ error: "Invalid workflow id" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
    });
  }

  if (!workflow) {
    return new Response(JSON.stringify({ error: "Workflow not found or disabled" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
    });
  }

  // Validate webhook trigger config
  let trigger: ReturnType<typeof triggerSchema.parse>;
  try {
    trigger = triggerSchema.parse(JSON.parse(workflow.trigger));
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

  // Read body once (needed for signature verification + payload forwarding).
  let body = "";
  try {
    body = await request.text();
  } catch {
    // empty body is fine
  }

  // Validate signature header as HMAC-SHA256(secret, raw body).
  const signature = request.headers.get("x-webhook-signature");
  if (!trigger.secret) {
    return new Response(JSON.stringify({ error: "Webhook secret is not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
    });
  }
  const validSignature = signature
    ? await verifyWebhookSignature(signature, trigger.secret, body)
    : false;
  if (!validSignature) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
    });
  }

  const parsedBody = parseJsonSafely(body);
  const triggerPayload = JSON.stringify({
    type: "webhook",
    body: body.length === 0 ? {} : (parsedBody.ok ? parsedBody.value : body),
    headers: extractHeaders(request.headers, SENSITIVE_WEBHOOK_HEADERS),
    timestamp: Date.now(),
  });

  const memberIdentity = await resolveWorkflowMemberIdentity(
    ctx,
    workflow.organizationId,
    workflow.memberId,
  );
  if (!memberIdentity) {
    return new Response(JSON.stringify({ error: "Workflow member role not found" }), {
      status: 403,
      headers: { "Content-Type": "application/json", ...buildCorsHeaders(request) },
    });
  }

  // Schedule dispatch
  await ctx.scheduler.runAfter(0, internal.workflows.dispatch.dispatchWorkflow, {
    workflowId: workflow._id,
    triggerPayload,
    userId: memberIdentity.userId,
    activeOrganizationId: workflow.organizationId,
    organizationRole: memberIdentity.role,
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

function extractHeaders(
  headers: Headers,
  exclude: readonly string[] = [],
): Record<string, string> {
  const excludedHeaders = new Set(exclude.map((header) => header.toLowerCase()));
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (excludedHeaders.has(key.toLowerCase())) {
      return;
    }
    result[key] = value;
  });
  return result;
}

function parseJsonSafely(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

async function verifyWebhookSignature(
  signatureHeader: string,
  secret: string,
  rawBody: string,
): Promise<boolean> {
  const normalizedSignature = normalizeWebhookSignature(signatureHeader);
  if (!normalizedSignature) {
    return false;
  }

  const expectedSignature = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(normalizedSignature, expectedSignature);
}

function normalizeWebhookSignature(signature: string): string | null {
  const trimmed = signature.trim();
  const withoutPrefix = trimmed.toLowerCase().startsWith("sha256=")
    ? trimmed.slice("sha256=".length)
    : trimmed;

  if (!/^[a-f0-9]{64}$/i.test(withoutPrefix)) {
    return null;
  }

  return withoutPrefix.toLowerCase();
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bytesToHex(new Uint8Array(signature));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const paddedA = a.padEnd(maxLen, "\0");
  const paddedB = b.padEnd(maxLen, "\0");
  let mismatch = 0;
  for (let i = 0; i < maxLen; i++) {
    mismatch |= paddedA.charCodeAt(i) ^ paddedB.charCodeAt(i);
  }

  mismatch |= a.length ^ b.length;
  return mismatch === 0;
}
