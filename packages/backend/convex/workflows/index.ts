import * as functions from "./functions";
import * as types from "./types";
import { zExternalMutation, zExternalQuery, zInternalMutation, zMutation, zQuery } from "../functions";

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW QUERIES
// ═══════════════════════════════════════════════════════════════════

export const list = zQuery({
  args: types.ListArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListWorkflows>> => {
    return await functions.ListWorkflows(ctx, args);
  },
});

export const listExt = zExternalQuery({
  args: types.ListArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListWorkflows>> => {
    return await functions.ListWorkflows(ctx, args);
  },
});

export const get = zQuery({
  args: types.GetArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetWorkflow>> => {
    return await functions.GetWorkflow(ctx, args);
  },
});

export const getExt = zExternalQuery({
  args: types.GetArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetWorkflow>> => {
    return await functions.GetWorkflow(ctx, args);
  },
});

// Agent-side: fetch workflow definition for execution
export const getForExecutionExt = zExternalQuery({
  args: types.GetForExecutionArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetWorkflowForExecution>> => {
    return await functions.GetWorkflowForExecution(ctx, args);
  },
});

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW MUTATIONS
// ═══════════════════════════════════════════════════════════════════

export const create = zMutation({
  args: types.CreateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.CreateWorkflow>> => {
    return await functions.CreateWorkflow(ctx, args);
  },
});

export const update = zMutation({
  args: types.UpdateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.UpdateWorkflow>> => {
    return await functions.UpdateWorkflow(ctx, args);
  },
});

export const updateExt = zExternalMutation({
  args: types.UpdateArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.UpdateWorkflow>> => {
    return await functions.UpdateWorkflow(ctx, args);
  },
});

export const deleteWorkflow = zMutation({
  args: types.DeleteArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.DeleteWorkflow>> => {
    return await functions.DeleteWorkflow(ctx, args);
  },
});

export const deleteWorkflowExt = zExternalMutation({
  args: types.DeleteArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.DeleteWorkflow>> => {
    return await functions.DeleteWorkflow(ctx, args);
  },
});

export const toggle = zMutation({
  args: types.ToggleArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ToggleWorkflow>> => {
    return await functions.ToggleWorkflow(ctx, args);
  },
});

// ═══════════════════════════════════════════════════════════════════
// EXECUTION QUERIES
// ═══════════════════════════════════════════════════════════════════

export const listExecutions = zQuery({
  args: types.ListExecutionsArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListExecutions>> => {
    return await functions.ListExecutions(ctx, args);
  },
});

export const listExecutionsExt = zExternalQuery({
  args: types.ListExecutionsArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.ListExecutions>> => {
    return await functions.ListExecutions(ctx, args);
  },
});

export const getExecution = zQuery({
  args: types.GetExecutionArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetExecution>> => {
    return await functions.GetExecution(ctx, args);
  },
});

export const getExecutionExt = zExternalQuery({
  args: types.GetExecutionArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.GetExecution>> => {
    return await functions.GetExecution(ctx, args);
  },
});

// ═══════════════════════════════════════════════════════════════════
// EXECUTION MUTATIONS
// ═══════════════════════════════════════════════════════════════════

export const createExecution = zInternalMutation({
  args: types.CreateExecutionArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.CreateExecution>> => {
    return await functions.CreateExecution(ctx, args);
  },
});

// Agent-side: report execution progress
export const updateExecutionStatusExt = zExternalMutation({
  args: types.UpdateExecutionStatusArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.UpdateExecutionStatus>> => {
    return await functions.UpdateExecutionStatus(ctx, args);
  },
});

export const retryExecution = zMutation({
  args: types.RetryExecutionArgs,
  handler: async (ctx, args): Promise<ReturnType<typeof functions.RetryExecution>> => {
    return await functions.RetryExecution(ctx, args);
  },
});
