import { z } from "zod";
import { defineEntFromTable } from "convex-ents";
import { Table } from "convex-helpers/server";
import { convexToZodFields, zodToConvexFields } from "convex-helpers/server/zod4";
import { workflowExecutionsWithSystemFields } from "./workflowExecutions";
import { allowedActionSchema } from "./workflows";

export const workflowStepsZodSchema = {
  workflowExecutionId: workflowExecutionsWithSystemFields._id,
  action: allowedActionSchema,
  status: z.enum(["pending", "success", "failure"]),
  callCount: z.number(),
  successCount: z.number(),
  failureCount: z.number(),
  lastError: z.string().optional(),
  failureReason: z.enum(["tool_error", "not_called"]).optional(),
  firstCalledAt: z.number().optional(),
  lastCalledAt: z.number().optional(),
  updatedAt: z.number(),
};

export const workflowStepsFields = zodToConvexFields(workflowStepsZodSchema);

export const WorkflowSteps = Table("workflowSteps", workflowStepsFields);

export const systemFields = WorkflowSteps.systemFields;
export const zSystemFields = convexToZodFields(systemFields);

export const workflowStepsWithSystemFields = {
  ...workflowStepsZodSchema,
  ...zSystemFields,
};

const workflowStepsTable = WorkflowSteps.table
  .index("workflowExecutionId_action", ["workflowExecutionId", "action"])
  .index("workflowExecutionId_updatedAt", ["workflowExecutionId", "updatedAt"]);

export const workflowStepsEnt = defineEntFromTable(workflowStepsTable)
  .edge("workflowExecution", { to: "workflowExecutions", field: "workflowExecutionId" });
