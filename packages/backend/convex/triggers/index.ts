import * as functions from "./functions";
import * as stats from "./stats";
import * as types from "./types";
import { zMutation, zQuery } from "../functions";

export const list = zQuery({
  args: types.ListArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListTriggers>> => {
    return await functions.ListTriggers(ctx, args);
  },
});

export const get = zQuery({
  args: types.GetArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetTrigger>> => {
    return await functions.GetTrigger(ctx, args);
  },
});

export const create = zMutation({
  args: types.CreateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.CreateTrigger>> => {
    return await functions.CreateTrigger(ctx, args);
  },
});

export const update = zMutation({
  args: types.UpdateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.UpdateTrigger>> => {
    return await functions.UpdateTrigger(ctx, args);
  },
});

export const deleteTrigger = zMutation({
  args: types.DeleteArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.DeleteTrigger>> => {
    return await functions.DeleteTrigger(ctx, args);
  },
});

export const getOrgStats = zQuery({
  args: {},
  handler: async (ctx): Promise<ReturnType<typeof stats.GetOrgStats>> => {
    return await stats.GetOrgStats(ctx);
  },
});

export const getUserStats = zQuery({
  args: {},
  handler: async (ctx): Promise<ReturnType<typeof stats.GetUserStats>> => {
    return await stats.GetUserStats(ctx);
  },
});
