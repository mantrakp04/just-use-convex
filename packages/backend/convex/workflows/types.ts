import { z } from "zod";
import type { Doc } from "../_generated/dataModel";
import type { MemberRole } from "../shared/auth";
import {
  workflowsZodSchema,
  workflowsWithSystemFields,
  triggerSchema,
  actionSchema,
  eventSchema,
  inputModalitySchema,
  isolationModeSchema,
} from "../tables/workflows";
import { sandboxesWithSystemFields } from "../tables/sandboxes";
import { workflowExecutionsWithSystemFields } from "../tables/workflowExecutions";
import { workflowStepsWithSystemFields } from "../tables/workflowSteps";
import { tableNames } from "../lib/schemaTables";
import { paginationOptsValidator } from "convex/server";
import { convexToZod } from "convex-helpers/server/zod4";

// Re-export for consumers
export { triggerSchema as TriggerSchema } from "../tables/workflows";

/** Inferred from actionSchema */
export type Action = z.infer<typeof actionSchema>;
/** Inferred from eventSchema */
export type EventType = z.infer<typeof eventSchema>;

const OPERATIONS = ["create", "update", "delete"] as const;
const OP_LABELS: Record<(typeof OPERATIONS)[number], string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
};

function humanizeTable(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Event options inferred from schema tables — for UI selectors */
export const ALL_EVENTS: { value: EventType; label: string }[] = tableNames.flatMap((table) =>
  OPERATIONS.map((op) => ({
    value: `on_${table}_${op}` as EventType,
    label: `${humanizeTable(table)} ${OP_LABELS[op]}`,
  }))
);
/** Inferred from triggerSchema discriminant */
export type TriggerType = z.infer<typeof triggerSchema>["type"];
/** Inferred from inputModalitySchema */
export type InputModality = z.infer<typeof inputModalitySchema>;

const zPaginationOpts = convexToZod(paginationOptsValidator);

export const Workflow = z.object(workflowsZodSchema);
export const WorkflowWithSystemFields = z.object(workflowsWithSystemFields);
export const WorkflowExecution = z.object(workflowExecutionsWithSystemFields);
export const WorkflowStep = z.object(workflowStepsWithSystemFields);

/** Workflow list item (doc + sandbox edge) */
export type WorkflowWithSandbox = z.infer<typeof WorkflowWithSystemFields> & {
  sandbox: Doc<"sandboxes"> | null;
};

/** Resolved member identity for workflow dispatch */
export type WorkflowMember = { role: MemberRole; userId: string };

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
    actions: z.array(actionSchema),
    model: z.string(),
    inputModalities: z.array(inputModalitySchema).default(["text"]),
    isolationMode: isolationModeSchema.default("isolated"),
    sandboxId: sandboxesWithSystemFields._id.optional(),
  }),
});

export const UpdateArgs = WorkflowWithSystemFields.pick({ _id: true }).extend({
  patch: z.object({
    name: z.string(),
    trigger: triggerSchema,
    instructions: z.string(),
    actions: z.array(actionSchema),
    model: z.string().optional(),
    inputModalities: z.array(inputModalitySchema),
    isolationMode: isolationModeSchema,
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
  action: actionSchema,
  outcome: z.enum(["success", "failure"]),
  error: z.string().optional(),
});

export const FinalizeWorkflowStepsArgs = z.object({
  executionId: WorkflowExecution.shape._id,
});
