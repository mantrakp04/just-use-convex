import type { z } from "zod";
import type { zMutationCtx, zQueryCtx } from "../functions";
import * as types from "./types";

async function runSandboxesQuery(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  return ctx.table("sandboxes", "organizationId_userId", (q) => q
    .eq("organizationId", ctx.identity.activeOrganizationId)
    .eq("userId", ctx.identity.userId)
  )
    .order("desc")
    .filter((q) => {
      const conditions: ReturnType<typeof q.eq>[] = [];

      if (args.filters.name !== undefined) {
        conditions.push(q.eq(q.field("name"), args.filters.name));
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

export async function ListSandboxes(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  let sandboxes;
  try {
    sandboxes = await runSandboxesQuery(ctx, args);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("InvalidCursor")) {
      sandboxes = await runSandboxesQuery(ctx, {
        ...args,
        paginationOpts: { ...args.paginationOpts, cursor: null },
      });
    } else {
      throw error;
    }
  }

  return sandboxes;
}

export async function GetSandbox(ctx: zQueryCtx, args: z.infer<typeof types.GetArgs>) {
  const sandbox = await ctx.table("sandboxes").getX(args._id);
  if (sandbox.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to view this sandbox");
  }
  if (sandbox.userId !== ctx.identity.userId) {
    throw new Error("You are not authorized to view this sandbox");
  }
  return sandbox;
}

export async function CreateSandbox(ctx: zMutationCtx, args: z.infer<typeof types.CreateArgs>) {
  const now = Date.now();
  const sandbox = await ctx.table("sandboxes").insert({
    ...args.data,
    organizationId: ctx.identity.activeOrganizationId,
    userId: ctx.identity.userId,
    updatedAt: now,
  });
  return sandbox;
}

export async function UpdateSandbox(ctx: zMutationCtx, args: z.infer<typeof types.UpdateArgs>) {
  const sandbox = await ctx.table("sandboxes").getX(args._id);
  if (sandbox.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to update this sandbox");
  }
  if (sandbox.userId !== ctx.identity.userId) {
    throw new Error("You are not authorized to update this sandbox");
  }

  const patchData: Record<string, unknown> = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(args.patch)) {
    if (value !== undefined) {
      patchData[key] = value;
    }
  }

  await sandbox.patch(patchData);
  return sandbox;
}

export async function DeleteSandbox(ctx: zMutationCtx, args: z.infer<typeof types.DeleteArgs>) {
  const sandbox = await ctx.table("sandboxes").getX(args._id);
  if (sandbox.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to delete this sandbox");
  }
  if (sandbox.userId !== ctx.identity.userId) {
    throw new Error("You are not authorized to delete this sandbox");
  }
  await sandbox.delete();
  return true;
}

export async function GetSandboxChats(ctx: zQueryCtx, args: z.infer<typeof types.GetChatsArgs>) {
  const sandbox = await ctx.table("sandboxes").getX(args._id);
  if (sandbox.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to view this sandbox");
  }
  if (sandbox.userId !== ctx.identity.userId) {
    throw new Error("You are not authorized to view this sandbox");
  }

  // Get chats via the edge relationship
  const chats = await sandbox.edge("chats")
    .order("desc")
    .paginate(args.paginationOpts);

  return chats;
}
