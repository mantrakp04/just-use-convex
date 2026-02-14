import { createTool, createToolkit, type Toolkit } from "@voltagent/core";
import { z } from "zod";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  OUTPUT_CHARS_PER_TOKEN,
  TERMINAL_STATUSES,
} from "./types";
import type {
  BackgroundTask,
  BackgroundTaskStoreApi,
  TruncatedOutputStoreApi,
  ToolOrToolkit,
} from "./types";

const BACKGROUND_TASK_INSTRUCTIONS = `You have access to background task management tools for monitoring and controlling long-running operations.

## Background Tasks

When a tool is executed with \`background: true\`, it runs asynchronously and returns a task ID immediately. Use these tools to manage background tasks:

- **get_background_task**: Check status, get results, and optionally wait for completion
- **cancel_background_task**: Abort a running task
- **list_background_tasks**: See all tasks and their status

## Truncated Outputs

When a tool output exceeds the token limit, it is truncated and stored. The truncated result includes an \`_outputId\`. Use:

- **read_output**: Read the full content by output ID, supports offset/limit for pagination

## Workflow

1. Start a tool in background: \`{ "background": true, ... }\`
2. Get the returned \`backgroundTaskId\`
3. Use \`get_background_task\` to poll progress or wait for completion
4. If a result is truncated, use \`read_output\` with the \`_outputId\` to read the full content
5. Cancel if needed with \`cancel_background_task\`
`;

function createBackgroundTaskTools(store: BackgroundTaskStoreApi) {
  const buildTaskResult = (task: BackgroundTask) => ({
    taskId: task.id,
    status: task.status,
    ...(task.status === "completed" && { result: task.result }),
    ...(task.status === "failed" && { error: task.error }),
  });

  const getBackgroundTaskTool = createTool({
    name: "get_background_task",
    description: `Get the status and result of a background task.

Use this to check the progress of a task running in the background.
Returns the task status and result if completed.`,
    parameters: z.object({
      taskId: z.string().describe("The background task ID"),
      waitForCompletion: z
        .boolean()
        .default(false)
        .describe("Wait for task completion before returning (default: false)"),
      pollIntervalMs: z
        .number()
        .default(1000)
        .describe("Poll interval when waiting, in ms (default: 1000)"),
      timeoutMs: z
        .number()
        .default(300000)
        .describe("Max wait time when waiting, in ms (default: 300000 = 5 min)"),
    }),
    execute: async ({ taskId, waitForCompletion, pollIntervalMs, timeoutMs }, opts) => {
      const abortSignal = opts?.toolContext?.abortSignal ?? opts?.abortController?.signal;

      if (waitForCompletion) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
          if (abortSignal?.aborted) {
            return { taskId, status: "wait_aborted", message: "Wait was aborted" };
          }

          const task = store.get(taskId);
          if (!task) return { error: `Task not found: ${taskId}` };
          if (TERMINAL_STATUSES.includes(task.status)) return buildTaskResult(task);

          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        const latestTask = store.get(taskId);
        if (!latestTask) return { error: `Task not found: ${taskId}` };
        if (TERMINAL_STATUSES.includes(latestTask.status)) return buildTaskResult(latestTask);

        return {
          taskId,
          status: "wait_timeout",
          taskStatus: latestTask.status,
          message: `Task did not complete within ${timeoutMs}ms`,
        };
      }

      const task = store.get(taskId);
      if (!task) return { error: `Task not found: ${taskId}` };
      return buildTaskResult(task);
    },
  });

  const cancelBackgroundTaskTool = createTool({
    name: "cancel_background_task",
    description: `Cancel a running background task.

Attempts to abort the task execution. Only works for tasks that are still running or pending.`,
    parameters: z.object({
      taskId: z.string().describe("The background task ID to cancel"),
    }),
    execute: async ({ taskId }) => {
      const { cancelled, previousStatus, reason } = store.cancel(taskId);
      if (previousStatus === null) return { error: `Task not found: ${taskId}` };
      return { taskId, cancelled, ...(reason ? { reason } : {}) };
    },
  });

  const listBackgroundTasksTool = createTool({
    name: "list_background_tasks",
    description: `List all background tasks.

Returns a summary of all tasks with their status.
Useful for checking what tasks are running or have completed.`,
    parameters: z.object({
      status: z
        .enum(["all", "pending", "running", "completed", "failed", "cancelled"])
        .default("all")
        .describe("Filter by status (default: all)"),
    }),
    execute: async ({ status }) => {
      let tasks = store.getAll();
      if (status !== "all") {
        tasks = tasks.filter((task) => task.status === status);
      }
      return { tasks: tasks.map((task) => ({ id: task.id, status: task.status })) };
    },
  });

  return [getBackgroundTaskTool, cancelBackgroundTaskTool, listBackgroundTasksTool];
}

function createReadOutputTool(store: TruncatedOutputStoreApi) {
  const defaultLimit = DEFAULT_MAX_OUTPUT_TOKENS * OUTPUT_CHARS_PER_TOKEN;

  return createTool({
    name: "read_output",
    description: `Read the full content of a truncated tool output.

When a tool result is truncated, it includes an _outputId. Use this tool to read the full content.
Supports offset and limit for paginating large outputs.`,
    parameters: z.object({
      outputId: z.string().describe("The output ID from a truncated result (_outputId field)"),
      offset: z
        .number()
        .nonnegative()
        .default(0)
        .describe("Character offset to start reading from (default: 0)"),
      limit: z
        .number()
        .positive()
        .default(defaultLimit)
        .describe(`Max characters to return (default: ${defaultLimit})`),
    }),
    execute: async ({ outputId, offset, limit }) => {
      const output = store.get(outputId);
      if (!output) return { error: `Output not found: ${outputId}` };

      const content = output.content.slice(offset, offset + limit);
      return {
        outputId,
        content,
        totalLength: output.content.length,
        offset,
        hasMore: offset + limit < output.content.length,
      };
    },
  });
}

export function createBackgroundTaskToolkit(
  backgroundStore: BackgroundTaskStoreApi,
  outputStore: TruncatedOutputStoreApi,
): Toolkit {
  return createToolkit({
    name: "background_tasks",
    description: "Tools for managing background task execution, monitoring progress, retrieving results, and reading truncated outputs",
    instructions: BACKGROUND_TASK_INSTRUCTIONS,
    tools: [...createBackgroundTaskTools(backgroundStore), createReadOutputTool(outputStore)],
  });
}

export function withBackgroundTaskTools<T extends ToolOrToolkit>(
  tools: T[],
  backgroundStore: BackgroundTaskStoreApi,
  outputStore: TruncatedOutputStoreApi,
): (T | Toolkit)[] {
  return [...tools, createBackgroundTaskToolkit(backgroundStore, outputStore)];
}
