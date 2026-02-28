import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import * as functions from "./functions";
import * as executions from "./executions";
import * as types from "./types";
import { zExternalMutation, zExternalQuery, zInternalMutation, zMutation, zQuery } from "../functions";

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW QUERIES
// ═══════════════════════════════════════════════════════════════════

export const list = zQuery({ args: types.ListArgs, handler: functions.ListWorkflows });
export const listExt = zExternalQuery({ args: types.ListArgs, handler: functions.ListWorkflows });

export const get = zQuery({ args: types.GetArgs, handler: functions.GetWorkflow });
export const getExt = zExternalQuery({ args: types.GetArgs, handler: functions.GetWorkflow });
export const getForExecutionExt = zExternalQuery({ args: types.GetArgs, handler: functions.GetWorkflow });

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW MUTATIONS
// ═══════════════════════════════════════════════════════════════════

export const create = zMutation({ args: types.CreateArgs, handler: functions.CreateWorkflow });
export const update = zMutation({ args: types.UpdateArgs, handler: functions.UpdateWorkflow });
export const updateExt = zExternalMutation({ args: types.UpdateArgs, handler: functions.UpdateWorkflow });
export const deleteWorkflow = zMutation({ args: types.DeleteArgs, handler: functions.DeleteWorkflow });
export const deleteWorkflowExt = zExternalMutation({ args: types.DeleteArgs, handler: functions.DeleteWorkflow });
export const toggle = zMutation({ args: types.ToggleArgs, handler: functions.ToggleWorkflow });

// ═══════════════════════════════════════════════════════════════════
// EXECUTION QUERIES
// ═══════════════════════════════════════════════════════════════════

export const listExecutions = zQuery({ args: types.ListExecutionsArgs, handler: executions.ListExecutions });
export const listExecutionsExt = zExternalQuery({ args: types.ListExecutionsArgs, handler: executions.ListExecutions });
export const getExecution = zQuery({ args: types.GetExecutionArgs, handler: executions.GetExecution });
export const getExecutionExt = zExternalQuery({ args: types.GetExecutionArgs, handler: executions.GetExecution });

// ═══════════════════════════════════════════════════════════════════
// EXECUTION MUTATIONS
// ═══════════════════════════════════════════════════════════════════

export const createExecution = zInternalMutation({ args: types.CreateExecutionArgs, handler: executions.CreateExecution });
export const updateExecutionStatusExt = zExternalMutation({ args: types.UpdateExecutionStatusArgs, handler: executions.UpdateExecutionStatus });
export const retryExecution = zMutation({ args: types.RetryExecutionArgs, handler: executions.RetryExecution });
export const recordWorkflowStepOutcomeExt = zExternalMutation({ args: types.RecordWorkflowStepOutcomeArgs, handler: executions.RecordWorkflowStepOutcome });
export const finalizeWorkflowStepsExt = zExternalMutation({ args: types.FinalizeWorkflowStepsArgs, handler: executions.FinalizeWorkflowSteps });

// ═══════════════════════════════════════════════════════════════════
// INTERNAL (dispatch, scheduler, http webhook)
// ═══════════════════════════════════════════════════════════════════

export const failExecution = internalMutation({
  args: { executionId: v.id("workflowExecutions"), error: v.string() },
  handler: (ctx, args) => executions.FailExecution(ctx, args),
});

export const getEnabledWorkflow = internalQuery({
  args: { workflowId: v.id("workflows") },
  handler: (ctx, args) => executions.GetEnabledWorkflow(ctx, args),
});
