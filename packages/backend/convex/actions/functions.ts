import type { z } from "zod";
import type { zMutationCtx, zQueryCtx } from "../functions";
import * as types from "./types";

async function runActionsQuery(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  return ctx.table("actions", "organizationId", (q) =>
    q.eq("organizationId", ctx.identity.activeOrganizationId)
  )
    .order("desc")
    .filter((q) => {
      const conditions: ReturnType<typeof q.eq>[] = [
        q.eq(q.field("memberId"), ctx.identity.memberId),
      ];

      if (args.filters.name !== undefined) {
        conditions.push(q.eq(q.field("name"), args.filters.name));
      }
      if (args.filters.provider !== undefined) {
        conditions.push(q.eq(q.field("provider"), args.filters.provider));
      }
      if (args.filters.actionKey !== undefined) {
        conditions.push(q.eq(q.field("actionKey"), args.filters.actionKey));
      }
      if (args.filters.status !== undefined) {
        conditions.push(q.eq(q.field("status"), args.filters.status));
      }
      if (args.filters.teamId !== undefined) {
        conditions.push(q.eq(q.field("teamId"), args.filters.teamId));
      }
      if (args.filters.updatedAt !== undefined) {
        conditions.push(q.eq(q.field("updatedAt"), args.filters.updatedAt));
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

export async function ListActions(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  let actions;
  try {
    actions = await runActionsQuery(ctx, args);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("InvalidCursor")) {
      actions = await runActionsQuery(ctx, {
        ...args,
        paginationOpts: { ...args.paginationOpts, cursor: null },
      });
    } else {
      throw error;
    }
  }

  return actions;
}

export async function GetAction(ctx: zQueryCtx, args: z.infer<typeof types.GetArgs>) {
  const action = await ctx.table("actions").getX(args._id);
  if (action.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to view this action");
  }
  if (action.memberId !== ctx.identity.memberId) {
    throw new Error("You are not authorized to view this action");
  }
  return action.doc();
}

export async function CreateAction(ctx: zMutationCtx, args: z.infer<typeof types.CreateArgs>) {
  const now = Date.now();
  const action = await ctx.table("actions").insert({
    ...args.data,
    organizationId: ctx.identity.activeOrganizationId,
    memberId: ctx.identity.memberId,
    updatedAt: now,
  });
  return action;
}

export async function UpdateAction(ctx: zMutationCtx, args: z.infer<typeof types.UpdateArgs>) {
  const action = await ctx.table("actions").getX(args._id);
  if (action.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to update this action");
  }
  if (action.memberId !== ctx.identity.memberId) {
    throw new Error("You are not authorized to update this action");
  }

  const patchData: Record<string, unknown> = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(args.patch)) {
    if (value !== undefined) {
      patchData[key] = value;
    }
  }

  await action.patch(patchData);
  return action;
}

export async function DeleteAction(ctx: zMutationCtx, args: z.infer<typeof types.DeleteArgs>) {
  const action = await ctx.table("actions").getX(args._id);
  if (action.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to delete this action");
  }
  if (action.memberId !== ctx.identity.memberId) {
    throw new Error("You are not authorized to delete this action");
  }

  await action.delete();
  return action;
}
