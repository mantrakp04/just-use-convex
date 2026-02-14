import alchemy from "alchemy";
import { Worker, DurableObjectNamespace, WranglerJson, VectorizeIndex } from "alchemy/cloudflare";
import { env } from "@just-use-convex/env/agent";

const app = await alchemy("just-use-convex", {
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
  url: false,
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
    COMPOSIO_API_KEY: alchemy.secret(env.COMPOSIO_API_KEY),
    VOLTAGENT_PUBLIC_KEY: alchemy.secret(env.VOLTAGENT_PUBLIC_KEY),
    VOLTAGENT_SECRET_KEY: alchemy.secret(env.VOLTAGENT_SECRET_KEY),
    EXA_API_KEY: alchemy.secret(env.EXA_API_KEY),
    DAYTONA_TARGET: env.DAYTONA_TARGET,
    DAYTONA_API_KEY: alchemy.secret(env.DAYTONA_API_KEY),
    DAYTONA_API_URL: alchemy.secret(env.DAYTONA_API_URL),
    DEFAULT_MODEL: env.DEFAULT_MODEL,
    MAX_BACKGROUND_DURATION_MS: String(env.MAX_BACKGROUND_DURATION_MS),
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
