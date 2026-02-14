"use node";

import { internalAction } from "../_generated/server";
import { assertPermission } from "../shared/auth";
import { zAction, type zActionCtx } from "../functions";
import { z } from "zod";
import { api } from "../_generated/api";
import * as types from "./types";
import { env } from "@just-use-convex/env/backend";
import { Daytona, DaytonaNotFoundError } from "@daytonaio/sdk";

const SANDBOX_START_TIMEOUT_SECONDS = 180;
const SANDBOX_VOLUME_MOUNT_PATH = "/home/daytona";
const SANDBOX_SNAPSHOT = "daytona-medium";
const MAX_VOLUME_READY_RETRIES = 10;
const SANDBOX_START_TIMEOUT_MESSAGE = "timeout waiting for the sandbox to start";

const daytonaClient = new Daytona({
  apiKey: env.DAYTONA_API_KEY,
  apiUrl: env.DAYTONA_API_URL,
  target: env.DAYTONA_TARGET,
});

export const provision = internalAction({
  args: types.sandboxIdArgs,
  handler: async (_ctx, args) => {
    await provisionSandbox(args.sandboxId);
  },
});

export const destroy = internalAction({
  args: types.sandboxIdArgs,
  handler: async (_ctx, args) => {
    await destroySandbox(args.sandboxId);
  },
});

export const createChatSshAccess = zAction({
  args: types.CreateChatSshAccessArgs,
  handler: async (ctx, args): Promise<z.infer<typeof types.CreateChatSshAccessResult>> => {
    return await createChatSshAccessFunction(ctx, args);
  },
});

export const createChatPreviewAccess = zAction({
  args: types.CreateChatPreviewAccessArgs,
  handler: async (ctx, args): Promise<z.infer<typeof types.CreateChatPreviewAccessResult>> => {
    return await createChatPreviewAccessFunction(ctx, args);
  },
});

async function createChatSshAccessFunction(ctx: zActionCtx, args: z.infer<typeof types.CreateChatSshAccessArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { sandbox: ["read"] },
    "You are not authorized to access this sandbox"
  );

  const chat = await ctx.runQuery(api.chats.index.get, {
    _id: args.chatId,
  })

  if (!chat.sandboxId) {
    throw new Error("This chat does not have a sandbox attached");
  }

  const sandbox = await daytonaClient.get(chat.sandboxId);
  await ensureSandboxStarted(sandbox);
  const expiresInMinutes = args.expiresInMinutes ?? 2;

  const sshAccess = await sandbox.createSshAccess(expiresInMinutes);
  const sshExpiresAt = normalizeModTime(sshAccess.expiresAt);
  if (sshExpiresAt === undefined) {
    throw new Error("Daytona returned an invalid SSH expiration timestamp");
  }

  return {
    chatId: chat._id,
    sandboxId: chat.sandboxId,
    sandboxName: chat.sandbox?.name ?? chat.sandboxId,
    ssh: {
      token: sshAccess.token,
      expiresAt: sshExpiresAt,
      expiresInMinutes,
      host: "ssh.app.daytona.io",
      command: `ssh ${sshAccess.token}@ssh.app.daytona.io`,
    },
  };
}

async function createChatPreviewAccessFunction(ctx: zActionCtx, args: z.infer<typeof types.CreateChatPreviewAccessArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { sandbox: ["read"] },
    "You are not authorized to access this sandbox"
  );

  const chat = await ctx.runQuery(api.chats.index.get, {
    _id: args.chatId,
  })
  if (!chat.sandboxId) {
    throw new Error("This chat does not have a sandbox attached");
  }

  const sandbox = await daytonaClient.get(chat.sandboxId);
  await ensureSandboxStarted(sandbox);

  const [previewLink, signedPreviewLink] = await Promise.all([
    sandbox.getPreviewLink(args.previewPort),
    sandbox.getSignedPreviewUrl(args.previewPort, 60 * 2),
  ]);

  return {
    chatId: chat._id,
    sandboxId: chat.sandboxId,
    sandboxName: chat.sandbox?.name ?? chat.sandboxId,
    preview: {
      port: args.previewPort,
      url: signedPreviewLink.url,
      token: previewLink.token ?? null,
    },
  };
}

async function provisionSandbox(sandboxId: types.SandboxId) {
  const volumeName = sandboxId;

  try {
    await daytonaClient.get(sandboxId);
    return;
  } catch (error) {
    if (!isDaytonaSandboxMissing(error)) {
      throw error;
    }
  }

  const volume = await waitForVolumeReady(daytonaClient, volumeName);
  await daytonaClient.create(createSandboxCreateOptions(sandboxId, volume));
}

async function destroySandbox(sandboxId: types.SandboxId) {
  const volumeName = sandboxId;

  try {
    const sandbox = await daytonaClient.get(sandboxId);
    await sandbox.delete();
  } catch (error) {
    if (!isDaytonaSandboxMissing(error)) {
      throw error;
    }
    // Sandbox may already be gone; continue and try deleting the dedicated volume.
  }

  try {
    const volume = await daytonaClient.volume.get(volumeName, false);
    await daytonaClient.volume.delete(volume);
  } catch (error) {
    if (isDaytonaSandboxMissing(error)) {
      return;
    }
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureSandboxStarted(
  sandbox: Awaited<ReturnType<Daytona["get"]>>,
  options: { startTimeoutSeconds?: number } = {}
) {
  const startTimeoutSeconds =
    typeof options.startTimeoutSeconds === "number" &&
    Number.isFinite(options.startTimeoutSeconds) &&
    options.startTimeoutSeconds > 0
      ? options.startTimeoutSeconds
      : undefined;

  const state = sandbox.state;
  if (state === "started") {
    return;
  }
  if (state === "starting") {
    await sandbox.waitUntilStarted(startTimeoutSeconds);
    return;
  }
  if (state === "stopping" || state === "creating" || state === "restoring") {
    await sleep(3000);
    await sandbox.refreshData();
    return ensureSandboxStarted(sandbox, options);
  }
  if (state === "error" || state === "build_failed") {
    if (sandbox.recoverable) {
      await sandbox.recover(startTimeoutSeconds);
      await sandbox.waitUntilStarted(startTimeoutSeconds);
      return;
    }
    throw new Error(
      `Sandbox is in an unrecoverable ${state} state${sandbox.errorReason ? `: ${sandbox.errorReason}` : ""}`
    );
  }
  if (state === "destroyed" || state === "destroying" || state === "archived") {
    throw new Error(`Sandbox is ${state} and cannot be started`);
  }
  await sandbox.start(startTimeoutSeconds);
  await sandbox.waitUntilStarted(startTimeoutSeconds);
}

async function waitForVolumeReady(daytona: Daytona, volumeName: string) {
  let volume = await daytona.volume.get(volumeName, true);

  let attempts = 0;
  while (volume.state !== "ready" && attempts < MAX_VOLUME_READY_RETRIES) {
    if (volume.state === "error") {
      throw new Error(
        `Volume '${volumeName}' entered error state: ${volume.errorReason ?? "unknown reason"}`
      );
    }
    await sleep(1000);
    volume = await daytona.volume.get(volumeName, false);
    attempts++;
  }

  if (volume.state !== "ready") {
    throw new Error(`Volume '${volumeName}' did not become ready`);
  }

  return volume;
}

function createSandboxCreateOptions(
  sandboxId: string,
  volume: { id: string },
) {
  return {
    name: sandboxId,
    snapshot: SANDBOX_SNAPSHOT,
    volumes: [{ volumeId: volume.id, mountPath: SANDBOX_VOLUME_MOUNT_PATH }],
  };
}

function isDaytonaSandboxMissing(error: unknown): boolean {
  return error instanceof DaytonaNotFoundError;
}

function normalizeModTime(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
