import * as functions from "./functions";
import * as stats from "./stats";
import * as types from "./types";
import { zInternalMutation, zMutation, zQuery } from "../functions";

export const list = zQuery({
  args: types.ListArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListSandboxes>> => {
    return await functions.ListSandboxes(ctx, args);
  },
});

export const get = zQuery({
  args: types.GetArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetSandbox>> => {
    return await functions.GetSandbox(ctx, args);
  },
});

export const create = zMutation({
  args: types.CreateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.CreateSandbox>> => {
    return await functions.CreateSandbox(ctx, args);
  },
});
export const createInternal = zInternalMutation({
  args: types.CreateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.CreateSandbox>> => {
    return await functions.CreateSandbox(ctx, args);
  },
});

export const update = zMutation({
  args: types.UpdateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.UpdateSandbox>> => {
    return await functions.UpdateSandbox(ctx, args);
  },
});

export const deleteSandbox = zMutation({
  args: types.DeleteArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.DeleteSandbox>> => {
    return await functions.DeleteSandbox(ctx, args);
  },
});

export const getChats = zQuery({
  args: types.GetChatsArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetSandboxChats>> => {
    return await functions.GetSandboxChats(ctx, args);
  },
});

// ═══════════════════════════════════════════════════════════════════
// STATS QUERIES
// ═══════════════════════════════════════════════════════════════════

export const getUserStats = zQuery({
  args: {},
  handler: async (ctx): Promise<ReturnType<typeof stats.GetUserSandboxStats>> => {
    return await stats.GetUserSandboxStats(ctx);
  },
});

export const getOrgStats = zQuery({
  args: {},
  handler: async (ctx): Promise<ReturnType<typeof stats.GetOrgSandboxStats>> => {
    return await stats.GetOrgSandboxStats(ctx);
  },
});
