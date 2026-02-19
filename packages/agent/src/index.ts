import { routeAgentRequest } from "agents";
import type { worker } from "../alchemy.run";

export { AgentWorker } from "./worker";

export default {
  async fetch(request: Request, env: typeof worker.Env): Promise<Response> {
    const origin = env.SITE_URL;

    return (
      (await routeAgentRequest(request, env, {
        prefix: "agents",
        cors: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Extensions, Sec-WebSocket-Protocol",
          "Access-Control-Max-Age": "86400",
        },
      })) || new Response("Not found", { status: 404 })
    );
  },
};
