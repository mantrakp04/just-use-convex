import { createTool, createToolkit, type Toolkit } from "@voltagent/core";
import { z } from "zod";
import type { FunctionArgs } from "convex/server";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { ConvexAdapter } from "@just-use-convex/backend/convex/lib/convexAdapter";

type WorkflowUpdatePatch = FunctionArgs<typeof api.workflows.index.update>["patch"];

export async function createWorkflowToolkit(
  convexAdapter: ConvexAdapter,
): Promise<Toolkit> {
  const isExternal = convexAdapter.getTokenType() === "ext";

  const listWorkflows = async (paginationOpts: { cursor: string | null; numItems: number }) => {
    if (isExternal) {
      return convexAdapter.query(api.workflows.index.listExt, { paginationOpts });
    }
    return convexAdapter.query(api.workflows.index.list, { paginationOpts });
  };

  const getWorkflow = async (_id: Id<"workflows">) => {
    if (isExternal) {
      return convexAdapter.query(api.workflows.index.getExt, { _id });
    }
    return convexAdapter.query(api.workflows.index.get, { _id });
  };

  const listWorkflowRuns = async (
    workflowIdArg: Id<"workflows">,
    paginationOpts: { cursor: string | null; numItems: number },
  ) => {
    if (isExternal) {
      return convexAdapter.query(api.workflows.index.listExecutionsExt, {
        workflowId: workflowIdArg,
        paginationOpts,
      });
    }
    return convexAdapter.query(api.workflows.index.listExecutions, {
      workflowId: workflowIdArg,
      paginationOpts,
    });
  };

  const getRun = async (_id: Id<"workflowExecutions">) => {
    if (isExternal) {
      return convexAdapter.query(api.workflows.index.getExecutionExt, { _id });
    }
    return convexAdapter.query(api.workflows.index.getExecution, { _id });
  };

  const updateWorkflow = async (_id: Id<"workflows">, patch: WorkflowUpdatePatch) => {
    if (isExternal) {
      return convexAdapter.mutation(api.workflows.index.updateExt, { _id, patch });
    }
    return convexAdapter.mutation(api.workflows.index.update, { _id, patch });
  };

  const deleteWorkflow = async (_id: Id<"workflows">) => {
    if (isExternal) {
      return convexAdapter.mutation(api.workflows.index.deleteWorkflowExt, { _id });
    }
    return convexAdapter.mutation(api.workflows.index.deleteWorkflow, { _id });
  };

  const listTool = createTool({
    name: "workflow_list",
    description: "List workflows in minified form. Use this for quick discovery.",
    parameters: z.object({
      cursor: z.string().nullable().optional().describe("Pagination cursor from a previous workflow_list call."),
      numItems: z.number().int().min(1).max(50).optional().describe("Number of items to return (1-50). Default 10."),
    }),
    execute: async ({ cursor = null, numItems = 10 }) => {
      const page = await listWorkflows({ cursor, numItems });
      return {
        ...page,
        page: page.page.map(minifyWorkflow),
      };
    },
  });

  const getTool = createTool({
    name: "workflow_get",
    description: "Get a workflow by ID. Defaults to the currently executing workflow when omitted.",
    parameters: z.object({
      workflowId: z.string().optional().describe("Workflow ID. Omit to use the current workflow in this execution."),
    }),
    execute: async ({ workflowId: workflowIdArg }) => {
      const targetWorkflowId = workflowIdArg as Id<"workflows">;
      const workflow = await getWorkflow(targetWorkflowId);
      return {
        ...workflow,
        triggerParsed: tryParseJson(workflow.trigger),
      };
    },
  });

  const getRunsTool = createTool({
    name: "workflow_get_runs",
    description: "Get workflow execution runs. Supports pagination and optional output previews.",
    parameters: z.object({
      workflowId: z.string().optional().describe("Workflow ID. Omit to use the current workflow in this execution."),
      cursor: z.string().nullable().optional().describe("Pagination cursor from a previous workflow_get_runs call."),
      numItems: z.number().int().min(1).max(50).optional().describe("Number of runs to return (1-50). Default 10."),
      includeOutputPreview: z.boolean().optional().describe("Include a truncated output preview for each run. Default false."),
      outputPreviewChars: z.number().int().min(100).max(5000).optional().describe("Preview size when includeOutputPreview is true. Default 500."),
    }),
    execute: async ({
      workflowId: workflowIdArg,
      cursor = null,
      numItems = 10,
      includeOutputPreview = false,
      outputPreviewChars = 500,
    }) => {
      const targetWorkflowId = workflowIdArg as Id<"workflows">;
      const page = await listWorkflowRuns(targetWorkflowId, { cursor, numItems });
      return {
        ...page,
        page: page.page.map((run) => minifyRun(run, includeOutputPreview, outputPreviewChars)),
      };
    },
  });

  const getRunOutputPageTool = createTool({
    name: "workflow_get_run_output_page",
    description: "Paginate through workflow run output fields (agentOutput/toolCalls/error/triggerPayload).",
    parameters: z.object({
      executionId: z.string().describe("Workflow execution ID."),
      field: z
        .enum(["agentOutput", "toolCalls", "error", "triggerPayload"])
        .optional()
        .describe("Which output field to paginate. Default agentOutput."),
      cursor: z.number().int().min(0).optional().describe("Character offset cursor. Default 0."),
      pageSize: z.number().int().min(100).max(20000).optional().describe("Characters per page. Default 2000."),
    }),
    execute: async ({ executionId, field = "agentOutput", cursor = 0, pageSize = 2000 }) => {
      const run = await getRun(executionId as Id<"workflowExecutions">);
      const raw = run[field];
      const source = typeof raw === "string" ? raw : "";
      const slice = paginateText(source, cursor, pageSize);

      return {
        executionId: run._id,
        status: run.status,
        field,
        ...slice,
      };
    },
  });

  const updateTool = createTool({
    name: "workflow_update",
    description: "Update workflow fields by ID. Defaults to the currently executing workflow when omitted.",
    parameters: z.object({
      workflowId: z.string().optional().describe("Workflow ID. Omit to use the current workflow in this execution."),
      patch: z.custom<WorkflowUpdatePatch>().describe("Patch object for workflow updates."),
    }),
    execute: async ({ workflowId: workflowIdArg, patch }) => {
      const targetWorkflowId = workflowIdArg as Id<"workflows">;
      await updateWorkflow(targetWorkflowId, patch);
      const workflow = await getWorkflow(targetWorkflowId);
      return {
        ...workflow,
        triggerParsed: tryParseJson(workflow.trigger),
      };
    },
  });

  const deleteTool = createTool({
    name: "workflow_delete",
    description: "Delete a workflow by ID. Defaults to the currently executing workflow when omitted.",
    parameters: z.object({
      workflowId: z.string().optional().describe("Workflow ID. Omit to use the current workflow in this execution."),
    }),
    execute: async ({ workflowId: workflowIdArg }) => {
      const targetWorkflowId = workflowIdArg as Id<"workflows">;
      await deleteWorkflow(targetWorkflowId);
      return {
        deleted: true,
        workflowId: targetWorkflowId,
      };
    },
  });

  return createToolkit({
    name: "workflow",
    description: "Workflow management tools: list/get/getRuns/update/delete plus paginated run output access.",
    tools: [listTool, getTool, getRunsTool, getRunOutputPageTool, updateTool, deleteTool],
  });
}

function minifyWorkflow(workflow: {
  _id: string;
  name: string;
  enabled: boolean;
  triggerType: string;
  updatedAt: number;
  model?: string;
  sandboxId?: string;
  sandbox?: { _id: string; name?: string } | null;
}) {
  return {
    _id: workflow._id,
    name: workflow.name,
    enabled: workflow.enabled,
    triggerType: workflow.triggerType,
    updatedAt: workflow.updatedAt,
    model: workflow.model ?? null,
    sandboxId: workflow.sandboxId ?? null,
    sandbox: workflow.sandbox
      ? {
        _id: workflow.sandbox._id,
        name: workflow.sandbox.name ?? null,
      }
      : null,
  };
}

function minifyRun(
  run: {
    _id: string;
    workflowId: string;
    status: string;
    startedAt: number;
    completedAt?: number;
    agentOutput?: string;
    toolCalls?: string;
    error?: string;
  },
  includeOutputPreview: boolean,
  outputPreviewChars: number,
) {
  return {
    _id: run._id,
    workflowId: run.workflowId,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt ?? null,
    outputSize: {
      agentOutput: run.agentOutput?.length ?? 0,
      toolCalls: run.toolCalls?.length ?? 0,
      error: run.error?.length ?? 0,
    },
    outputPreview: includeOutputPreview
      ? {
        agentOutput: truncateText(run.agentOutput, outputPreviewChars),
        toolCalls: truncateText(run.toolCalls, outputPreviewChars),
        error: truncateText(run.error, outputPreviewChars),
      }
      : null,
  };
}

function truncateText(value: string | undefined, maxChars: number): string | null {
  if (!value) return null;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function paginateText(source: string, cursor: number, pageSize: number) {
  const safeCursor = Math.max(0, Math.min(cursor, source.length));
  const nextCursor = Math.min(safeCursor + pageSize, source.length);
  return {
    cursor: safeCursor,
    nextCursor: nextCursor >= source.length ? null : nextCursor,
    isDone: nextCursor >= source.length,
    totalChars: source.length,
    page: source.slice(safeCursor, nextCursor),
  };
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
