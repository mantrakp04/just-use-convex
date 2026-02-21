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
const backendCwd = path.resolve(repoRoot, "packages/backend");
const continueScriptPath = path.resolve(repoRoot, "scripts/deploy.ts");
const continueCommand = `bun ${JSON.stringify(continueScriptPath)} --continue`;

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

const isPreview = process.env.VERCEL_ENV === "preview";
const convexPreviewName = sanitizeStage(process.env.VERCEL_GIT_COMMIT_REF);
const alchemyStage = isPreview ? `preview-${convexPreviewName}` : "prod";
const resolvedSiteUrl = (process.env.VERCEL_BRANCH_URL
  ? `https://${process.env.VERCEL_BRANCH_URL}`
  : process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined);

const main = async () => {
  if (process.argv.includes("--continue")) {
    const convexEnvArgs = isPreview ? `--preview-name ${convexPreviewName}` : "";
    const convexEnvSetCommand = `bunx convex env set${convexEnvArgs ? ` ${convexEnvArgs}` : ""}`;

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

    const existingExternalToken = getConvexEnvValue("EXTERNAL_TOKEN", convexEnvArgs);
    if (existingExternalToken) {
      process.env.EXTERNAL_TOKEN = existingExternalToken;
      console.log("→ EXTERNAL_TOKEN already set in Convex env");
    } else {
      const externalToken = generateSecret();
      process.env.EXTERNAL_TOKEN = externalToken;
      runCommand(`${convexEnvSetCommand} EXTERNAL_TOKEN ${JSON.stringify(externalToken)}`, {
        cwd: backendCwd,
      });
      console.log("→ Generated and set EXTERNAL_TOKEN");
    }

    if (!hasConvexEnvValue("BETTER_AUTH_SECRET", convexEnvArgs)) {
      const betterAuthSecret = generateSecret();
      runCommand(`${convexEnvSetCommand} BETTER_AUTH_SECRET ${JSON.stringify(betterAuthSecret)}`, {
        cwd: backendCwd,
      });
      console.log("→ Generated and set BETTER_AUTH_SECRET");
    } else {
      console.log("→ BETTER_AUTH_SECRET already set in Convex env");
    }

    if (!hasConvexEnvValue("JWKS", convexEnvArgs)) {
      const jwks = await generateJwks();
      runCommand(`${convexEnvSetCommand} JWKS ${JSON.stringify(jwks)}`, {
        cwd: backendCwd,
      });
      console.log("→ Generated and set JWKS");
    } else {
      console.log("→ JWKS already set in Convex env");
    }

    console.log(`→ VITE_CONVEX_URL=${process.env.VITE_CONVEX_URL}`);
    console.log(`→ CONVEX_SITE_URL=${process.env.CONVEX_SITE_URL}`);
    console.log(`→ SITE_URL=${process.env.SITE_URL}`);

    const existingAgentUrl = resolveExistingAgentUrl(convexEnvArgs);
    const hasCloudflareCredentials = Boolean(
      process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY,
    );

    let workerUrl = "";

    if (hasCloudflareCredentials) {
      console.log("→ Deploying Cloudflare agent...");
      const alchemyDeployEnv =
        process.env.CI
          ? { ALCHEMY_CI_STATE_STORE_CHECK: "false" }
          : undefined;

      try {
        const output = runCommandCapture("bunx alchemy deploy alchemy.run.ts", {
          cwd: path.resolve(repoRoot, "packages/agent"),
          env: alchemyDeployEnv,
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
      } catch (error) {
        if (!existingAgentUrl) {
          throw error;
        }
        workerUrl = existingAgentUrl;
        console.warn("→ Alchemy deploy failed, reusing existing AGENT_URL");
      }
    } else {
      if (!existingAgentUrl) {
        throw new Error(
          "Cloudflare credentials are missing and no existing AGENT_URL was found",
        );
      }
      workerUrl = existingAgentUrl;
      console.log(
        "→ Skipping Cloudflare deploy (no credentials), reusing existing AGENT_URL",
      );
    }

    process.env.VITE_AGENT_URL = workerUrl;
    process.env.AGENT_URL = workerUrl;
    console.log(`→ VITE_AGENT_URL=${process.env.VITE_AGENT_URL}`);

    console.log("→ Setting Convex environment variables...");

    await Promise.all(
      Object.entries(deployEnv)
        .filter(([key, value]) => key !== "AGENT_URL" && !!value)
        .map(([key, value]) =>
          runCommand(`${convexEnvSetCommand} ${key} ${JSON.stringify(value)}`, {
            cwd: backendCwd,
          })
        )
    );
    runCommand(`${convexEnvSetCommand} AGENT_URL ${JSON.stringify(workerUrl)}`, {
      cwd: backendCwd,
    });

    console.log("→ Building web app...");
    runCommand("bun run build", { cwd: path.resolve(repoRoot, "apps/web") });

    process.exit(0);
  }

  process.env.SITE_URL = resolvedSiteUrl ?? "";
  process.env.ALCHEMY_STAGE = alchemyStage;
  process.env.CONVEX_PREVIEW_NAME = convexPreviewName;

  console.log(`→ Environment: ${process.env.VERCEL_ENV}`);
  console.log(`→ SITE_URL=${process.env.SITE_URL}`);
  console.log(`→ ALCHEMY_STAGE=${process.env.ALCHEMY_STAGE}`);

  if (isPreview) {
    console.log(`→ Deploying Convex preview: ${convexPreviewName}`);
    runCommand(
      `bunx convex deploy --preview-create ${convexPreviewName} --cmd ${JSON.stringify(continueCommand)} --cmd-url-env-var-name CONVEX_URL`,
      { cwd: backendCwd },
    );
  } else {
    console.log("→ Deploying Convex production");
    runCommand(
      `bunx convex deploy --cmd ${JSON.stringify(continueCommand)} --cmd-url-env-var-name CONVEX_URL`,
      { cwd: backendCwd },
    );
  }
};

const hasConvexEnvValue = (key: string, convexEnvArgs: string) =>
  Boolean(getConvexEnvLine(key, convexEnvArgs));

const getConvexEnvValue = (key: string, convexEnvArgs: string) => {
  const line = getConvexEnvLine(key, convexEnvArgs);
  return line ? line.slice(`${key}=`.length) : undefined;
};

const getConvexEnvLine = (key: string, convexEnvArgs: string) => {
  const output = runCommandCapture(
    `bunx convex env list${convexEnvArgs ? ` ${convexEnvArgs}` : ""} | grep '^${key}=' || true`,
    { cwd: backendCwd },
  );

  return output
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith(`${key}=`));
};

const resolveExistingAgentUrl = (convexEnvArgs: string) =>
  getConvexEnvValue("AGENT_URL", convexEnvArgs) ??
  getConvexEnvValue("AGENT_URL", "") ??
  process.env.VITE_AGENT_URL ??
  process.env.AGENT_URL ??
  deployEnv.AGENT_URL;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
