import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";

const webhookToken = process.env.WEBHOOK_TOKEN ?? process.env.EXTERNAL_TOKEN;

export const ingestWebhook = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const triggerKey = pathSegments[pathSegments.length - 1];
  if (!triggerKey) {
    return new Response("Missing trigger key", { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const tokenFromHeader = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : authHeader;
  const providedToken = request.headers.get("x-webhook-token") ?? tokenFromHeader ?? "";
  if (webhookToken && providedToken !== webhookToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const query = Object.fromEntries(url.searchParams.entries());

  await ctx.runMutation(internal.webhooks.index.insertWorkflowRun, {
    triggerKey,
    payload,
    contentType: request.headers.get("content-type") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined,
    headersJson: JSON.stringify(headers),
    queryJson: JSON.stringify(query),
  });

  return Response.json({ ok: true });
});
