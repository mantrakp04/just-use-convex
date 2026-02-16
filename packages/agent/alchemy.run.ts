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
    ...inferWorkerBindings(),
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
          if (migration.new_sqlite_classes?.includes("AgentWorker")) {
            migration.new_sqlite_classes = migration.new_sqlite_classes.filter((c: string) => c !== "AgentWorker");
          }
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

function inferWorkerBindings() {
  return {
    CONVEX_URL: secretBinding("CONVEX_URL"),
    CONVEX_SITE_URL: secretBinding("CONVEX_SITE_URL"),
    EXTERNAL_TOKEN: secretBinding("EXTERNAL_TOKEN"),
    SITE_URL: secretBinding("SITE_URL"),
    OPENROUTER_API_KEY: secretBinding("OPENROUTER_API_KEY"),
    COMPOSIO_API_KEY: secretBinding("COMPOSIO_API_KEY"),
    VOLTAGENT_PUBLIC_KEY: secretBinding("VOLTAGENT_PUBLIC_KEY"),
    VOLTAGENT_SECRET_KEY: secretBinding("VOLTAGENT_SECRET_KEY"),
    EXA_API_KEY: secretBinding("EXA_API_KEY"),
    DAYTONA_API_KEY: secretBinding("DAYTONA_API_KEY"),
    DAYTONA_API_URL: secretBinding("DAYTONA_API_URL"),
    DAYTONA_TARGET: plainBinding("DAYTONA_TARGET"),
    DEFAULT_MODEL: plainBinding("DEFAULT_MODEL"),
    MAX_BACKGROUND_DURATION_MS: plainBinding("MAX_BACKGROUND_DURATION_MS"),
    SANDBOX_INACTIVITY_TIMEOUT_MINUTES: plainBinding("SANDBOX_INACTIVITY_TIMEOUT_MINUTES"),
    SANDBOX_VOLUME_MOUNT_PATH: plainBinding("SANDBOX_VOLUME_MOUNT_PATH"),
  };
}

function secretBinding<K extends keyof typeof env>(key: K) {
  return alchemy.secret(String(env[key]));
}

function plainBinding<K extends keyof typeof env>(key: K) {
  return String(env[key]);
}
