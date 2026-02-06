import type { z } from "zod";
import type { zMutationCtx, zQueryCtx } from "../functions";
import * as types from "./types";
import {
  assertOrganizationAccess,
  assertPermission,
  assertScopedPermission,
} from "../shared/auth_shared";
import { withInvalidCursorRetry } from "../shared/pagination";

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
        .eq("globalAttachmentId", globalAttachment?._id!)
  ).unique();

  const url = await ctx.storage.getUrl(globalAttachment.storageId);
  if (!url) {
    throw new Error("Failed to generate attachment URL");
  }

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
  assertOrganizationAccess(
    attachment.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to view this attachment"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    attachment.memberId,
    { attachment: ["read"] },
    { attachment: ["readAny"] },
    "You are not authorized to view this attachment",
    "You are not authorized to view this attachment"
  );

  const globalAttachment = await attachment.edge("globalAttachment");
  return {
    ...attachment.doc(),
    globalAttachment: globalAttachment.doc(),
  };
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

async function runListOrgMemberAttachmentsQuery(
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
    (nextArgs) => runListOrgMemberAttachmentsQuery(ctx, nextArgs, requestedMemberId),
    (nextArgs) => ({ ...nextArgs, paginationOpts: { ...nextArgs.paginationOpts, cursor: null } })
  );

  const attachmentsWithGlobal = await Promise.all(
    attachments.page.map(async (attachment) => {
      const globalAttachment = await attachment.edge("globalAttachment");
      const url = await ctx.storage.getUrl(globalAttachment.storageId);
      return {
        ...attachment.doc(),
        globalAttachment: globalAttachment.doc(),
        url,
      };
    })
  );

  return {
    ...attachments,
    page: attachmentsWithGlobal,
  };
}

export async function DeleteOrgMemberAttachment(
  ctx: zMutationCtx,
  args: z.infer<typeof types.DeleteOrgMemberAttachmentArgs>
) {
  const attachment = await ctx.table("orgMemberAttachments").getX(args._id);
  assertOrganizationAccess(
    attachment.organizationId,
    ctx.identity.activeOrganizationId,
    "You are not authorized to delete this attachment"
  );
  assertScopedPermission(
    ctx.identity.organizationRole,
    ctx.identity.memberId,
    attachment.memberId,
    { attachment: ["delete"] },
    { attachment: ["deleteAny"] },
    "You are not authorized to delete attachments",
    "You are not authorized to delete other members' attachments"
  );

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
