import alchemy from "alchemy";
import { Worker, DurableObjectNamespace, Container, VectorizeIndex } from "alchemy/cloudflare";
import { TanStackStart } from "alchemy/cloudflare";

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
  entrypoint: "../agent/src/index.ts",
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
    EXTERNAL_TOKEN: alchemy.secret(process.env.EXTERNAL_TOKEN || 'meow'),
    SITE_URL: alchemy.secret(process.env.SITE_URL || "http://localhost:3001"),
    OPENROUTER_API_KEY: alchemy.secret(process.env.OPENROUTER_API_KEY),
    COMPOSIO_API_KEY: alchemy.secret(process.env.COMPOSIO_API_KEY || ''),
    VOLTAGENT_PUBLIC_KEY: alchemy.secret(process.env.VOLTAGENT_PUBLIC_KEY || ''),
    VOLTAGENT_SECRET_KEY: alchemy.secret(process.env.VOLTAGENT_SECRET_KEY || ''),
    EXA_API_KEY: alchemy.secret(process.env.EXA_API_KEY || ''),
    DEFAULT_MODEL: process.env.DEFAULT_MODEL || "openai/gpt-5.2-chat",
  },
  observability: {
    logs: {
      enabled: true,
      invocationLogs: true,
    }
  }
});

export const website = await TanStackStart("website", {
  cwd: "../../apps/web",
  bindings: {
    VITE_CONVEX_URL: alchemy.env("VITE_CONVEX_URL"),
    VITE_CONVEX_SITE_URL: alchemy.env("VITE_CONVEX_SITE_URL"),
    VITE_SITE_URL: alchemy.env("VITE_SITE_URL", "http://localhost:3001"),
    VITE_AGENT_URL: alchemy.env("VITE_AGENT_URL", "http://localhost:1337"),
    VITE_DEFAULT_MODEL: alchemy.env("VITE_DEFAULT_MODEL", "openai/gpt-5.2-chat"),
  },
  adopt: true
});

console.log({ url: website.url });

await app.finalize();
