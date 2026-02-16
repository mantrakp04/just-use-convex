import { z } from "zod";
import {
  workflowsZodSchema,
  workflowsWithSystemFields,
  triggerSchema,
  allowedActionSchema,
  eventSchema,
  executionModeSchema,
  inputModalitySchema,
} from "../tables/workflows";
import { sandboxesWithSystemFields } from "../tables/sandboxes";

/** Inferred from allowedActionSchema */
export type AllowedAction = z.infer<typeof allowedActionSchema>;
/** Inferred from eventSchema */
export type EventType = z.infer<typeof eventSchema>;
/** Inferred from triggerSchema discriminant */
export type TriggerType = z.infer<typeof triggerSchema>["type"];
/** Inferred from executionModeSchema */
export type ExecutionMode = z.infer<typeof executionModeSchema>;
/** Inferred from inputModalitySchema */
export type InputModality = z.infer<typeof inputModalitySchema>;
import { workflowExecutionsWithSystemFields } from "../tables/workflowExecutions";
import { paginationOptsValidator } from "convex/server";
import { convexToZod } from "convex-helpers/server/zod4";

const zPaginationOpts = convexToZod(paginationOptsValidator);

export const Workflow = z.object(workflowsZodSchema);
export const WorkflowWithSystemFields = z.object(workflowsWithSystemFields);
export const WorkflowExecution = z.object(workflowExecutionsWithSystemFields);

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW ARGS
// ═══════════════════════════════════════════════════════════════════

export const ListArgs = z.object({
  paginationOpts: zPaginationOpts,
});

export const GetArgs = WorkflowWithSystemFields.pick({ _id: true });

export const CreateArgs = z.object({
  data: z.object({
    name: z.string(),
    executionMode: executionModeSchema.default("isolated"),
    trigger: triggerSchema,
    instructions: z.string(),
    allowedActions: z.array(allowedActionSchema),
    model: z.string().optional(),
    inputModalities: z.array(inputModalitySchema).default(["text"]),
    sandboxId: sandboxesWithSystemFields._id.optional(),
  }),
});

export const UpdateArgs = WorkflowWithSystemFields.pick({ _id: true }).extend({
  patch: z.object({
    name: z.string(),
    executionMode: executionModeSchema,
    trigger: triggerSchema,
    instructions: z.string(),
    allowedActions: z.array(allowedActionSchema),
    model: z.string().optional(),
    inputModalities: z.array(inputModalitySchema),
    sandboxId: sandboxesWithSystemFields._id.nullable().optional(),
    enabled: z.boolean(),
  }).partial(),
});

export const DeleteArgs = WorkflowWithSystemFields.pick({ _id: true });

export const ToggleArgs = WorkflowWithSystemFields.pick({ _id: true }).extend({
  enabled: z.boolean(),
});

// ═══════════════════════════════════════════════════════════════════
// EXECUTION ARGS
// ═══════════════════════════════════════════════════════════════════

export const ListExecutionsArgs = z.object({
  workflowId: WorkflowWithSystemFields.shape._id,
  paginationOpts: zPaginationOpts,
});

export const GetExecutionArgs = WorkflowExecution.pick({ _id: true });

// Used by agent (external)
export const GetForExecutionArgs = WorkflowWithSystemFields.pick({ _id: true });

export const UpdateExecutionStatusArgs = z.object({
  executionId: WorkflowExecution.shape._id,
  status: z.enum(["running", "completed", "failed", "cancelled"]),
  agentOutput: z.string().optional(),
  toolCalls: z.string().optional(),
  error: z.string().optional(),
  completedAt: z.number().optional(),
});

export const CreateExecutionArgs = z.object({
  workflowId: WorkflowWithSystemFields.shape._id,
  triggerPayload: z.string().optional(),
});
