import * as functions from "./functions";
import * as stats from "./stats";
import * as types from "./types";
import { zInternalMutation, zMutation, zQuery } from "../functions";

export const list = zQuery({
  args: types.ListArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListActions>> => {
    return await functions.ListActions(ctx, args);
  },
});

export const get = zQuery({
  args: types.GetArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetAction>> => {
    return await functions.GetAction(ctx, args);
  },
});

export const create = zMutation({
  args: types.CreateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.CreateAction>> => {
    return await functions.CreateAction(ctx, args);
  },
});

export const update = zMutation({
  args: types.UpdateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.UpdateAction>> => {
    return await functions.UpdateAction(ctx, args);
  },
});

export const deleteAction = zMutation({
  args: types.DeleteArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.DeleteAction>> => {
    return await functions.DeleteAction(ctx, args);
  },
});

export const linkChatToWorkflowRun = zInternalMutation({
  args: types.StartWorkflowRunArgs,
  handler: async (ctx, args) => {
    const workflowRun = await ctx.table("workflowRuns").getX(args.workflowRunId);
    const chat = await ctx.table("chats").getX(args.chatId);

    if (workflowRun.organizationId !== ctx.identity.activeOrganizationId) {
      throw new Error("You are not authorized to update this workflow run");
    }
    if (chat.organizationId !== ctx.identity.activeOrganizationId) {
      throw new Error("You are not authorized to use this chat");
    }

    await workflowRun.patch({ chatId: args.chatId, updatedAt: Date.now() });
    return workflowRun;
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
