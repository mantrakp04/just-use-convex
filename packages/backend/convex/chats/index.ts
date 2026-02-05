import * as functions from "./functions";
import * as stats from "./stats";
import * as types from "./types";
import { zExternalMutation, zExternalQuery, zMutation, zQuery } from "../functions";

export const list = zQuery({
  args: types.ListArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListChats>> => {
    return await functions.ListChats(ctx, args);
  },
});

export const get = zQuery({
  args: types.GetChatArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetChat>> => {
    return await functions.GetChat(ctx, args);
  },
});
export const getExt = zExternalQuery({
  args: types.GetChatArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetChat>> => {
    return await functions.GetChat(ctx, args);
  },
});

export const create = zMutation({
  args: types.CreateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.CreateChat>> => {
    return await functions.CreateChat(ctx, args);
  },
});

export const update = zMutation({
  args: types.UpdateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.UpdateChat>> => {
    return await functions.UpdateChat(ctx, args);
  },
});
export const updateExt = zExternalMutation({
  args: types.UpdateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.UpdateChat>> => {
    return await functions.UpdateChat(ctx, args);
  },
});

export const deleteChat = zMutation({
  args: types.DeleteArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.DeleteChat>> => {
    return await functions.DeleteChat(ctx, args);
  },
});

export const search = zQuery({
  args: types.SearchArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.SearchChats>> => {
    return await functions.SearchChats(ctx, args);
  },
});

// ═══════════════════════════════════════════════════════════════════
// STATS QUERIES
// ═══════════════════════════════════════════════════════════════════

export const getMemberStats = zQuery({
  args: {},
  handler: async (ctx): Promise<ReturnType<typeof stats.GetMemberChatStats>> => {
    return await stats.GetMemberChatStats(ctx);
  },
});

export const getOrgStats = zQuery({
  args: {},
  handler: async (ctx): Promise<ReturnType<typeof stats.GetOrgChatStats>> => {
    return await stats.GetOrgChatStats(ctx);
  },
});
