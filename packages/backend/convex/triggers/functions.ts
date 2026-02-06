import type { z } from "zod";
import type { zMutationCtx, zQueryCtx } from "../functions";
import * as types from "./types";

async function runTriggersQuery(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  return ctx.table("triggers", "organizationId", (q) =>
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
      if (args.filters.eventKey !== undefined) {
        conditions.push(q.eq(q.field("eventKey"), args.filters.eventKey));
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

export async function ListTriggers(ctx: zQueryCtx, args: z.infer<typeof types.ListArgs>) {
  let triggers;
  try {
    triggers = await runTriggersQuery(ctx, args);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("InvalidCursor")) {
      triggers = await runTriggersQuery(ctx, {
        ...args,
        paginationOpts: { ...args.paginationOpts, cursor: null },
      });
    } else {
      throw error;
    }
  }

  return triggers;
}

export async function GetTrigger(ctx: zQueryCtx, args: z.infer<typeof types.GetArgs>) {
  const trigger = await ctx.table("triggers").getX(args._id);
  if (trigger.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to view this trigger");
  }
  if (trigger.memberId !== ctx.identity.memberId) {
    throw new Error("You are not authorized to view this trigger");
  }
  return trigger.doc();
}

export async function CreateTrigger(ctx: zMutationCtx, args: z.infer<typeof types.CreateArgs>) {
  const now = Date.now();
  const trigger = await ctx.table("triggers").insert({
    ...args.data,
    organizationId: ctx.identity.activeOrganizationId,
    memberId: ctx.identity.memberId,
    updatedAt: now,
  });
  return trigger;
}

export async function UpdateTrigger(ctx: zMutationCtx, args: z.infer<typeof types.UpdateArgs>) {
  const trigger = await ctx.table("triggers").getX(args._id);
  if (trigger.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to update this trigger");
  }
  if (trigger.memberId !== ctx.identity.memberId) {
    throw new Error("You are not authorized to update this trigger");
  }

  const patchData: Record<string, unknown> = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(args.patch)) {
    if (value !== undefined) {
      patchData[key] = value;
    }
  }

  await trigger.patch(patchData);
  return trigger;
}

export async function DeleteTrigger(ctx: zMutationCtx, args: z.infer<typeof types.DeleteArgs>) {
  const trigger = await ctx.table("triggers").getX(args._id);
  if (trigger.organizationId !== ctx.identity.activeOrganizationId) {
    throw new Error("You are not authorized to delete this trigger");
  }
  if (trigger.memberId !== ctx.identity.memberId) {
    throw new Error("You are not authorized to delete this trigger");
  }

  await trigger.delete();
  return trigger;
}
