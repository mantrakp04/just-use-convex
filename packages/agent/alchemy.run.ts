import alchemy from "alchemy";
import { Worker, DurableObjectNamespace, Container, WranglerJson, VectorizeIndex } from "alchemy/cloudflare";

const app = await alchemy("just-use-convex", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: process.env.ALCHEMY_PASSWORD
});

const agentWorkerNamespace = DurableObjectNamespace("agent-worker", {
  className: "AgentWorker",
  sqlite: true,
});

const SANDBOX_IMAGE = "docker.io/cloudflare/sandbox:0.7.0";

const sandboxContainer = await Container<import("@cloudflare/sandbox").Sandbox>("sandbox", {
  className: "Sandbox",
  image: SANDBOX_IMAGE,
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
    Sandbox: sandboxContainer,
    VECTORIZE_CHAT_MESSAGES: chatMessagesIndex,
    SANDBOX_ROOT_DIR: '/workspace',
    NODE_ENV: "production",
    CONVEX_URL: alchemy.secret(process.env.CONVEX_URL),
    CONVEX_SITE_URL: alchemy.secret(process.env.CONVEX_SITE_URL),
    SITE_URL: alchemy.secret(process.env.SITE_URL || "http://localhost:3001"),
    OPENROUTER_API_KEY: alchemy.secret(process.env.OPENROUTER_API_KEY),
    COMPOSIO_API_KEY: alchemy.secret(process.env.COMPOSIO_API_KEY || ''),
    VOLTAGENT_PUBLIC_KEY: alchemy.secret(process.env.VOLTAGENT_PUBLIC_KEY || ''),
    VOLTAGENT_SECRET_KEY: alchemy.secret(process.env.VOLTAGENT_SECRET_KEY || ''),
    EXA_API_KEY: alchemy.secret(process.env.EXA_API_KEY || ''),
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
      if (spec.containers) {
        for (const container of spec.containers) {
          if (container.class_name === "Sandbox") {
            container.image = SANDBOX_IMAGE;
          }
        }
      }
      // Fix migrations: Sandbox is a container, not a sqlite class
      if (spec.migrations) {
        for (const migration of spec.migrations) {
          if (migration.new_sqlite_classes?.includes("Sandbox")) {
            migration.new_sqlite_classes = migration.new_sqlite_classes.filter(
              (c: string) => c !== "Sandbox"
            );
            migration.new_classes = migration.new_classes || [];
            if (!migration.new_classes.includes("Sandbox")) {
              migration.new_classes.push("Sandbox");
            }
          }
        }
      }
      return spec;
    },
  },
});
