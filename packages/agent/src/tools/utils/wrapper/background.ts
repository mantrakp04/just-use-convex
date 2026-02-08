import { executeWithTimeout, isAbortError } from "./timeout";
import type {
  BackgroundTask,
  BackgroundTaskLog,
  BackgroundTaskResult,
  BackgroundTaskStatus,
  BackgroundTaskStoreApi,
  RunInBackgroundOptions,
  ToolOutputLog,
  ToolOutputLogCreateInput,
  ToolOutputLogCreateResult,
  ToolOutputLogReadResult,
} from "./types";

const DEFAULT_TASK_RETENTION_MS = 60 * 60 * 1000;

export class BackgroundTaskStore implements BackgroundTaskStoreApi {
  private tasks = new Map<string, BackgroundTask>();
  private outputLogs = new Map<string, ToolOutputLog>();
  private idCounter = 0;
  private outputLogCounter = 0;

  constructor(readonly waitUntil: (promise: Promise<unknown>) => void) {}

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
    if (!task) {
      return;
    }

    Object.assign(task, updates);
  }

  addLog(id: string, log: Omit<BackgroundTaskLog, "timestamp">): void {
    const task = this.tasks.get(id);
    if (!task) {
      return;
    }

    task.logs.push({
      timestamp: Date.now(),
      ...log,
    });
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
    const safeOffset = Math.max(0, Math.floor(offset));
    const safeLimit = Math.max(1, Math.floor(limit));
    const logs = task.logs.slice(safeOffset, safeOffset + safeLimit);

    return {
      logs,
      total,
      hasMore: safeOffset + safeLimit < total,
    };
  }

  cancel(id: string): { cancelled: boolean; previousStatus: BackgroundTaskStatus | null } {
    const task = this.tasks.get(id);
    if (!task) {
      return { cancelled: false, previousStatus: null };
    }

    const previousStatus = task.status;
    if (previousStatus === "pending" || previousStatus === "running") {
      task.abortController?.abort();
      task.status = "cancelled";
      task.completedAt = Date.now();
      this.addLog(id, { type: "info", message: "Task cancelled by user" });
      return { cancelled: true, previousStatus };
    }

    return { cancelled: false, previousStatus };
  }

  createOutputLog(input: ToolOutputLogCreateInput): ToolOutputLogCreateResult {
    const logId = this.generateOutputLogId();
    const content = input.content;
    const log: ToolOutputLog = {
      id: logId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      content,
      createdAt: Date.now(),
    };
    this.outputLogs.set(logId, log);

    return {
      logId,
      size: content.length,
      totalLines: countLines(content),
    };
  }

  readOutputLog(
    id: string,
    offset = 0,
    lines = 200
  ): ToolOutputLogReadResult | undefined {
    const log = this.outputLogs.get(id);
    if (!log) {
      return undefined;
    }

    const allLines = log.content.split(/\r?\n/);
    const totalLines = allLines.length;
    const safeOffset = Math.max(0, Math.floor(offset));
    const safeLines = Math.max(1, Math.floor(lines));
    const sliced = allLines.slice(safeOffset, safeOffset + safeLines);
    const nextOffset = safeOffset + sliced.length;

    return {
      logId: log.id,
      content: sliced.join("\n"),
      size: log.content.length,
      totalLines,
      offset: safeOffset,
      lines: safeLines,
      hasMore: nextOffset < totalLines,
      nextOffset,
    };
  }

  cleanup(maxAgeMs = DEFAULT_TASK_RETENTION_MS): void {
    const now = Date.now();

    for (const [id, task] of this.tasks) {
      if (!task.completedAt) {
        continue;
      }
      if (now - task.completedAt > maxAgeMs) {
        this.tasks.delete(id);
      }
    }

    for (const [id, log] of this.outputLogs) {
      if (now - log.createdAt > maxAgeMs) {
        this.outputLogs.delete(id);
      }
    }
  }

  private generateId(): string {
    this.idCounter += 1;
    return `bg_${Date.now()}_${this.idCounter}`;
  }

  private generateOutputLogId(): string {
    this.outputLogCounter += 1;
    return `log_${Date.now()}_${this.outputLogCounter}`;
  }
}

export function runInBackground({
  store,
  toolCallId,
  toolName,
  toolArgs,
  executionFactory,
  timeoutMs,
}: RunInBackgroundOptions): BackgroundTaskResult {
  const task = store.create(toolName, toolArgs, toolCallId);
  store.update(task.id, { status: "running" });

  const backgroundExecution = (async () => {
    try {
      const result = await executeWithTimeout(
        () =>
          executionFactory(task.abortController?.signal, (entry) => {
            store.addLog(task.id, entry);
          }),
        timeoutMs,
        task.abortController?.signal
      );

      writeStdIoLogs(store, task.id, result);
      const failure = extractFailureMessage(result);

      if (failure) {
        store.addLog(task.id, { type: "error", message: failure });
        store.update(task.id, {
          status: "failed",
          result,
          error: failure,
          completedAt: Date.now(),
        });
        return;
      }

      store.update(task.id, {
        status: "completed",
        result,
        completedAt: Date.now(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const cancelled = task.abortController?.signal.aborted || isAbortError(error);
      const status: BackgroundTaskStatus = cancelled ? "cancelled" : "failed";

      if (!cancelled) {
        store.addLog(task.id, { type: "error", message: errorMessage });
      }

      store.update(task.id, {
        status,
        ...(cancelled ? {} : { error: errorMessage }),
        completedAt: Date.now(),
      });
    }
  })();

  store.waitUntil(backgroundExecution);

  return { backgroundTaskId: task.id };
}

function extractFailureMessage(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const output = result as Record<string, unknown>;

  if (typeof output.error === "string" && output.error.trim().length > 0) {
    return output.error.trim();
  }

  if (output.success === false) {
    if (typeof output.stderr === "string" && output.stderr.trim().length > 0) {
      return output.stderr.trim();
    }
    if (typeof output.exitCode === "number") {
      return `Tool execution failed with exit code ${output.exitCode}`;
    }
    return "Tool execution reported success: false";
  }

  return null;
}

function writeStdIoLogs(
  store: BackgroundTaskStoreApi,
  taskId: string,
  result: unknown
): void {
  if (!result || typeof result !== "object") {
    return;
  }

  const output = result as Record<string, unknown>;
  const existingLogs = store.get(taskId)?.logs ?? [];
  const hasStdout = existingLogs.some((entry) => entry.type === "stdout");
  const hasStderr = existingLogs.some((entry) => entry.type === "stderr");

  if (!hasStdout && typeof output.stdout === "string" && output.stdout.length > 0) {
    store.addLog(taskId, { type: "stdout", message: output.stdout });
  }

  if (!hasStderr && typeof output.stderr === "string" && output.stderr.length > 0) {
    store.addLog(taskId, { type: "stderr", message: output.stderr });
  }
}

function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  return content.split(/\r?\n/).length;
}
