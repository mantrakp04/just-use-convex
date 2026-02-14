import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";
import { httpAction } from "./_generated/server";
import { env } from "@just-use-convex/env/backend";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

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
