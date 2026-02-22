import alchemy from "alchemy";
import { Worker, DurableObjectNamespace, VectorizeIndex } from "alchemy/cloudflare";
import { env } from "@just-use-convex/env/agent";

const stage = process.env.ALCHEMY_STAGE ?? "dev";

const app = await alchemy("just-use-convex", {
  stage,
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: env.ALCHEMY_PASSWORD
});

const agentWorkerNamespace = DurableObjectNamespace("agent-worker", {
  className: "AgentWorker",
  sqlite: true,
});

const chatMessagesIndex = await VectorizeIndex("chat-messages", {
  name: "chat-messages",
  description: "Embeddings for chat messages",
  dimensions: 768,
  metric: "cosine",
  adopt: true,
});

export const worker = await Worker("agent-worker", {
  entrypoint: "./src/index.ts",
  url: true,
  adopt: true,
  compatibility: "node",
  bindings: {
    agentWorker: agentWorkerNamespace,
    vectorizeChatMessages: chatMessagesIndex,
    NODE_ENV: "production",
    CONVEX_URL: alchemy.secret(env.CONVEX_URL),
    CONVEX_SITE_URL: alchemy.secret(env.CONVEX_SITE_URL),
    EXTERNAL_TOKEN: alchemy.secret(env.EXTERNAL_TOKEN),
    SITE_URL: alchemy.secret(env.SITE_URL),
    OPENROUTER_API_KEY: alchemy.secret(env.OPENROUTER_API_KEY),
    ...(env.VOLTAGENT_PUBLIC_KEY && { VOLTAGENT_PUBLIC_KEY: alchemy.secret(env.VOLTAGENT_PUBLIC_KEY) }),
    ...(env.VOLTAGENT_SECRET_KEY && { VOLTAGENT_SECRET_KEY: alchemy.secret(env.VOLTAGENT_SECRET_KEY) }),
    EXA_API_KEY: alchemy.secret(env.EXA_API_KEY),
    DAYTONA_TARGET: env.DAYTONA_TARGET,
    DAYTONA_API_KEY: alchemy.secret(env.DAYTONA_API_KEY),
    DAYTONA_API_URL: alchemy.secret(env.DAYTONA_API_URL),
    MAX_TOOL_DURATION_MS: String(env.MAX_TOOL_DURATION_MS),
    MAX_BACKGROUND_DURATION_MS: String(env.MAX_BACKGROUND_DURATION_MS),
    BACKGROUND_TASK_POLL_INTERVAL_MS: String(env.BACKGROUND_TASK_POLL_INTERVAL_MS),
  },
  observability: {
    logs: {
      enabled: true,
      invocationLogs: true,
    }
  }
});

await app.finalize();

// Output worker URL for CI capture
if (worker.url) {
  console.log(`ALCHEMY_WORKER_URL=${worker.url}`);
}
