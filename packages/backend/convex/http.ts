import { httpRouter } from "convex/server";

import { authComponent, createAuth } from "./auth";
import { ingestWebhook } from "./webhooks/http";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);
http.route({
  path: "/webhooks/:triggerKey",
  method: "POST",
  handler: ingestWebhook,
});

export default http;
