import alchemy from "alchemy";
import {
  Container,
  DurableObjectNamespace,
  TanStackStart,
  VectorizeIndex,
  Worker,
  WranglerJson,
} from "alchemy/cloudflare";

const app = await alchemy("just-use-convex", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: process.env.ALCHEMY_PASSWORD,
});

const siteUrl = process.env.VITE_SITE_URL ?? process.env.SITE_URL ?? "http://localhost:3001";
const agentUrl = process.env.VITE_AGENT_URL ?? "http://localhost:1337";
const convexUrl = process.env.VITE_CONVEX_URL ?? process.env.CONVEX_URL ?? "";
const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL ?? "";
const defaultModel = process.env.VITE_DEFAULT_MODEL ?? process.env.DEFAULT_MODEL ?? "openai/gpt-5.2-chat";

export const website = await TanStackStart("web", {
  cwd: "apps/web",
  bindings: {
    VITE_SITE_URL: alchemy.var(siteUrl),
    VITE_AGENT_URL: alchemy.var(agentUrl),
    VITE_CONVEX_URL: alchemy.var(convexUrl),
    VITE_CONVEX_SITE_URL: alchemy.var(convexSiteUrl),
    VITE_DEFAULT_MODEL: alchemy.var(defaultModel),
  },
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
  entrypoint: "./packages/agent/src/index.ts",
  url: false,
  compatibility: "node",
  bindings: {
    agentWorker: agentWorkerNamespace,
    Sandbox: sandboxContainer,
    VECTORIZE_CHAT_MESSAGES: chatMessagesIndex,
    SANDBOX_ROOT_DIR: "/workspace",
    NODE_ENV: "production",
    CONVEX_URL: alchemy.secret(process.env.CONVEX_URL ?? convexUrl),
    CONVEX_SITE_URL: alchemy.secret(process.env.CONVEX_SITE_URL ?? convexSiteUrl),
    EXTERNAL_TOKEN: alchemy.secret(process.env.EXTERNAL_TOKEN ?? "meow"),
    SITE_URL: alchemy.secret(siteUrl),
    OPENROUTER_API_KEY: alchemy.secret(process.env.OPENROUTER_API_KEY),
    COMPOSIO_API_KEY: alchemy.secret(process.env.COMPOSIO_API_KEY ?? ""),
    VOLTAGENT_PUBLIC_KEY: alchemy.secret(process.env.VOLTAGENT_PUBLIC_KEY ?? ""),
    VOLTAGENT_SECRET_KEY: alchemy.secret(process.env.VOLTAGENT_SECRET_KEY ?? ""),
    EXA_API_KEY: alchemy.secret(process.env.EXA_API_KEY ?? ""),
    DEFAULT_MODEL: defaultModel,
  },
  observability: {
    logs: {
      enabled: true,
      invocationLogs: true,
    },
  },
});

await app.finalize();

await WranglerJson({
  worker: website,
  path: "apps/web/wrangler.json",
});

await WranglerJson({
  worker: worker,
  path: "packages/agent/wrangler.json",
  transform: {
    wrangler: (spec: any) => {
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
