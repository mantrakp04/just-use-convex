import * as functions from "./functions";
import * as stats from "./stats";
import * as types from "./types";
import * as statsTypes from "./statsTypes";
import { zMutation, zQuery } from "../functions";

export const list = zQuery({
  args: types.ListArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListTodos>> => {
    return await functions.ListTodos(ctx, args);
  }
});

export const get = zQuery({
  args: types.GetTodoArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetTodo>> => {
    return await functions.GetTodo(ctx, args);
  }
});

export const create = zMutation({
  args: types.CreateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.CreateTodo>> => {
    return await functions.CreateTodo(ctx, args);
  }
});

export const update = zMutation({
  args: types.UpdateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.UpdateTodo>> => {
    return await functions.UpdateTodo(ctx, args);
  }
});

export const deleteTodo = zMutation({
  args: types.DeleteArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.DeleteTodo>> => {
    return await functions.DeleteTodo(ctx, args);
  }
});

export const assignMember = zMutation({
  args: types.AssignMemberArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.AssignMember>> => {
    return await functions.AssignMember(ctx, args);
  }
});

export const unassignMember = zMutation({
  args: types.UnassignMemberArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.UnassignMember>> => {
    return await functions.UnassignMember(ctx, args);
  }
});

export const listAssigned = zQuery({
  args: types.ListAssignedTodosArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListAssignedTodos>> => {
    return await functions.ListAssignedTodos(ctx, args);
  }
});

export const search = zQuery({
  args: types.SearchArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.SearchTodos>> => {
    return await functions.SearchTodos(ctx, args);
  }
});

// ═══════════════════════════════════════════════════════════════════
// STATS QUERIES
// ═══════════════════════════════════════════════════════════════════

export const getOrgStats = zQuery({
  args: {},
  handler: async (ctx): Promise<ReturnType<typeof stats.GetOrgStats>> => {
    return await stats.GetOrgStats(ctx);
  }
});

export const getTeamStats = zQuery({
  args: statsTypes.TeamStatsArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof stats.GetTeamStats>> => {
    return await stats.GetTeamStats(ctx, args);
  }
});

export const getUserStats = zQuery({
  args: statsTypes.UserStatsArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof stats.GetUserStats>> => {
    return await stats.GetUserStats(ctx, args);
  }
});