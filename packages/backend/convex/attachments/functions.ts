import type { z } from "zod";
import type { GenericEnt } from "convex-ents";
import type { EntDataModelFromSchema } from "convex-ents/dist/schema";
import type { zMutationCtx, zQueryCtx } from "../functions";
import type schema from "../schema";
import * as types from "./types";
import {
  assertOrganizationAccess,
  assertPermission,
  assertScopedPermission,
} from "../shared/auth";
import { withInvalidCursorRetry } from "../shared/pagination";

type EntDataModel = EntDataModelFromSchema<typeof schema>;
type OrgMemberAttachmentEnt = GenericEnt<EntDataModel, "orgMemberAttachments">;

export async function CreateAttachmentFromHash(
  ctx: zMutationCtx,
  args: z.infer<typeof types.CreateFromHashArgs>
) {
  assertPermission(
    ctx.identity.organizationRole,
    { attachment: ["create"] },
    "You are not authorized to create attachments"
  );

  let globalAttachment = await ctx.table("globalAttachments", "hash", (q) =>
    q.eq("hash", args.hash)
  ).first();

  if (!globalAttachment) {
    if (!args.storageId) {
      throw new Error("Storage id is required for new global attachments");
    }
    const globalAttachmentId = await ctx.table("globalAttachments").insert({
      hash: args.hash,
      storageId: args.storageId,
      size: args.size,
      contentType: args.contentType,
    });
    globalAttachment = await ctx.table("globalAttachments").getX(globalAttachmentId);
  } else {
    if (args.storageId && args.storageId !== globalAttachment.storageId) {
      await ctx.storage.delete(args.storageId);
    }
  }

  if (!globalAttachment) {
    throw new Error("Failed to create global attachment");
  }

  const existingMemberAttachment = await ctx.table(
    "orgMemberAttachments",
    "organizationId_memberId_globalAttachmentId",
    (q) =>
      q
        .eq("organizationId", ctx.identity.activeOrganizationId)
        .eq("memberId", ctx.identity.memberId)
        .eq("globalAttachmentId", globalAttachment._id)
  ).unique();

  const url = await getStorageUrl(ctx, globalAttachment.storageId);

  if (existingMemberAttachment) {
    return {
      globalAttachment: globalAttachment.doc(),
      orgMemberAttachment: existingMemberAttachment.doc(),
      url,
    };
  }

  const orgMemberAttachmentId = await ctx.table("orgMemberAttachments").insert({
    organizationId: ctx.identity.activeOrganizationId,
    memberId: ctx.identity.memberId,
    globalAttachmentId: globalAttachment._id,
    fileName: args.fileName,
    contentType: args.contentType,
    size: args.size,
    updatedAt: Date.now(),
  });
  const orgMemberAttachment = await ctx.table("orgMemberAttachments").getX(orgMemberAttachmentId);

  return {
    globalAttachment: globalAttachment.doc(),
    orgMemberAttachment: orgMemberAttachment.doc(),
    url,
  };
}

export async function GetOrgMemberAttachment(
  ctx: zQueryCtx,
  args: z.infer<typeof types.GetOrgMemberAttachmentArgs>
) {
  const attachment = await ctx.table("orgMemberAttachments").getX(args._id);
  assertOwnedAttachmentAccess(ctx, attachment, "view", "read", "readAny");
  return resolveWithUrl(ctx, attachment);
}

export async function GetGlobalAttachmentByHash(
  ctx: zQueryCtx,
  args: z.infer<typeof types.GetGlobalAttachmentByHashArgs>
) {
  assertPermission(
    ctx.identity.organizationRole,
    { attachment: ["read"] },
    "You are not authorized to view attachments"
  );

  const attachment = await ctx.table("globalAttachments", "hash", (q) =>
    q.eq("hash", args.hash)
  ).first();

  return attachment ? attachment.doc() : null;
}

export async function ListOrgMemberAttachments(
  ctx: zQueryCtx,
  args: z.infer<typeof types.ListOrgMemberAttachmentsArgs>
) {
  const requestedMemberId = args.memberId ?? ctx.identity.memberId;
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    requestedMemberId,
    { attachment: ["read"] },
    { attachment: ["readAny"] },
    "You are not authorized to view attachments",
    "You are not authorized to view other members' attachments"
  );

  const attachments = await withInvalidCursorRetry(
    args,
    (nextArgs) => runListQuery(ctx, nextArgs, requestedMemberId),
    (nextArgs) => ({ ...nextArgs, paginationOpts: { ...nextArgs.paginationOpts, cursor: null } })
  );

  return {
    ...attachments,
    page: await Promise.all(attachments.page.map((a) => resolveWithUrl(ctx, a))),
  };
}

export async function DeleteOrgMemberAttachment(
  ctx: zMutationCtx,
  args: z.infer<typeof types.DeleteOrgMemberAttachmentArgs>
) {
  const attachment = await ctx.table("orgMemberAttachments").getX(args._id);
  assertOwnedAttachmentAccess(ctx, attachment, "delete", "delete", "deleteAny");

  const globalAttachmentId = attachment.globalAttachmentId;
  await attachment.delete();

  const remaining = await ctx.table("orgMemberAttachments", "globalAttachmentId", (q) =>
    q.eq("globalAttachmentId", globalAttachmentId)
  ).first();

  if (remaining) {
    return true;
  }

  const globalAttachment = await ctx.table("globalAttachments").getX(globalAttachmentId);
  await ctx.storage.delete(globalAttachment.storageId);
  await globalAttachment.delete();
  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────

async function getStorageUrl(ctx: Pick<zQueryCtx, "storage">, storageId: string) {
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw new Error("Failed to generate attachment URL");
  return url;
}

async function resolveWithUrl(
  ctx: Pick<zQueryCtx, "storage">,
  attachment: OrgMemberAttachmentEnt
) {
  const globalAttachment = await attachment.edge("globalAttachment");
  const url = await getStorageUrl(ctx, globalAttachment.storageId);
  return { ...attachment.doc(), globalAttachment: globalAttachment.doc(), url };
}

function assertOwnedAttachmentAccess(
  ctx: Pick<zQueryCtx, "identity">,
  attachment: { organizationId: string; memberId: string },
  verb: string,
  ownAction: "read" | "delete",
  anyAction: "readAny" | "deleteAny"
) {
  assertOrganizationAccess(
    attachment.organizationId,
    ctx.identity.activeOrganizationId,
    `You are not authorized to ${verb} this attachment`
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    attachment.memberId,
    { attachment: [ownAction] },
    { attachment: [anyAction] },
    `You are not authorized to ${verb} attachments`,
    `You are not authorized to ${verb} other members' attachments`
  );
}

function runListQuery(
  ctx: zQueryCtx,
  args: z.infer<typeof types.ListOrgMemberAttachmentsArgs>,
  memberId: string
) {
  return ctx.table("orgMemberAttachments", "organizationId_memberId", (q) =>
    q
      .eq("organizationId", ctx.identity.activeOrganizationId)
      .eq("memberId", memberId)
  )
    .order("desc")
    .paginate(args.paginationOpts);
}
