import type { z } from "zod";
import type { zMutationCtx, zQueryCtx } from "../functions";
import * as types from "./types";

async function runChatsQuery(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  return ctx.table("chats", "organizationId_userId_isPinned", (q) => q
    .eq("organizationId", ctx.identity.activeOrganizationId)
    .eq("userId", ctx.identity.userId)
    .eq("isPinned", args.filters.isPinned)
  )
    .order("desc")
    .filter((q) => {
      const conditions: ReturnType<typeof q.eq>[] = [];

      if (args.filters.title !== undefined) {
        conditions.push(q.eq(q.field("title"), args.filters.title));
      }

      if (conditions.length === 0) {
        return true;
      }
      if (conditions.length === 1) {
        return conditions[0]!;
      }
      return q.and(...conditions);
    })
    .paginate(args.paginationOpts);
}

export async function ListChats(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  let chats;
  try {
    chats = await runChatsQuery(ctx, args);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("InvalidCursor")) {
      chats = await runChatsQuery(ctx, {
        ...args,
        paginationOpts: { ...args.paginationOpts, cursor: null },
      });
    } else {
      throw error;
    }
  }

  return chats;
}

export async function GetChat(ctx: zQueryCtx, args: z.infer<typeof types.GetChatArgs>) {
  const chat = await ctx.table("chats").getX(args._id);
  if (chat.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to view this chat");
  }
  if (chat.userId !== ctx.identity.userId) {
    throw new Error("You are not authorized to view this chat");
  }
  return chat;
}

export async function CreateChat(ctx: zMutationCtx, args: z.infer<typeof types.CreateArgs>) {
  const now = Date.now();
  const chat = await ctx.table("chats").insert({
    ...args.data,
    organizationId: ctx.identity.activeOrganizationId,
    userId: ctx.identity.userId,
    isPinned: false,
    updatedAt: now,
  });
  return chat;
}

export async function UpdateChat(ctx: zMutationCtx, args: z.infer<typeof types.UpdateArgs>) {
  const chat = await ctx.table("chats").getX(args._id);
  if (chat.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to update this chat");
  }
  if (chat.userId !== ctx.identity.userId) {
    throw new Error("You are not authorized to update this chat");
  }

  const patchData: Record<string, unknown> = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(args.patch)) {
    if (value !== undefined) {
      patchData[key] = value;
    }
  }

  await chat.patch(patchData);
  return chat;
}

export async function DeleteChat(ctx: zMutationCtx, args: z.infer<typeof types.DeleteArgs>) {
  const chat = await ctx.table("chats").getX(args._id);
  if (chat.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to delete this chat");
  }
  if (chat.userId !== ctx.identity.userId) {
    throw new Error("You are not authorized to delete this chat");
  }
  await chat.delete();
  return true;
}
