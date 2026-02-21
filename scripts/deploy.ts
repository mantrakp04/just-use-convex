#!/usr/bin/env bun

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import path from "node:path";
import { spawnSync } from "node:child_process";

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

const isPreview = process.env.VERCEL_ENV === "preview"

if (process.argv.includes("--continue")) {
  console.log(`→ VITE_CONVEX_URL=${process.env.VITE_CONVEX_URL}`);

  const convexUrl = process.env.VITE_CONVEX_URL ?? "";
  process.env.VITE_CONVEX_SITE_URL = convexUrl.replace(
    ".convex.cloud",
    ".convex.site",
  );
  process.env.CONVEX_URL = convexUrl;
  process.env.CONVEX_SITE_URL = process.env.VITE_CONVEX_SITE_URL;

  console.log(`→ CONVEX_SITE_URL=${process.env.CONVEX_SITE_URL}`);
  console.log(`→ SITE_URL=${process.env.SITE_URL}`);

  let workerUrl = "";
  if (process.env.CLOUDFLARE_API_TOKEN) {
    console.log("→ Deploying Cloudflare agent...");
    const output = runCommandCapture("bunx alchemy deploy alchemy.run.ts", {
      cwd: path.resolve(repoRoot, "packages/agent"),
      env: { ALCHEMY_CI_STATE_STORE_CHECK: process.env.ALCHEMY_CI_STATE_STORE_CHECK ?? "false" },
    });
    console.log(output);
    workerUrl = output
      .split("\n")
      .reverse()
      .map((line) => line.trim())
      .find((line) => line.startsWith("ALCHEMY_WORKER_URL="))
      ?.replace("ALCHEMY_WORKER_URL=", "") ?? "";
    if (!workerUrl) {
      throw new Error("Failed to capture worker URL from alchemy deploy");
    }
  } else {
    throw new Error("Cloudflare credentials are missing");
  }

  process.env.VITE_AGENT_URL = workerUrl;
  console.log(`→ VITE_AGENT_URL=${process.env.VITE_AGENT_URL}`);

  console.log("→ Setting Convex environment variables...");
  const convexEnvArgs = isPreview ? `--preview-name ${process.env.CONVEX_PREVIEW_NAME}` : ``;
  const convexEnvBaseCommand = `bunx convex env set ${convexEnvArgs}`;

  process.env.AGENT_URL = workerUrl;


  for (const [key, value] of Object.entries(process.env)) {
    if (value?.trim()) {
      runCommand(`${convexEnvBaseCommand} ${key} "${value}"`, {
        cwd: path.resolve(repoRoot, "packages/backend"),
      });
    } else {
      console.error(`→ Skipping ${key} because it is empty`);
    }
  }

  console.log("→ Building web app...");
  runCommand("bun run build", { cwd: path.resolve(repoRoot, "apps/web") });

  process.exit(0);
}

if (isPreview) {
  const previewRef = sanitizeStage(process.env.VERCEL_GIT_COMMIT_REF);
  process.env.CONVEX_PREVIEW_NAME = previewRef;
  process.env.SITE_URL = `https://${process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL ?? ""}`;
  process.env.ALCHEMY_STAGE = `preview-${previewRef}`;
} else {
  process.env.SITE_URL = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? ""}`;
  process.env.ALCHEMY_STAGE = "prod";
}

console.log(`→ Environment: ${process.env.VERCEL_ENV ?? "unknown"}`);
console.log(`→ SITE_URL=${process.env.SITE_URL}`);
console.log(`→ ALCHEMY_STAGE=${process.env.ALCHEMY_STAGE}`);

if (isPreview) {
  const previewName = process.env.CONVEX_PREVIEW_NAME;
  console.log(`→ Deploying Convex preview: ${previewName}`);
  runCommand(
    `bunx convex deploy --preview-create ${previewName} --cmd "bun scripts/deploy.ts --continue" --cmd-url-env-var-name VITE_CONVEX_URL`,
    { cwd: path.resolve(repoRoot, "packages/backend") },
  );
} else {
  console.log("→ Deploying Convex production");
  runCommand(
    `bunx convex deploy --cmd "bun scripts/deploy.ts --continue" --cmd-url-env-var-name VITE_CONVEX_URL`,
    { cwd: path.resolve(repoRoot, "packages/backend") },
  );
}
