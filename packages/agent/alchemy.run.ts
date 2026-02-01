import alchemy, { Scope } from "alchemy";
import { Worker, DurableObjectNamespace, Container, WranglerJson, R2Bucket, AccountApiToken } from "alchemy/cloudflare";

const app = await alchemy("just-use-convex", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: process.env.ALCHEMY_PASSWORD
});

const agentWorkerNamespace = DurableObjectNamespace("agent-worker", {
  className: "AgentWorker",
  sqlite: true,
});

const sandboxContainer = await Container<import("@cloudflare/sandbox").Sandbox>("sandbox", {
  className: "Sandbox",
  image: "docker.io/cloudflare/sandbox:0.7.0",
});

const sandboxBucket = await R2Bucket("just-use-convex-sandboxes", {
  name: "just-use-convex-sandboxes",
});

// S3 credentials: MinIO for local dev, R2 API token for production
const isLocalDev = Scope.current.local;

// Only create API token in production (requires admin-level API access)
const sandboxBucketToken = isLocalDev
  ? null
  : await AccountApiToken("sandbox-bucket-token", {
      name: "just-use-convex-sandbox-bucket-token",
      policies: [
        {
          effect: "allow",
          permissionGroups: ["Workers R2 Storage Write"],
          resources: {
            [`com.cloudflare.edge.r2.bucket.${sandboxBucket.accountId}_default_${sandboxBucket.name}`]: "*",
          },
        },
      ],
    });

export const worker = await Worker("agent-worker", {
  entrypoint: "./src/index.ts",
  url: false,
  compatibility: "node",
  bindings: {
    agentWorker: agentWorkerNamespace,
    Sandbox: sandboxContainer,
    SandboxBucket: sandboxBucket,
    NODE_ENV: isLocalDev ? 'development' : 'production',
    SANDBOX_BUCKET_NAME: isLocalDev ? 'sandboxes' : sandboxBucket.name,
    SANDBOX_BUCKET_ENDPOINT: isLocalDev
      ? 'http://localhost:9000'
      : `https://${sandboxBucket.accountId}.r2.cloudflarestorage.com`,
    SANDBOX_BUCKET_ACCESS_KEY_ID: isLocalDev
      ? 'minioadmin'
      : sandboxBucketToken!.accessKeyId,
    SANDBOX_BUCKET_SECRET_ACCESS_KEY: isLocalDev
      ? 'minioadmin'
      : sandboxBucketToken!.secretAccessKey,
    SANDBOX_ROOT_DIR: '/workspace',
    CONVEX_URL: alchemy.secret(process.env.CONVEX_URL),
    CONVEX_SITE_URL: alchemy.secret(process.env.CONVEX_SITE_URL),
    SITE_URL: alchemy.secret(process.env.SITE_URL || "http://localhost:3001"),
    OPENROUTER_API_KEY: alchemy.secret(process.env.OPENROUTER_API_KEY),
    COMPOSIO_API_KEY: alchemy.secret(process.env.COMPOSIO_API_KEY || ''),
    VOLTAGENT_OBSERVABILITY_ENABLED: alchemy.secret(process.env.VOLTAGENT_OBSERVABILITY_ENABLED || 'true'),
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
});