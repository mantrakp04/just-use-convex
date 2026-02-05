import * as functions from "./functions";
import * as stats from "./stats";
import * as types from "./types";
import { zAction, zMutation, zQuery } from "../functions";

export const createFromBytes = zAction({
  args: types.CreateFromBytesArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.CreateAttachmentFromBytes>> => {
    return await functions.CreateAttachmentFromBytes(ctx, args);
  },
});

export const createFromHash = zMutation({
  args: types.CreateFromHashArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.CreateAttachmentFromHash>> => {
    return await functions.CreateAttachmentFromHash(ctx, args);
  },
});

export const get = zQuery({
  args: types.GetOrgMemberAttachmentArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetOrgMemberAttachment>> => {
    return await functions.GetOrgMemberAttachment(ctx, args);
  },
});

export const getGlobalByHash = zQuery({
  args: types.GetGlobalAttachmentByHashArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetGlobalAttachmentByHash>> => {
    return await functions.GetGlobalAttachmentByHash(ctx, args);
  },
});

export const list = zQuery({
  args: types.ListOrgMemberAttachmentsArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListOrgMemberAttachments>> => {
    return await functions.ListOrgMemberAttachments(ctx, args);
  },
});

export const deleteAttachment = zMutation({
  args: types.DeleteOrgMemberAttachmentArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.DeleteOrgMemberAttachment>> => {
    return await functions.DeleteOrgMemberAttachment(ctx, args);
  },
});

// ═══════════════════════════════════════════════════════════════════
// STATS QUERIES
// ═══════════════════════════════════════════════════════════════════

export const getMemberStats = zQuery({
  args: {},
  handler: async (ctx): Promise<ReturnType<typeof stats.GetMemberAttachmentStats>> => {
    return await stats.GetMemberAttachmentStats(ctx);
  },
});

export const getOrgStats = zQuery({
  args: {},
  handler: async (ctx): Promise<ReturnType<typeof stats.GetOrgAttachmentStats>> => {
    return await stats.GetOrgAttachmentStats(ctx);
  },
});
