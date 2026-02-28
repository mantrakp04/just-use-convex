import { createTool, createToolkit, type Toolkit } from "@voltagent/core";
import { z } from "zod";
import { cancelBackgroundTask, getBackgroundTask, listBackgroundTasks } from "./background-task-control";
import {
  DEFAULT_BACKGROUND_TASK_POLL_INTERVAL_MS,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  OUTPUT_CHARS_PER_TOKEN,
} from "./types";
import { normalizePositiveInt } from "../duration";
import type {
  BackgroundTaskStoreApi,
  BackgroundTaskToolkitConfig,
  TruncatedOutputStoreApi,
} from "./types";

const BACKGROUND_TASK_INSTRUCTIONS = `You have access to background task management tools for monitoring and controlling long-running operations.

## Background Tasks

When a tool is executed with \`background: true\`, it runs asynchronously and returns a task ID immediately. Use these tools to manage background tasks:

- **get_background_task**: Check status, get results, and optionally wait for completion
- **cancel_background_task**: Abort a running task
- **list_background_tasks**: See all tasks and their status

## Truncated Outputs

When a tool output exceeds the token limit, it is truncated and stored. The truncated result includes an \`outputId\`. Use:

- **read_output**: Read the full content by output ID, supports offset/limit for pagination

## Workflow

1. Start a tool in background: \`{ "background": true, ... }\`
2. Get the returned \`backgroundTaskId\`
3. Use \`get_background_task\` to poll progress or wait for completion
4. If a result is truncated, use \`read_output\` with the \`outputId\` to read the full content
5. Cancel if needed with \`cancel_background_task\`
`;

function createBackgroundTaskTools(
  store: BackgroundTaskStoreApi,
  config: BackgroundTaskToolkitConfig,
) {
  const getBackgroundTaskTool = createTool({
    name: "get_background_task",
    description: `Get the status and result of a background task.

Use this to check the progress of a task running in the background.
Returns the task status and result if completed.
Set waitForCompletion=true to wait until completion or timeout.`,
    parameters: z.object({
      taskId: z.string().describe("The background task ID"),
      waitForCompletion: z
        .boolean()
        .default(false)
        .describe("Wait for task completion before returning (default: false)"),
      timeoutMs: z
        .number()
        .positive()
        .default(config.defaultTimeoutMs)
        .describe(`Max wait time when waiting, in ms (default: ${config.defaultTimeoutMs})`),
    }),
    execute: async ({ taskId, waitForCompletion, timeoutMs }, opts) => {
      const abortSignal = opts?.toolContext?.abortSignal ?? opts?.abortController?.signal;

      return getBackgroundTask(
        store,
        { taskId, waitForCompletion, timeoutMs },
        {
          pollIntervalMs: config.pollIntervalMs,
          defaultTimeoutMs: config.defaultTimeoutMs,
          abortSignal,
        },
      );
    },
  });

  const cancelBackgroundTaskTool = createTool({
    name: "cancel_background_task",
    description: `Cancel a running background task.

Attempts to abort the task execution. Only works for tasks that are still running or pending.`,
    parameters: z.object({
      taskId: z.string().describe("The background task ID to cancel"),
    }),
    execute: async ({ taskId }) => cancelBackgroundTask(store, taskId),
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
    execute: async ({ status }) => listBackgroundTasks(store, status),
  });

  return [getBackgroundTaskTool, cancelBackgroundTaskTool, listBackgroundTasksTool];
}

function createReadOutputTool(store: TruncatedOutputStoreApi) {
  const defaultLimit = DEFAULT_MAX_OUTPUT_TOKENS * OUTPUT_CHARS_PER_TOKEN;

  return createTool({
    name: "read_output",
    description: `Read the full content of a truncated tool output.

When a tool result is truncated, it includes an outputId. Use this tool to read the full content.
Supports offset and limit for paginating large outputs.`,
    parameters: z.object({
      outputId: z.string().describe("The output ID from a truncated result (outputId field)"),
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
  config: Partial<BackgroundTaskToolkitConfig> = {},
): Toolkit {
  const toolkitConfig: BackgroundTaskToolkitConfig = {
    pollIntervalMs: normalizePositiveInt(config.pollIntervalMs, DEFAULT_BACKGROUND_TASK_POLL_INTERVAL_MS),
    defaultTimeoutMs: normalizePositiveInt(config.defaultTimeoutMs, DEFAULT_MAX_DURATION_MS),
  };

  return createToolkit({
    name: "background_tasks",
    description: "Tools for managing background task execution, monitoring progress, retrieving results, and reading truncated outputs",
    instructions: BACKGROUND_TASK_INSTRUCTIONS,
    tools: [
      ...createBackgroundTaskTools(backgroundStore, toolkitConfig),
      createReadOutputTool(outputStore),
    ],
  });
}

