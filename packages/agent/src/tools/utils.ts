import {
  createTool,
  createToolkit,
  type BaseTool,
  type Toolkit,
  type ToolExecuteOptions,
} from "@voltagent/core";
import { z, type ZodObject, type ZodRawShape } from "zod";

// ============================================================================
// Types
// ============================================================================

// --- Background Task Types ---

/** Status of a background task */
export type BackgroundTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

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

/** Options for runInBackground helper */
export type RunInBackgroundOptions = {
  toolName: string;
  toolArgs: Record<string, unknown>;
  executionPromise: Promise<unknown> | unknown;
  timeoutMs: number;
  /** If provided, task was converted from foreground (affects status) */
  initialLog?: string;
};

// --- Tool Configuration Types ---

/** Configuration for wrapped tool timeout and background behavior */
export type ToolCallConfig = {
  /** Default timeout in ms (default: 60000ms) */
  duration?: number;
  /** Allow agent to set custom timeout (default: false) */
  allowAgentSetDuration?: boolean;
  /** Max timeout agent can set in ms (default: 1800000ms = 30m) */
  maxAllowedAgentDuration?: number;
  /** Allow agent to run tool in background via background param (default: false) */
  allowBackground?: boolean;
};

/** Extended execute options passed to wrapped tool handlers */
export type WrappedExecuteOptions = ToolExecuteOptions & {
  timeout?: number;
  log?: (entry: { type: BackgroundTaskLogType; message: string }) => void;
};

/** Options for createWrappedTool */
export type WrappedToolOptions = Omit<
  Parameters<typeof createTool>[0],
  "execute" | "parameters"
> & {
  parameters: ZodObject<ZodRawShape>;
  toolCallConfig?: ToolCallConfig;
  execute?: (
    args: Record<string, unknown>,
    options?: WrappedExecuteOptions
  ) => unknown | Promise<unknown>;
};

// --- Utility Types ---

/** A tool or toolkit that can be passed to withBackgroundTaskTools */
export type ToolOrToolkit = BaseTool | Toolkit;


// ============================================================================
// BackgroundTaskStore
// ============================================================================

class BackgroundTaskStore {
  private tasks = new Map<string, BackgroundTask>();
  private idCounter = 0;

  generateId(): string {
    return `bg_${Date.now()}_${++this.idCounter}`;
  }

  create(toolName: string, args: Record<string, unknown>): BackgroundTask {
    const task: BackgroundTask = {
      id: this.generateId(),
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

export const backgroundTaskStore = new BackgroundTaskStore();

// ============================================================================
// Timeout Utility
// ============================================================================

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

// ============================================================================
// Background Task Runner
// ============================================================================

/**
 * Runs a promise as a background task, tracking its progress and result.
 * Returns immediately with task info.
 */
function runInBackground({
  toolName,
  toolArgs,
  executionPromise,
  timeoutMs,
  initialLog,
}: RunInBackgroundOptions): BackgroundTaskResult {
  const task = backgroundTaskStore.create(toolName, toolArgs);
  backgroundTaskStore.update(task.id, { status: "running" });

  if (initialLog) {
    backgroundTaskStore.addLog(task.id, { type: "info", message: initialLog });
  }

  // Fire-and-forget execution
  void (async () => {
    try {
      const result = await executeWithTimeout(
        () => executionPromise,
        timeoutMs,
        task.abortController?.signal
      );

      // Auto-capture stdout/stderr from result
      if (result && typeof result === "object" && result !== null) {
        if ("stdout" in result && typeof result.stdout === "string" && result.stdout) {
          backgroundTaskStore.addLog(task.id, { type: "stdout", message: result.stdout });
        }
        if ("stderr" in result && typeof result.stderr === "string" && result.stderr) {
          backgroundTaskStore.addLog(task.id, { type: "stderr", message: result.stderr });
        }
      }

      backgroundTaskStore.update(task.id, {
        status: "completed",
        completedAt: Date.now(),
        result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      backgroundTaskStore.addLog(task.id, { type: "error", message: errorMessage });
      backgroundTaskStore.update(task.id, {
        status: error instanceof Error && error.name === "AbortError" ? "cancelled" : "failed",
        completedAt: Date.now(),
        error: errorMessage,
      });
    }
  })();

  return {
    backgroundTaskId: task.id,
    status: initialLog ? "converted_to_background" : "started",
  };
}

// ============================================================================
// Shared Wrapped Execute Logic
// ============================================================================

const MAX_BACKGROUND_TIMEOUT = 30 * 60 * 1000; // 30 minutes

type ResolvedConfig = {
  duration: number;
  allowAgentSetDuration: boolean;
  allowBackground: boolean;
  maxAllowedAgentDuration: number;
};

function resolveConfig(config: ToolCallConfig): ResolvedConfig {
  const {
    duration = 60000,
    allowAgentSetDuration = false,
    allowBackground = false,
  } = config;
  const maxAllowedAgentDuration = config.maxAllowedAgentDuration
    ?? (allowAgentSetDuration ? duration : 1800000);
  return {
    duration,
    allowAgentSetDuration: allowAgentSetDuration || allowBackground,
    allowBackground,
    maxAllowedAgentDuration,
  };
}

function createWrappedExecute(
  toolName: string,
  originalExecute: (args: Record<string, unknown>, opts?: ToolExecuteOptions) => unknown | Promise<unknown>,
  config: ResolvedConfig
) {
  const { duration, allowAgentSetDuration, allowBackground, maxAllowedAgentDuration } = config;

  return async (
    args: Record<string, unknown>,
    opts?: ToolExecuteOptions
  ): Promise<unknown> => {
    const timeout = typeof args.timeout === "number" ? args.timeout : undefined;
    const background = typeof args.background === "boolean" ? args.background : undefined;
    const { timeout: _t, background: _b, ...toolArgs } = args;
    void _t;
    void _b;

    const effectiveTimeout =
      allowAgentSetDuration && timeout !== undefined
        ? Math.min(timeout, maxAllowedAgentDuration)
        : duration;

    if (allowBackground && background) {
      return runInBackground({
        toolName,
        toolArgs,
        executionPromise: originalExecute(toolArgs, opts),
        timeoutMs: effectiveTimeout,
      });
    }

    const executionPromise = originalExecute(toolArgs, opts);
    const abortSignal = opts?.toolContext?.abortSignal ?? opts?.abortController?.signal;

    try {
      return await executeWithTimeout(
        () => executionPromise,
        effectiveTimeout,
        abortSignal
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("timed out")) {
        return runInBackground({
          toolName,
          toolArgs,
          executionPromise,
          timeoutMs: MAX_BACKGROUND_TIMEOUT,
          initialLog: `Foreground execution timed out after ${effectiveTimeout}ms, converted to background task`,
        });
      }
      throw error;
    }
  };
}

// ============================================================================
// createWrappedTool
// ============================================================================

/**
 * Creates a tool with configurable timeout and background execution capabilities.
 *
 * @param options - Standard tool options plus toolCallConfig
 * @returns A Tool with augmented parameters based on config
 *
 * @example
 * ```ts
 * const myTool = createWrappedTool({
 *   name: "my_tool",
 *   description: "Does something",
 *   parameters: z.object({ input: z.string() }),
 *   toolCallConfig: {
 *     duration: 30000,
 *     allowAgentSetDuration: true,
 *     allowBackground: true,
 *   },
 *   execute: async ({ input }, options) => {
 *     // options.log?.({ type: 'info', message: 'Processing...' })
 *     return { result: input.toUpperCase() };
 *   },
 * });
 * ```
 */
export function createWrappedTool(options: WrappedToolOptions): BaseTool {
  const { name, description, toolCallConfig = {}, parameters, execute } = options;
  const config = resolveConfig(toolCallConfig);

  // Build augmented schema
  const augmentedShape: ZodRawShape = { ...parameters.shape };

  if (config.allowAgentSetDuration) {
    augmentedShape.timeout = z
      .number()
      .optional()
      .describe(
        `Optional timeout in milliseconds (max: ${config.maxAllowedAgentDuration}ms). Default: ${config.duration}ms`
      );
  }

  if (config.allowBackground) {
    augmentedShape.background = z
      .boolean()
      .optional()
      .describe(
        "Set to true to run this tool in the background. Returns immediately with a task ID."
      );
  }

  const augmentedParameters = z.object(augmentedShape);

  return createTool({
    name,
    description,
    parameters: augmentedParameters,
    execute: createWrappedExecute(name, execute ?? (() => undefined), config),
  });
}

// ============================================================================
// Background Task Management Tools
// ============================================================================

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
    const task = backgroundTaskStore.get(taskId);
    if (!task) {
      return { error: `Task not found: ${taskId}` };
    }
    const { logs } = backgroundTaskStore.getLogs(taskId, offset, limit);
    // Strip timestamps from logs for minimal context
    const minimalLogs = logs.map(({ type, message }) => ({ type, message }));
    return {
      taskId,
      status: task.status,
      logs: minimalLogs,
      ...(task.status === "completed" && { result: task.result }),
      ...(task.status === "failed" && { error: task.error }),
    };
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

      const task = backgroundTaskStore.get(taskId);
      if (!task) {
        return { error: `Task not found: ${taskId}` };
      }

      if (
        task.status === "completed" ||
        task.status === "failed" ||
        task.status === "cancelled"
      ) {
        return {
          taskId,
          status: task.status,
          ...(task.status === "completed" && { result: task.result }),
          ...(task.status === "failed" && { error: task.error }),
        };
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
    const { cancelled, previousStatus } = backgroundTaskStore.cancel(taskId);
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
    let tasks = backgroundTaskStore.getAll();

    if (status !== "all") {
      tasks = tasks.filter((t) => t.status === status);
    }

    return {
      tasks: tasks.map((t) => ({ id: t.id, status: t.status })),
    };
  },
});

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

/**
 * Background task management toolkit for monitoring and controlling long-running operations.
 */
export const backgroundTaskToolkit = createToolkit({
  name: "background_tasks",
  description: "Tools for managing background task execution, monitoring progress, and retrieving results",
  instructions: BACKGROUND_TASK_INSTRUCTIONS,
  tools: [
    getBackgroundTaskLogsTool,
    waitForBackgroundTaskTool,
    cancelBackgroundTaskTool,
    listBackgroundTasksTool,
  ],
});

/**
 * Adds the background task toolkit to a list of tools/toolkits.
 * Background task tools are always needed since any wrapped tool can convert to a
 * background task on timeout.
 *
 * @param tools - Array of tools and/or toolkits
 * @returns The tools array with backgroundTaskToolkit added
 *
 * @example
 * ```ts
 * const agent = new PlanAgent({
 *   tools: withBackgroundTaskTools([
 *     sandboxToolkit,
 *     webSearchTool,
 *   ]),
 * });
 * ```
 */
export function withBackgroundTaskTools<T extends ToolOrToolkit>(
  tools: T[]
): (T | Toolkit)[] {
  return [...tools, backgroundTaskToolkit];
}

/**
 * Patches an existing tool's execute function to add background task support.
 * Uses Object.defineProperty to modify the tool in-place.
 *
 * @param tool - The tool to patch
 * @param config - Optional configuration for timeout and background behavior
 *
 * @example
 * ```ts
 * const writeTodos = agent.getTools().find(t => t.name === "write_todos");
 * if (writeTodos) {
 *   patchToolWithBackgroundSupport(writeTodos, { duration: 30000 });
 * }
 * ```
 */
export function patchToolWithBackgroundSupport(
  tool: BaseTool,
  config: ToolCallConfig = {}
): void {
  const originalExecute = tool.execute;
  if (!originalExecute) return;

  Object.defineProperty(tool, "execute", {
    value: createWrappedExecute(tool.name, originalExecute, resolveConfig(config)),
    writable: true,
    configurable: true,
  });
}
