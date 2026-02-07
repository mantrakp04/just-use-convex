"use node";

import { Daytona, DaytonaNotFoundError } from "@daytonaio/sdk";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { assertPermission } from "../shared/auth_shared";
import { env } from "@just-use-convex/env/backend";
import { zAction, type zActionCtx } from "../functions";
import { z } from "zod";
import { api } from "../_generated/api";
import * as types from "./types";

let daytonaClient: Daytona | null = null;

function getDaytonaClient() {
  if (daytonaClient) {
    return daytonaClient;
  }

  const apiKey = env.DAYTONA_API_KEY;
  if (!apiKey) {
    throw new Error("DAYTONA_API_KEY is required to sync Convex sandboxes with Daytona");
  }

  daytonaClient = new Daytona({
    apiKey,
    ...(env.DAYTONA_API_URL ? { apiUrl: env.DAYTONA_API_URL } : {}),
    ...(env.DAYTONA_TARGET ? { target: env.DAYTONA_TARGET } : {}),
  });

  return daytonaClient;
}

function joinExplorerPath(basePath: string, entryName: string) {
  if (basePath === "/") {
    return `/${entryName}`;
  }
  return `${basePath.replace(/\/$/, "")}/${entryName}`;
}

function normalizeModTime(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return undefined;
}

export const provision = internalAction({
  args: {
    sandboxId: v.id("sandboxes"),
  },
  handler: async (_ctx, args) => {
    const sandboxName = args.sandboxId;
    const daytona = getDaytonaClient();

    try {
      await daytona.get(sandboxName);
      return;
    } catch (error) {
      if (!(error instanceof DaytonaNotFoundError)) {
        throw error;
      }
    }

    await daytona.create({
      name: sandboxName,
      language: "typescript",
      snapshot: "daytona-medium",
      labels: {
        convexSandboxId: sandboxName,
      },
    });
  },
});

export const destroy = internalAction({
  args: {
    sandboxId: v.id("sandboxes"),
  },
  handler: async (_ctx, args) => {
    const daytona = getDaytonaClient();

    try {
      const sandbox = await daytona.get(args.sandboxId);
      await sandbox.delete();
    } catch (error) {
      if (error instanceof DaytonaNotFoundError) {
        return;
      }
      throw error;
    }
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

  const daytona = getDaytonaClient();
  const sandbox = await daytona.get(chat.sandboxId);
  await sandbox.start();
  await sandbox.waitUntilStarted();
  const expiresInMinutes = args.expiresInMinutes ?? 2;

  const [sshAccess, workdir] = await Promise.all([
    sandbox.createSshAccess(expiresInMinutes),
    sandbox.getWorkDir(),
  ]);
  const sshExpiresAt = normalizeModTime(sshAccess.expiresAt);
  if (sshExpiresAt === undefined) {
    throw new Error("Daytona returned an invalid SSH expiration timestamp");
  }

  const explorerPath = workdir ?? "/";
  const explorerEntries = await sandbox.fs.listFiles(explorerPath);

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
    explorer: {
      path: explorerPath,
      entries: explorerEntries.map((entry) => ({
        name: entry.name,
        path: joinExplorerPath(explorerPath, entry.name),
        isDir: entry.isDir,
        size: entry.size ?? 0,
        modifiedAt: normalizeModTime(entry.modTime) ?? 0,
      })),
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

  const daytona = getDaytonaClient();
  const sandbox = await daytona.get(chat.sandboxId);
  await sandbox.start();
  await sandbox.waitUntilStarted();

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
