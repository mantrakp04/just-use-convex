import alchemy from "alchemy";
import { Worker, DurableObjectNamespace, WranglerJson } from "alchemy/cloudflare";

const app = await alchemy("just-use-convex", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: process.env.ALCHEMY_PASSWORD
});

// Durable Object namespace for agent state with SQLite storage
const agentWorkerNamespace = DurableObjectNamespace("agent-worker", {
  className: "AgentWorker",
  sqlite: true,
});

// Deploy the agent worker
export const worker = await Worker("agent-worker", {
  entrypoint: "./src/index.ts",
  url: false,
  compatibility: "node",
  bindings: {
    agentWorker: agentWorkerNamespace,
    CONVEX_URL: alchemy.secret(process.env.CONVEX_URL),
    CONVEX_SITE_URL: alchemy.secret(process.env.CONVEX_SITE_URL),
    SITE_URL: alchemy.secret(process.env.SITE_URL || "http://localhost:3001"),
    OPENROUTER_API_KEY: alchemy.secret(process.env.OPENROUTER_API_KEY),
    OPENROUTER_MODEL: alchemy.secret(process.env.OPENROUTER_MODEL || "openai/gpt-5.2-chat"),
    COMPOSIO_API_KEY: alchemy.secret(process.env.COMPOSIO_API_KEY || ''),
  },
  observability: {
    logs: {
      enabled: true,
      invocationLogs: true,
    }
  }
});

await app.finalize();

await WranglerJson({
  worker: worker,
  path: "./wrangler.json",
});