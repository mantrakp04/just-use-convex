#!/usr/bin/env bun

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { env as deployEnv } from "@just-use-convex/env/deploy";

type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const sanitizeStage = (raw = "preview") => {
  const normalized = raw
    .toLowerCase()
    .replaceAll("/", "-")
    .replaceAll(/[^a-z0-9-]/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  return normalized || "preview";
};

const runCommand = (command: string, options: RunOptions = {}) => {
  const result = spawnSync(command, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    shell: true,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command}`);
  }
};

const runCommandCapture = (command: string, options: RunOptions = {}) => {
  const result = spawnSync(command, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    shell: true,
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
    throw new Error(`Command failed (${result.status}): ${command}`);
  }

  return output;
};

const shouldRegenerateSecret = (value?: string) => !value?.trim() || value.trim() === "meow";
const shouldRegenerate = (value?: string, force = false) =>
  force || shouldRegenerateSecret(value);

const generateSecret = () => randomBytes(32).toString("base64url");

const generateJwks = async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });

  const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  const privateJwk = privateKey.export({ format: "jwk" }) as Record<string, unknown>;
  const keyId = randomBytes(16).toString("hex");

  return JSON.stringify({
    keys: [
      {
        alg: "RS256",
        createdAt: Date.now(),
        id: keyId,
        privateKey: JSON.stringify({ ...privateJwk, alg: "RS256", kid: keyId }),
        publicKey: JSON.stringify({ ...publicJwk, alg: "RS256", kid: keyId }),
      },
    ],
  });
};

const isPreview = deployEnv.VERCEL_ENV === "preview";
const shouldRegenerateOnDeploy = process.argv.includes("--regen");
const sanitizedPreviewName = sanitizeStage(deployEnv.VERCEL_GIT_COMMIT_REF);
const convexPreviewName = deployEnv.CONVEX_PREVIEW_NAME ?? sanitizedPreviewName;
const alchemyStage = isPreview ? `preview-${convexPreviewName}` : "prod";

const main = async () => {
  if (process.argv.includes("--continue")) {
    const convexUrl = deployEnv.VITE_CONVEX_URL;
    if (!convexUrl) {
      throw new Error("VITE_CONVEX_URL is required in --continue mode");
    }

    const convexSiteUrl = (deployEnv.VITE_CONVEX_SITE_URL ?? deployEnv.CONVEX_SITE_URL) ?? convexUrl.replace(
      ".convex.cloud",
      ".convex.site",
    );

    process.env.VITE_CONVEX_URL = convexUrl;
    process.env.CONVEX_URL = convexUrl;
    process.env.VITE_CONVEX_SITE_URL = convexSiteUrl;
    process.env.CONVEX_SITE_URL = convexSiteUrl;
    process.env.SITE_URL = process.env.SITE_URL ?? deployEnv.SITE_URL ?? "";
    process.env.ALCHEMY_STAGE = process.env.ALCHEMY_STAGE ?? alchemyStage;
    process.env.CONVEX_PREVIEW_NAME = process.env.CONVEX_PREVIEW_NAME ?? convexPreviewName;

    console.log(`→ VITE_CONVEX_URL=${process.env.VITE_CONVEX_URL}`);
    console.log(`→ CONVEX_SITE_URL=${process.env.CONVEX_SITE_URL}`);
    console.log(`→ SITE_URL=${process.env.SITE_URL}`);

    console.log("→ Deploying Cloudflare agent...");
    const output = runCommandCapture("bunx alchemy deploy alchemy.run.ts", {
      cwd: path.resolve(repoRoot, "packages/agent"),
      env: { ALCHEMY_CI_STATE_STORE_CHECK: deployEnv.ALCHEMY_CI_STATE_STORE_CHECK ?? "false" },
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

    if (shouldRegenerateSecret(deployEnv.EXTERNAL_TOKEN)) {
      process.env.EXTERNAL_TOKEN = generateSecret();
      console.log("→ Generated EXTERNAL_TOKEN");
    }
    if (shouldRegenerate(deployEnv.BETTER_AUTH_SECRET, shouldRegenerateOnDeploy)) {
      process.env.BETTER_AUTH_SECRET = generateSecret();
      console.log("→ Generated BETTER_AUTH_SECRET");
    }
    if (shouldRegenerate(deployEnv.JWKS, shouldRegenerateOnDeploy)) {
      process.env.JWKS = await generateJwks();
      console.log("→ Generated JWKS");
    }

    console.log("→ Setting Convex environment variables...");
    const convexEnvArgs = isPreview ? `--preview-name ${convexPreviewName}` : "";
    const convexEnvBaseCommand = `bunx convex env set ${convexEnvArgs}`;

    await Promise.all(
      Object.entries(deployEnv)
        .filter(([_, value]) => !!value)
        .map(([key, value]) =>
          runCommand(`${convexEnvBaseCommand} ${key} ${JSON.stringify(value)}`, {
            cwd: path.resolve(repoRoot, "packages/backend"),
          })
        )
    );

    console.log("→ Building web app...");
    runCommand("bun run build", { cwd: path.resolve(repoRoot, "apps/web") });

    process.exit(0);
  }

  process.env.SITE_URL = deployEnv.SITE_URL ?? "";
  process.env.ALCHEMY_STAGE = alchemyStage;
  process.env.CONVEX_PREVIEW_NAME = convexPreviewName;

  console.log(`→ Environment: ${deployEnv.VERCEL_ENV ?? "unknown"}`);
  console.log(`→ SITE_URL=${process.env.SITE_URL}`);
  console.log(`→ ALCHEMY_STAGE=${process.env.ALCHEMY_STAGE}`);

  if (isPreview) {
    console.log(`→ Deploying Convex preview: ${convexPreviewName}`);
    runCommand(
      `bunx convex deploy --preview-create ${convexPreviewName} --cmd "bun scripts/deploy.ts --continue" --cmd-url-env-var-name VITE_CONVEX_URL`,
      { cwd: path.resolve(repoRoot, "packages/backend") },
    );
  } else {
    console.log("→ Deploying Convex production");
    runCommand(
      `bunx convex deploy --cmd "bun scripts/deploy.ts --continue" --cmd-url-env-var-name VITE_CONVEX_URL`,
      { cwd: path.resolve(repoRoot, "packages/backend") },
    );
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
