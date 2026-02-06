import type { z } from "zod";
import type { zMutationCtx, zQueryCtx } from "../functions";
import * as types from "./types";
import { withInvalidCursorRetry } from "../shared/pagination";
import {
  assertOrganizationAccess,
  assertPermission,
  assertScopedPermission,
} from "../shared/auth_shared";

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
  assertPermission(
    ctx.identity.organizationRole,
    { sandbox: ["read"] },
    "You are not authorized to view sandboxes"
  );

  return withInvalidCursorRetry(
    args,
    (nextArgs) => runSandboxesQuery(ctx, nextArgs),
    (nextArgs) => ({ ...nextArgs, paginationOpts: { ...nextArgs.paginationOpts, cursor: null } })
  );
}

export async function GetSandbox(ctx: zQueryCtx, args: z.infer<typeof types.GetArgs>) {
  const sandbox = await ctx.table("sandboxes").getX(args._id);
  assertOrganizationAccess(
    sandbox.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to view this sandbox"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.userId,
    sandbox.userId,
    { sandbox: ["read"] },
    { sandbox: ["readAny"] },
    "You are not authorized to view this sandbox",
    "You are not authorized to view this sandbox"
  );
  return sandbox;
}

export async function CreateSandbox(ctx: zMutationCtx, args: z.infer<typeof types.CreateArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { sandbox: ["create"] },
    "You are not authorized to create sandboxes"
  );

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
  assertOrganizationAccess(
    sandbox.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to update this sandbox"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.userId,
    sandbox.userId,
    { sandbox: ["update"] },
    { sandbox: ["updateAny"] },
    "You are not authorized to update this sandbox",
    "You are not authorized to update this sandbox"
  );

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
  assertOrganizationAccess(
    sandbox.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to delete this sandbox"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.userId,
    sandbox.userId,
    { sandbox: ["delete"] },
    { sandbox: ["deleteAny"] },
    "You are not authorized to delete this sandbox",
    "You are not authorized to delete this sandbox"
  );
  await sandbox.delete();
  return true;
}

export async function SearchSandboxes(ctx: zQueryCtx, args: z.infer<typeof types.SearchArgs>) {
  assertPermission(
    ctx.identity.organizationRole,
    { sandbox: ["read"] },
    "You are not authorized to search sandboxes"
  );

  return ctx.db
    .query("sandboxes")
    .withSearchIndex("name", (q) =>
      q.search("name", args.query)
        .eq("organizationId", ctx.identity.activeOrganizationId)
        .eq("userId", ctx.identity.userId)
    )
    .paginate(args.paginationOpts);
}

export async function GetSandboxChats(ctx: zQueryCtx, args: z.infer<typeof types.GetChatsArgs>) {
  const sandbox = await ctx.table("sandboxes").getX(args._id);
  assertOrganizationAccess(
    sandbox.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to view this sandbox"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.userId,
    sandbox.userId,
    { sandbox: ["read"] },
    { sandbox: ["readAny"] },
    "You are not authorized to view this sandbox",
    "You are not authorized to view this sandbox"
  );

  // Get chats via the edge relationship
  const chats = await sandbox.edge("chats")
    .order("desc")
    .paginate(args.paginationOpts);

  return chats;
}
