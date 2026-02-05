import { z } from "zod";
import { convexToZod } from "convex-helpers/server/zod4";
import { globalAttachmentsZodSchema, globalAttachmentsWithSystemFields } from "../tables/globalAttachments";
import { orgMemberAttachmentsZodSchema, orgMemberAttachmentsWithSystemFields } from "../tables/orgMemberAttachments";
import { paginationOptsValidator } from "convex/server";

export const GlobalAttachment = z.object(globalAttachmentsZodSchema);
export const GlobalAttachmentWithSystemFields = z.object(globalAttachmentsWithSystemFields);

export const OrgMemberAttachment = z.object(orgMemberAttachmentsZodSchema);
export const OrgMemberAttachmentWithSystemFields = z.object(orgMemberAttachmentsWithSystemFields);

export const CreateFromBytesArgs = z.object({
  fileBytes: z.instanceof(Uint8Array),
  fileName: z.string(),
  contentType: z.string().optional(),
});

export const CreateFromHashArgs = z.object({
  hash: z.string(),
  storageId: GlobalAttachmentWithSystemFields.pick({ storageId: true }).shape.storageId.optional(),
  size: z.number(),
  fileName: z.string(),
  contentType: z.string().optional(),
});

export const GetOrgMemberAttachmentArgs = OrgMemberAttachmentWithSystemFields.pick({ _id: true });

export const GetGlobalAttachmentByHashArgs = z.object({
  hash: z.string(),
});

const zPaginationOpts = convexToZod(paginationOptsValidator);

export const ListOrgMemberAttachmentsArgs = z.object({
  paginationOpts: zPaginationOpts,
  memberId: OrgMemberAttachment.pick({ memberId: true }).shape.memberId.optional(),
});

export const DeleteOrgMemberAttachmentArgs = OrgMemberAttachmentWithSystemFields.pick({ _id: true });
