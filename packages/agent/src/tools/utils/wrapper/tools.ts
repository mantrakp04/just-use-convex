import { createTool, createToolkit, type Toolkit } from "@voltagent/core";
import { z } from "zod";
import { TERMINAL_STATUSES } from "./types";
import type {
  BackgroundTask,
  BackgroundTaskStoreApi,
  ToolOrToolkit,
} from "./types";

const BACKGROUND_TASK_INSTRUCTIONS = `You have access to background task management tools for monitoring and controlling long-running operations.

## Background Tasks

When a tool is executed with \`background: true\`, it runs asynchronously and returns a task ID immediately. Use these tools to manage background tasks:

- **get_background_task_logs**: Check progress, view logs, get results, and optionally wait for completion
- **cancel_background_task**: Abort a running task
- **list_background_tasks**: See all tasks and their status

## Workflow

1. Start a tool in background: \`{ "background": true, ... }\`
2. Get the returned \`backgroundTaskId\`
3. Use \`get_background_task_logs\` to poll progress or wait for completion
4. Cancel if needed with \`cancel_background_task\`

Tasks persist in memory for the agent session. Use \`list_background_tasks\` to see all tasks.
`;

function createBackgroundTaskTools(store: BackgroundTaskStoreApi) {
  const buildTaskResult = (task: BackgroundTask) => ({
    taskId: task.id,
    status: task.status,
    ...(task.status === "completed" && { result: task.result }),
    ...(task.status === "failed" && { error: task.error }),
  });

  const getBackgroundTaskLogsTool = createTool({
    name: "get_background_task_logs",
    description: `Get logs from a background task.

Use this to check the progress and output of a task running in the background.
Returns the task status, logs, and pagination info.`,
    parameters: z.object({
      taskId: z.string().describe("The background task ID"),
      offset: z.number().default(0).describe("Log offset (default: 0)"),
      limit: z
        .number()
        .default(100)
        .describe("Max logs to return (default: 100)"),
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
    execute: async ({ taskId, offset, limit, waitForCompletion, pollIntervalMs, timeoutMs }, opts) => {
      const abortSignal =
        opts?.toolContext?.abortSignal ?? opts?.abortController?.signal;

      if (waitForCompletion) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
          if (abortSignal?.aborted) {
            return { taskId, status: "wait_aborted", message: "Wait was aborted" };
          }

          const task = store.get(taskId);
          if (!task) {
            return { error: `Task not found: ${taskId}` };
          }

          if (TERMINAL_STATUSES.includes(task.status)) {
            const { logs, total, hasMore } = store.getLogs(taskId, offset, limit);
            const minimalLogs = logs.map(({ type, message }) => ({ type, message }));
            return { ...buildTaskResult(task), logs: minimalLogs, total, hasMore };
          }

          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }

        return {
          taskId,
          status: "wait_timeout",
          message: `Task did not complete within ${timeoutMs}ms`,
        };
      }

      const task = store.get(taskId);
      if (!task) {
        return { error: `Task not found: ${taskId}` };
      }

      const { logs, total, hasMore } = store.getLogs(taskId, offset, limit);
      const minimalLogs = logs.map(({ type, message }) => ({ type, message }));
      return { ...buildTaskResult(task), logs: minimalLogs, total, hasMore };
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
      const { cancelled, previousStatus } = store.cancel(taskId);
      if (previousStatus === null) {
        return { error: `Task not found: ${taskId}` };
      }
      return { taskId, cancelled };
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

      return {
        tasks: tasks.map((task) => ({ id: task.id, status: task.status })),
      };
    },
  });

  return [
    getBackgroundTaskLogsTool,
    cancelBackgroundTaskTool,
    listBackgroundTasksTool,
  ];
}

export function createBackgroundTaskToolkit(store: BackgroundTaskStoreApi): Toolkit {
  return createToolkit({
    name: "background_tasks",
    description: "Tools for managing background task execution, monitoring progress, and retrieving results",
    instructions: BACKGROUND_TASK_INSTRUCTIONS,
    tools: createBackgroundTaskTools(store),
  });
}

export function withBackgroundTaskTools<T extends ToolOrToolkit>(
  tools: T[],
  store: BackgroundTaskStoreApi
): (T | Toolkit)[] {
  return [...tools, createBackgroundTaskToolkit(store)];
}
