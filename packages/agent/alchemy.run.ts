import alchemy from "alchemy";
import {
  Worker,
  DurableObjectNamespace
} from "alchemy/cloudflare";

const app = await alchemy("just-use-convex-agent", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: process.env.ALCHEMY_PASSWORD
});

// Durable Object namespace for agent state with SQLite storage
const agent = DurableObjectNamespace("agent", {
  className: "Agent",
  sqlite: true,
});

// Deploy the agent worker
export const worker = await Worker("agent", {
  entrypoint: "./src/index.ts",
  url: false,
  compatibility: "node",
  bindings: {
    agent: agent, // Binding name must match the agent namespace requested by client
    OPENROUTER_API_KEY: alchemy.secret(process.env.OPENROUTER_API_KEY),
    OPENROUTER_MODEL: alchemy.secret(process.env.OPENROUTER_MODEL || "openai/gpt-5.2-chat"),
  },
  logpush: true
});

await app.finalize();
