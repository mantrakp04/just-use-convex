#!/usr/bin/env bun

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
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

  if (result.error) {
    throw result.error;
  }

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

  if (result.error) {
    throw result.error;
  }

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
const alchemyStage = isPreviewDeployment
  ? isPullRequestDeployment
    ? `pr-${sanitizeStage(pullRequestId)}`
    : sanitizeStage(gitBranch || "preview")
  : "prod";
const resolvedSiteUrl = (process.env.VERCEL_BRANCH_URL
  ? `https://${process.env.VERCEL_BRANCH_URL}`
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined);

const main = async () => {
  if (process.argv.includes("--continue")) {
    const setConvexEnv = async (key: string, value: string) =>
      runCommand(backendConvexCli, ["env", "set", key, value], { cwd: backendCwd });

    const convexUrl = process.env.CONVEX_URL;
    if (!convexUrl) {
      throw new Error("CONVEX_URL is required in --continue mode");
    }

    const convexSiteUrl = convexUrl.replace(".convex.cloud", ".convex.site");

    process.env.VITE_CONVEX_URL = convexUrl;
    process.env.CONVEX_URL = convexUrl;
    process.env.VITE_CONVEX_SITE_URL = convexSiteUrl;
    process.env.CONVEX_SITE_URL = convexSiteUrl;
    process.env.SITE_URL = resolvedSiteUrl;
    process.env.ALCHEMY_STAGE = alchemyStage;
    process.env.CONVEX_PREVIEW_NAME = convexPreviewName;

    const existingExternalToken = getConvexEnvValue("EXTERNAL_TOKEN");
    if (existingExternalToken) {
      process.env.EXTERNAL_TOKEN = existingExternalToken;
      console.log("→ EXTERNAL_TOKEN already set in Convex env");
    } else {
      const externalToken = generateSecret();
      process.env.EXTERNAL_TOKEN = externalToken;
      await setConvexEnv("EXTERNAL_TOKEN", externalToken);
      console.log("→ Generated and set EXTERNAL_TOKEN");
    }

    if (!hasConvexEnvValue("BETTER_AUTH_SECRET")) {
      const betterAuthSecret = generateSecret();
      await setConvexEnv("BETTER_AUTH_SECRET", betterAuthSecret);
      console.log("→ Generated and set BETTER_AUTH_SECRET");
    } else {
      console.log("→ BETTER_AUTH_SECRET already set in Convex env");
    }

    const existingJwks = getConvexEnvValue("JWKS");
    if (!existingJwks) {
      const jwks = await generateJwks();
      await setConvexEnv("JWKS", jwks);
      console.log(existingJwks ? "→ Replaced invalid JWKS" : "→ Generated and set JWKS");
    } else {
      console.log("→ JWKS already set in Convex env");
    }

    console.log(`→ VITE_CONVEX_URL=${process.env.VITE_CONVEX_URL}`);
    console.log(`→ CONVEX_SITE_URL=${process.env.CONVEX_SITE_URL}`);
    console.log(`→ SITE_URL=${process.env.SITE_URL}`);

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
    if (!workerUrl) {
      throw new Error("Failed to capture worker URL from alchemy deploy");
    }
    process.env.VITE_AGENT_URL = workerUrl;
    process.env.AGENT_URL = workerUrl;
    console.log(`→ VITE_AGENT_URL=${process.env.VITE_AGENT_URL}`);
    await setConvexEnv("AGENT_URL", workerUrl);
    console.log("→ Set AGENT_URL in Convex env");

    if (!isPreviewDeployment) {
      const backendEnv = await import("@just-use-convex/env/backend");
      for (const [key, value] of Object.entries(backendEnv.env).filter(([_, current]) => !!current)) {
        await setConvexEnv(key, value as string);
      }
      console.log("→ Set Convex env values");
    } else {
      console.log("→ Preview mode: skipping Convex env synchronization, using existing preview env");
    }

    console.log("→ Building web app...");
    runCommand(webViteCli, ["build"], { cwd: webCwd });

    process.exit(0);
  }

  process.env.SITE_URL = resolvedSiteUrl ?? "";
  process.env.ALCHEMY_STAGE = alchemyStage;
  process.env.CONVEX_PREVIEW_NAME = convexPreviewName;

  console.log(`→ Environment: ${process.env.VERCEL_ENV}`);
  console.log(`→ Branch: ${gitBranch ?? "(unknown)"}`);
  console.log(`→ PR: ${pullRequestId ?? "(none)"}`);
  console.log(`→ Mode: ${isPreviewDeployment ? "preview" : "production"}`);
  console.log(`→ SITE_URL=${process.env.SITE_URL}`);
  console.log(`→ ALCHEMY_STAGE=${process.env.ALCHEMY_STAGE}`);

  if (isPreviewDeployment) {
    console.log(`→ Deploying Convex preview: ${convexPreviewName}`);
    await runCommand(backendConvexCli, [
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
    await runCommand(backendConvexCli, [
      "deploy",
      "--cmd",
      continueDeployCommand,
      "--cmd-url-env-var-name",
      "CONVEX_URL",
    ], { cwd: backendCwd });
  }
};

const hasConvexEnvValue = (key: string): boolean => Boolean(getConvexEnvLine(key));

const getConvexEnvValue = (key: string) => {
  const line = getConvexEnvLine(key);
  return line ? line.slice(`${key}=`.length) : undefined;
};

const getConvexEnvLine = (key: string) => {
  const output = runCommandCapture(backendConvexCli, ["env", "list"], { cwd: backendCwd });

  return output
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${key}=`));
};

function formatCommand(bin: string, args: string[]) {
  const formatPart = (part: string) => (part.includes(" ") ? JSON.stringify(part) : part);
  return [formatPart(bin), ...args.map(formatPart)].join(" ");
}

main()
