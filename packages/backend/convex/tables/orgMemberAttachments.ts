import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";
import { globalAttachmentsWithSystemFields } from "./globalAttachments";

export const orgMemberAttachmentsZodSchema = {
  organizationId: z.string(),
  memberId: z.string(),
  globalAttachmentId: globalAttachmentsWithSystemFields._id,
  fileName: z.string(),
  contentType: z.string().optional(),
  size: z.number(),
  updatedAt: z.number(),
};

export const orgMemberAttachmentsFields = zodToConvexFields(orgMemberAttachmentsZodSchema);

export const OrgMemberAttachments = Table("orgMemberAttachments", orgMemberAttachmentsFields);

export const systemFields = OrgMemberAttachments.systemFields;
export const zSystemFields = convexToZodFields(systemFields);

export const orgMemberAttachmentsWithSystemFields = {
  ...orgMemberAttachmentsZodSchema,
  ...zSystemFields,
};

const orgMemberAttachmentsTable = OrgMemberAttachments.table
  .index("organizationId_memberId", ["organizationId", "memberId", "updatedAt"])
  .index("organizationId_memberId_globalAttachmentId", ["organizationId", "memberId", "globalAttachmentId"])
  .index("globalAttachmentId", ["globalAttachmentId"])
  .index("organizationId", ["organizationId", "updatedAt"])
  .index("memberId", ["memberId"]);

export const orgMemberAttachmentsEnt = defineEntFromTable(orgMemberAttachmentsTable)
  .edge("globalAttachment", { to: "globalAttachments", field: "globalAttachmentId" });
