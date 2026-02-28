"use node";

import { internalAction } from "../_generated/server";
import { assertPermission } from "../shared/auth";
import { zAction, type zActionCtx } from "../functions";
import { z } from "zod";
import { api } from "../_generated/api";
import * as types from "./types";
import {
  destroySandbox,
  ensureSandboxReady,
} from "../shared/sandbox";
import { env } from "@just-use-convex/env/backend";
import { Daytona, Sandbox } from "@daytonaio/sdk";

function getDaytonaClient(): Daytona {
  const apiKey = env.DAYTONA_API_KEY;
  if (!apiKey) {
    throw new Error("DAYTONA_API_KEY is required for sandbox operations. Set it in Convex dashboard.");
  }
  return new Daytona({
    apiKey,
    apiUrl: env.DAYTONA_API_URL,
    target: env.DAYTONA_TARGET,
  });
}

export const provision = internalAction({
  args: types.sandboxIdArgs,
  handler: async (_ctx, args) => {
    await ensureSandboxReady(getDaytonaClient(), args.sandboxId);
  },
});

export const destroy = internalAction({
  args: types.sandboxIdArgs,
  handler: async (_ctx, args) => {
    await destroySandbox(getDaytonaClient(), args.sandboxId);
  },
});

export const createChatSshAccess = zAction({
  args: types.CreateChatSshAccessArgs,
  handler: async (ctx, args): Promise<Awaited<ReturnType<Sandbox["createSshAccess"]>>> => {
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

  const sandbox = await ensureSandboxReady(getDaytonaClient(), chat.sandboxId);

  const sshAccess = await sandbox.createSshAccess(args.expiresInMinutes);
  return sshAccess;
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

  const sandbox = await ensureSandboxReady(getDaytonaClient(), chat.sandboxId);

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
