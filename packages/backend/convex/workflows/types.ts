import { z } from "zod";
import type { Doc } from "../_generated/dataModel";
import {
  workflowsZodSchema,
  workflowsWithSystemFields,
  triggerSchema,
  allowedActionSchema,
  eventSchema,
  inputModalitySchema,
} from "../tables/workflows";
import { sandboxesWithSystemFields } from "../tables/sandboxes";
import { workflowExecutionsWithSystemFields } from "../tables/workflowExecutions";
import { workflowStepsWithSystemFields } from "../tables/workflowSteps";
import { paginationOptsValidator } from "convex/server";
import { convexToZod } from "convex-helpers/server/zod4";

/** Inferred from allowedActionSchema */
export type AllowedAction = z.infer<typeof allowedActionSchema>;
/** Inferred from eventSchema */
export type EventType = z.infer<typeof eventSchema>;
/** Inferred from triggerSchema discriminant */
export type TriggerType = z.infer<typeof triggerSchema>["type"];
/** Inferred from inputModalitySchema */
export type InputModality = z.infer<typeof inputModalitySchema>;

const zPaginationOpts = convexToZod(paginationOptsValidator);

export const Workflow = z.object(workflowsZodSchema);
export const WorkflowWithSystemFields = z.object(workflowsWithSystemFields);
export const WorkflowExecution = z.object(workflowExecutionsWithSystemFields);
export const WorkflowStep = z.object(workflowStepsWithSystemFields);

/** Workflow list item (doc + sandbox edge). Use instead of inferring from FunctionReturnType for correct enum array types. */
export type WorkflowWithSandbox = z.infer<typeof WorkflowWithSystemFields> & {
  sandbox: Doc<"sandboxes"> | null;
};

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
    trigger: triggerSchema,
    instructions: z.string(),
    allowedActions: z.array(allowedActionSchema),
    model: z.string(),
    inputModalities: z.array(inputModalitySchema).default(["text"]),
    sandboxId: sandboxesWithSystemFields._id.optional(),
  }),
});

export const UpdateArgs = WorkflowWithSystemFields.pick({ _id: true }).extend({
  patch: z.object({
    name: z.string(),
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

export const RetryExecutionArgs = z.object({
  executionId: WorkflowExecution.shape._id,
});

export const RecordWorkflowStepOutcomeArgs = z.object({
  executionId: WorkflowExecution.shape._id,
  action: allowedActionSchema,
  outcome: z.enum(["success", "failure"]),
  error: z.string().optional(),
});

export const FinalizeWorkflowStepsArgs = z.object({
  executionId: WorkflowExecution.shape._id,
});
