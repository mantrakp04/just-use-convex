import {
  createTool,
  createToolkit,
  type BaseTool,
  type Toolkit,
} from "@voltagent/core";
import { z } from "zod";

/** Status of a background task */
export type BackgroundTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export const TERMINAL_STATUSES: readonly BackgroundTaskStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

/** Type of log entry in a background task */
export type BackgroundTaskLogType = "stdout" | "stderr" | "info" | "error";

/** A single log entry from a background task */
export type BackgroundTaskLog = {
  timestamp: number;
  type: BackgroundTaskLogType;
  message: string;
};

/** Internal representation of a background task */
export type BackgroundTask = {
  id: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  status: BackgroundTaskStatus;
  startedAt: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
  logs: BackgroundTaskLog[];
  abortController?: AbortController;
};

/** Result returned when a task is started or converted to background */
export type BackgroundTaskResult = {
  backgroundTaskId: string;
  status: "started" | "converted_to_background";
};

type ExecutionFactory = (abortSignal?: AbortSignal) => Promise<unknown> | unknown;

/** Options for runInBackground helper */
export type RunInBackgroundOptions = {
  store: BackgroundTaskStore;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  executionFactory: ExecutionFactory;
  timeoutMs: number;
  /** If provided, task was converted from foreground (affects status) */
  initialLog?: string;
};

/** A tool or toolkit that can be passed to withBackgroundTaskTools */
export type ToolOrToolkit = BaseTool | Toolkit;

export class BackgroundTaskStore {
  private tasks = new Map<string, BackgroundTask>();
  private idCounter = 0;

  generateId(): string {
    return `bg_${Date.now()}_${++this.idCounter}`;
  }

  create(toolName: string, args: Record<string, unknown>, toolCallId: string): BackgroundTask {
    const task: BackgroundTask = {
      id: this.generateId(),
      toolCallId,
      toolName,
      args,
      status: "pending",
      startedAt: Date.now(),
      logs: [],
      abortController: new AbortController(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  get(id: string): BackgroundTask | undefined {
    return this.tasks.get(id);
  }

  getAll(): BackgroundTask[] {
    return Array.from(this.tasks.values());
  }

  update(id: string, updates: Partial<BackgroundTask>): void {
    const task = this.tasks.get(id);
    if (task) {
      Object.assign(task, updates);
    }
  }

  addLog(id: string, log: Omit<BackgroundTaskLog, "timestamp">): void {
    const task = this.tasks.get(id);
    if (task) {
      task.logs.push({ ...log, timestamp: Date.now() });
    }
  }

  getLogs(
    id: string,
    offset = 0,
    limit = 100
  ): { logs: BackgroundTaskLog[]; total: number; hasMore: boolean } {
    const task = this.tasks.get(id);
    if (!task) {
      return { logs: [], total: 0, hasMore: false };
    }
    const total = task.logs.length;
    const logs = task.logs.slice(offset, offset + limit);
    return { logs, total, hasMore: offset + limit < total };
  }

  cancel(id: string): { cancelled: boolean; previousStatus: BackgroundTaskStatus | null } {
    const task = this.tasks.get(id);
    if (!task) {
      return { cancelled: false, previousStatus: null };
    }

    const previousStatus = task.status;
    if (task.status === "running" || task.status === "pending") {
      task.abortController?.abort();
      task.status = "cancelled";
      task.completedAt = Date.now();
      return { cancelled: true, previousStatus };
    }

    return { cancelled: false, previousStatus };
  }

  cleanup(maxAgeMs = 3600000): void {
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (task.completedAt && now - task.completedAt > maxAgeMs) {
        this.tasks.delete(id);
      }
    }
  }
}

async function executeWithTimeout<R>(
  fn: () => R | Promise<R> | undefined,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<R | undefined> {
  if (abortSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  return new Promise<R | undefined>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      abortSignal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      if (!settled) {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      }
    };

    abortSignal?.addEventListener("abort", onAbort);

    timeoutId = setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    Promise.resolve(fn())
      .then((result) => {
        if (!settled) {
          cleanup();
          resolve(result);
        }
      })
      .catch((error) => {
        if (!settled) {
          cleanup();
          reject(error);
        }
      });
  });
}

/**
 * Runs a promise as a background task, tracking its progress and result.
 * Returns immediately with task info.
 */
export function runInBackground({
  store,
  toolName,
  toolArgs,
  executionFactory,
  timeoutMs,
  initialLog,
  toolCallId,
}: RunInBackgroundOptions): BackgroundTaskResult {
  const task = store.create(toolName, toolArgs, toolCallId);
  store.update(task.id, { status: "running" });

  if (initialLog) {
    store.addLog(task.id, { type: "info", message: initialLog });
  }

  void (async () => {
    const finalizeTask = (updates: Partial<BackgroundTask>) => {
      store.update(task.id, {
        ...updates,
        completedAt: Date.now(),
      });
    };

    try {
      const executionPromise = executionFactory(task.abortController?.signal);
      const result = await executeWithTimeout(
        () => executionPromise,
        timeoutMs,
        task.abortController?.signal
      );

      if (result && typeof result === "object" && result !== null) {
        if ("stdout" in result && typeof result.stdout === "string" && result.stdout) {
          store.addLog(task.id, { type: "stdout", message: result.stdout });
        }
        if ("stderr" in result && typeof result.stderr === "string" && result.stderr) {
          store.addLog(task.id, { type: "stderr", message: result.stderr });
        }
      }

      finalizeTask({ status: "completed", result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      store.addLog(task.id, { type: "error", message: errorMessage });
      finalizeTask({
        status: error instanceof Error && error.name === "AbortError" ? "cancelled" : "failed",
        error: errorMessage,
      });
    }
  })();

  return {
    backgroundTaskId: task.id,
    status: initialLog ? "converted_to_background" : "started",
  };
}

const BACKGROUND_TASK_INSTRUCTIONS = `You have access to background task management tools for monitoring and controlling long-running operations.

## Background Tasks

When a tool is executed with \`background: true\`, it runs asynchronously and returns a task ID immediately. Use these tools to manage background tasks:

- **get_background_task_logs**: Check progress, view logs, and get results
- **wait_for_background_task**: Block until a task completes (with timeout)
- **cancel_background_task**: Abort a running task
- **list_background_tasks**: See all tasks and their status

## Workflow

1. Start a tool in background: \`{ "background": true, ... }\`
2. Get the returned \`backgroundTaskId\`
3. Either poll with \`get_background_task_logs\` or block with \`wait_for_background_task\`
4. Cancel if needed with \`cancel_background_task\`

Tasks persist in memory for the agent session. Use \`list_background_tasks\` to see all tasks.
`;

function createBackgroundTaskTools(store: BackgroundTaskStore) {
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
    }),
    execute: async ({ taskId, offset, limit }) => {
      const task = store.get(taskId);
      if (!task) {
        return { error: `Task not found: ${taskId}` };
      }

      const { logs } = store.getLogs(taskId, offset, limit);
      const minimalLogs = logs.map(({ type, message }) => ({ type, message }));
      return { ...buildTaskResult(task), logs: minimalLogs };
    },
  });

  const waitForBackgroundTaskTool = createTool({
    name: "wait_for_background_task",
    description: `Wait for a background task to complete.

Polls the task status until it completes, fails, or times out.
Returns the final status and result.`,
    parameters: z.object({
      taskId: z.string().describe("The background task ID"),
      pollIntervalMs: z
        .number()
        .default(1000)
        .describe("Poll interval in ms (default: 1000)"),
      timeoutMs: z
        .number()
        .default(300000)
        .describe("Max wait time in ms (default: 300000 = 5 min)"),
    }),
    execute: async ({ taskId, pollIntervalMs, timeoutMs }, opts) => {
      const startTime = Date.now();
      const abortSignal =
        opts?.toolContext?.abortSignal ?? opts?.abortController?.signal;

      while (Date.now() - startTime < timeoutMs) {
        if (abortSignal?.aborted) {
          return { taskId, status: "wait_aborted", message: "Wait was aborted" };
        }

        const task = store.get(taskId);
        if (!task) {
          return { error: `Task not found: ${taskId}` };
        }

        if (TERMINAL_STATUSES.includes(task.status)) {
          return buildTaskResult(task);
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }

      return {
        taskId,
        status: "wait_timeout",
        message: `Task did not complete within ${timeoutMs}ms`,
      };
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
    waitForBackgroundTaskTool,
    cancelBackgroundTaskTool,
    listBackgroundTasksTool,
  ];
}

export function createBackgroundTaskToolkit(store: BackgroundTaskStore): Toolkit {
  return createToolkit({
    name: "background_tasks",
    description: "Tools for managing background task execution, monitoring progress, and retrieving results",
    instructions: BACKGROUND_TASK_INSTRUCTIONS,
    tools: createBackgroundTaskTools(store),
  });
}

export function withBackgroundTaskTools<T extends ToolOrToolkit>(
  tools: T[],
  store: BackgroundTaskStore
): (T | Toolkit)[] {
  return [...tools, createBackgroundTaskToolkit(store)];
}
