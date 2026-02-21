#!/usr/bin/env bun

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { generateKeyPairSync, randomBytes } from "node:crypto";

import { z } from "zod";

// @ts-ignore
import { env as deployEnv } from "@just-use-convex/env/deploy";

type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

const scriptFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptFilePath), "..");
const backendCwd = path.resolve(repoRoot, "packages/backend");
const agentCwd = path.resolve(repoRoot, "packages/agent");
const webCwd = path.resolve(repoRoot, "apps/web");
const backendConvexCli = path.resolve(backendCwd, "node_modules/.bin/convex");
const agentAlchemyCli = path.resolve(agentCwd, "node_modules/.bin/alchemy");
const webViteCli = path.resolve(webCwd, "node_modules/.bin/vite");
const continueDeployCommand = formatCommand("bun", [
  path.relative(backendCwd, scriptFilePath),
  "--continue",
]);

const sanitizeStage = (raw = "preview") => {
  const normalized = raw
    .toLowerCase()
    .replaceAll("/", "-")
    .replaceAll(/[^a-z0-9-]/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  return normalized || "preview";
};

const getProductionBranch = () => process.env.VERCEL_PROJECT_PRODUCTION_BRANCH?.trim() || "master";

const runCommand = (bin: string, args: string[] = [], options: RunOptions = {}) => {
  const result = spawnSync(bin, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${formatCommand(bin, args)}`);
  }
};

const runCommandCapture = (bin: string, args: string[] = [], options: RunOptions = {}) => {
  const result = spawnSync(bin, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error) throw result.error;
  const stdout = result.stdout?.toString() ?? "";
  const stderr = result.stderr?.toString() ?? "";
  const output = `${stdout}${stderr}`;
  if (result.status !== 0) {
    process.stderr.write(output);
    throw new Error(`Command failed (${result.status}): ${formatCommand(bin, args)}`);
  }
  return output;
};

const generateSecret = () => randomBytes(32).toString("base64url");

const generateJwks = async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  const privateJwk = privateKey.export({ format: "jwk" }) as Record<string, unknown>;
  const keyId = randomBytes(16).toString("hex");
  return JSON.stringify([
    {
      alg: "RS256",
      createdAt: Date.now(),
      id: keyId,
      privateKey: JSON.stringify({ ...privateJwk, alg: "RS256", kid: keyId }),
      publicKey: JSON.stringify({ ...publicJwk, alg: "RS256", kid: keyId }),
    },
  ]);
};

const vercelEnv = process.env.VERCEL_ENV?.trim();
const gitBranch = process.env.VERCEL_GIT_COMMIT_REF?.trim();
const pullRequestId = process.env.VERCEL_GIT_PULL_REQUEST_ID?.trim();
const isPullRequestDeployment = Boolean(pullRequestId);
const isProductionBranch = gitBranch === getProductionBranch() || gitBranch === "prod";
const isPreviewDeployment = isPullRequestDeployment || (vercelEnv === "preview" && !isProductionBranch);
const convexPreviewName = isPullRequestDeployment
  ? `pr-${sanitizeStage(pullRequestId)}`
  : sanitizeStage(gitBranch || "preview");
const alchemyStage = isPreviewDeployment ? "preview" : "prod";
const resolvedSiteUrl = (process.env.VERCEL_BRANCH_URL
  ? `https://${process.env.VERCEL_BRANCH_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined);

/**
 * Set a Convex env var. For preview, uses --preview-name to avoid
 * provision_and_authorize conflicts inside --cmd callbacks.
 */
const setConvexEnv = (key: string, value: string) => {
  const args = ["env", "set"];
  if (isPreviewDeployment) args.push("--preview-name", convexPreviewName);
  // Use -- to prevent values starting with '-' from being parsed as flags
  args.push("--", key, value);
  runCommand(backendConvexCli, args, { cwd: backendCwd });
};

/** Deploy Cloudflare agent via Alchemy, returns worker URL */
const deployAgent = () => {
  console.log("→ Deploying Cloudflare agent...");
  const output = runCommandCapture(agentAlchemyCli, ["deploy", "alchemy.run.ts"], {
    cwd: agentCwd,
    env: { ALCHEMY_CI_STATE_STORE_CHECK: "false" },
  });
  console.log(output);

  const workerUrl = output
    .split("\n")
    .reverse()
    .map((line) => line.trim())
    .find((line) => line.startsWith("ALCHEMY_WORKER_URL="))
    ?.replace("ALCHEMY_WORKER_URL=", "") ?? "";
  if (!workerUrl) throw new Error("Failed to capture worker URL from alchemy deploy");

  console.log(`→ ALCHEMY_WORKER_URL=${workerUrl}`);
  return workerUrl;
};

/**
 * --continue: called by convex deploy --cmd
 * At this point CONVEX_URL is set by Convex CLI.
 * We deploy agent, set env vars, build web — all inside --cmd.
 * If any step fails, non-zero exit aborts the Convex deploy.
 */
const continueMode = async () => {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) throw new Error("CONVEX_URL is required in --continue mode");

  const convexSiteUrl = convexUrl.replace(".convex.cloud", ".convex.site");
  process.env.VITE_CONVEX_URL = convexUrl;
  process.env.CONVEX_URL = convexUrl;
  process.env.VITE_CONVEX_SITE_URL = convexSiteUrl;
  process.env.CONVEX_SITE_URL = convexSiteUrl;

  console.log(`→ CONVEX_URL=${convexUrl}`);
  console.log(`→ CONVEX_SITE_URL=${convexSiteUrl}`);
  console.log(`→ SITE_URL=${process.env.SITE_URL}`);

  // 1. Set up secrets (idempotent for preview and production)
  await ensureConvexEnvValue("EXTERNAL_TOKEN", async () => generateSecret(), {
    exposeInProcessEnv: true,
  });
  await ensureConvexEnvValue("BETTER_AUTH_SECRET", async () => generateSecret());
  await ensureConvexEnvValue("JWKS", generateJwks);

  // 2. Ensure ALCHEMY_PASSWORD is set (generate if missing)
  if (!process.env.ALCHEMY_PASSWORD) {
    process.env.ALCHEMY_PASSWORD = generateSecret();
    console.log("→ Generated ALCHEMY_PASSWORD");
  }

  // 3. Deploy agent (now has CONVEX_URL + CONVEX_SITE_URL + ALCHEMY_PASSWORD in env)
  const workerUrl = deployAgent();
  process.env.VITE_AGENT_URL = workerUrl;
  process.env.AGENT_URL = workerUrl;

  // 4. Sync known backend env vars to Convex
  // Derive keys + defaults from the backend env schema to stay in sync
  const { backendEnvSchema } = await import("@just-use-convex/env/backend");
  for (const [key, schema] of Object.entries(backendEnvSchema)) {
    const value = process.env[key] || getZodDefault(schema as z.ZodTypeAny);
    if (value) setConvexEnv(key, String(value));
  }
  console.log("→ Synced env vars to Convex");

  // 5. Build web app
  console.log("→ Building web app...");
  runCommand(webViteCli, ["build"], { cwd: webCwd });

  // 6. Move Nitro Build Output API to repo root for Vercel
  const nitroOutput = path.resolve(webCwd, ".vercel/output");
  const vercelOutput = path.resolve(repoRoot, ".vercel/output");
  rmSync(vercelOutput, { recursive: true, force: true });
  cpSync(nitroOutput, vercelOutput, { recursive: true });
  console.log(`→ Moved build output to ${vercelOutput}`);

  process.exit(0);
};

const main = async () => {
  if (process.argv.includes("--continue")) return continueMode();

  // ──────────────────────────────────────────────────────────
  // Initial call (run by Vercel build)
  // ──────────────────────────────────────────────────────────

  process.env.SITE_URL = resolvedSiteUrl ?? "";
  process.env.ALCHEMY_STAGE = alchemyStage;
  process.env.CONVEX_PREVIEW_NAME = convexPreviewName;

  console.log(`→ Environment: ${vercelEnv}`);
  console.log(`→ Branch: ${gitBranch ?? "(unknown)"}`);
  console.log(`→ PR: ${pullRequestId ?? "(none)"}`);
  console.log(`→ Mode: ${isPreviewDeployment ? "preview" : "production"}`);
  console.log(`→ SITE_URL=${process.env.SITE_URL}`);
  console.log(`→ ALCHEMY_STAGE=${alchemyStage}`);

  // Deploy Convex — agent deploy + web build happen inside --cmd
  // where CONVEX_URL is available. If anything fails, Convex aborts.
  if (isPreviewDeployment) {
    console.log(`→ Deploying Convex preview: ${convexPreviewName}`);
    runCommand(backendConvexCli, [
      "deploy",
      "--preview-create",
      convexPreviewName,
      "--cmd",
      continueDeployCommand,
      "--cmd-url-env-var-name",
      "CONVEX_URL",
    ], { cwd: backendCwd });
  } else {
    console.log("→ Deploying Convex production");
    runCommand(backendConvexCli, [
      "deploy",
      "--cmd",
      continueDeployCommand,
      "--cmd-url-env-var-name",
      "CONVEX_URL",
    ], { cwd: backendCwd });
  }
};

const getConvexEnvValue = (key: string) => {
  const line = getConvexEnvLine(key);
  return line ? line.slice(`${key}=`.length) : undefined;
};

const getConvexEnvLine = (key: string) => {
  const args = ["env", "list"];
  if (isPreviewDeployment) args.push("--preview-name", convexPreviewName);
  const output = runCommandCapture(backendConvexCli, args, { cwd: backendCwd });
  return output
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${key}=`));
};

const ensureConvexEnvValue = async (
  key: string,
  generateValue: () => Promise<string> | string,
  options?: { exposeInProcessEnv?: boolean },
) => {
  const existingValue = getConvexEnvValue(key);
  if (existingValue) {
    if (options?.exposeInProcessEnv) process.env[key] = existingValue;
    console.log(`→ ${key} already set`);
    return existingValue;
  }

  const generatedValue = await generateValue();
  setConvexEnv(key, generatedValue);
  if (options?.exposeInProcessEnv) process.env[key] = generatedValue;
  console.log(`→ Generated ${key}`);
  return generatedValue;
};

function formatCommand(bin: string, args: string[]) {
  const formatPart = (part: string) => (part.includes(" ") ? JSON.stringify(part) : part);
  return [formatPart(bin), ...args.map(formatPart)].join(" ");
}

/** Extract the default value from a zod schema, if one exists (zod v4) */
function getZodDefault(schema: z.ZodTypeAny): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = schema;
  while (current?._zod?.def) {
    const def = current._zod.def;
    if (def.type === "default" && def.defaultValue !== undefined) {
      return typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
    }
    current = def.innerType ?? def.schema;
  }
  return undefined;
}

main()
