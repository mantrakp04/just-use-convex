import alchemy from "alchemy";
import { Worker, DurableObjectNamespace, WranglerJson, VectorizeIndex } from "alchemy/cloudflare";

const app = await alchemy("just-use-convex", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: process.env.ALCHEMY_PASSWORD
});

const agentWorkerNamespace = DurableObjectNamespace("agent-worker", {
  className: "AgentWorker",
  sqlite: true,
});

const chatMessagesIndex = await VectorizeIndex("chat-messages", {
  name: "chat-messages",
  description: "Embeddings for chat messages",
  dimensions: 1536,
  metric: "cosine",
  adopt: true,
});

export const worker = await Worker("agent-worker", {
  entrypoint: "./src/index.ts",
  url: false,
  compatibility: "node",
  bindings: {
    agentWorker: agentWorkerNamespace,
    VECTORIZE_CHAT_MESSAGES: chatMessagesIndex,
    SANDBOX_ROOT_DIR: '/workspace',
    NODE_ENV: "production",
    CONVEX_URL: alchemy.secret(process.env.CONVEX_URL),
    CONVEX_SITE_URL: alchemy.secret(process.env.CONVEX_SITE_URL),
    EXTERNAL_TOKEN: alchemy.secret(process.env.EXTERNAL_TOKEN || 'meow'),
    SITE_URL: alchemy.secret(process.env.SITE_URL || "http://localhost:3001"),
    OPENROUTER_API_KEY: alchemy.secret(process.env.OPENROUTER_API_KEY),
    COMPOSIO_API_KEY: alchemy.secret(process.env.COMPOSIO_API_KEY || ''),
    VOLTAGENT_PUBLIC_KEY: alchemy.secret(process.env.VOLTAGENT_PUBLIC_KEY || ''),
    VOLTAGENT_SECRET_KEY: alchemy.secret(process.env.VOLTAGENT_SECRET_KEY || ''),
    EXA_API_KEY: alchemy.secret(process.env.EXA_API_KEY || ''),
    DAYTONA_TARGET: process.env.DAYTONA_TARGET || "us",
    DAYTONA_API_KEY: alchemy.secret(process.env.DAYTONA_API_KEY || ''),
    DAYTONA_API_URL: alchemy.secret(process.env.DAYTONA_API_URL || 'https://app.daytona.io/api'),
    DEFAULT_MODEL: process.env.DEFAULT_MODEL || "openai/gpt-5.2-chat",
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
  transform: {
    wrangler: (spec) => {
      delete spec.containers;
      if (spec.durable_objects?.bindings) {
        spec.durable_objects.bindings = spec.durable_objects.bindings.filter(
          (binding) => binding.name !== "Sandbox" && binding.class_name !== "Sandbox"
        );
      }
      if (spec.migrations) {
        for (const migration of spec.migrations) {
          if (migration.new_classes?.includes("Sandbox")) {
            migration.new_classes = migration.new_classes.filter((c: string) => c !== "Sandbox");
          }
          if (migration.new_sqlite_classes?.includes("Sandbox")) {
            migration.new_sqlite_classes = migration.new_sqlite_classes.filter((c: string) => c !== "Sandbox");
          }
        }
      }
      return spec;
    },
  },
});
