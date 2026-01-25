import alchemy from "alchemy";
import {
  Worker,
  DurableObjectNamespace,
  WranglerJson
} from "alchemy/cloudflare";

const app = await alchemy("just-use-convex-agent", {
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
    OPENROUTER_API_KEY: alchemy.secret(process.env.OPENROUTER_API_KEY),
    OPENROUTER_MODEL: alchemy.secret(process.env.OPENROUTER_MODEL || "openai/gpt-5.2-chat"),
  }
});

await WranglerJson({
  worker,
  path: "./wrangler.json",
});

await app.finalize();
