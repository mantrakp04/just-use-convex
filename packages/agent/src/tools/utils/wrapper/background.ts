import { executeWithTimeout } from "./timeout";
import type {
  BackgroundTask,
  BackgroundTaskResult,
  BackgroundTaskStatus,
  BackgroundTaskStoreApi,
  BackgroundTaskWaitUntilResult,
  RunInBackgroundOptions,
} from "./types";

function extractFailureFromResult(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const value = result as Record<string, unknown>;
  const errorMessage = typeof value.error === "string" ? value.error.trim() : "";
  if (errorMessage) {
    return errorMessage;
  }

  if (value.success === false) {
    const stderr = typeof value.stderr === "string" ? value.stderr.trim() : "";
    if (stderr) {
      return stderr;
    }
    if (typeof value.exitCode === "number") {
      return `Tool execution failed with exit code ${value.exitCode}`;
    }
    return "Tool execution reported success: false";
  }

  return null;
}

export class BackgroundTaskStore implements BackgroundTaskStoreApi {
  private tasks = new Map<string, BackgroundTask>();
  private idCounter = 0;
  private _waitUntil?: (promise: Promise<unknown>) => void;

  setWaitUntil(waitUntil: (promise: Promise<unknown>) => void): void {
    this._waitUntil = waitUntil;
  }

  get waitUntil(): ((promise: Promise<unknown>) => void) | undefined {
    return this._waitUntil;
  }

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

  addLog(id: string, log: Omit<BackgroundTask["logs"][number], "timestamp">): void {
    const task = this.tasks.get(id);
    if (task) {
      task.logs.push({ ...log, timestamp: Date.now() });
    }
  }

  getLogs(
    id: string,
    offset = 0,
    limit = 100
  ): { logs: BackgroundTask["logs"]; total: number; hasMore: boolean } {
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

  const bgPromise = (async (): Promise<BackgroundTaskWaitUntilResult> => {
    try {
      const executionPromise = executionFactory(
        task.abortController?.signal,
        (entry) => {
          store.addLog(task.id, entry);
        }
      );
      const result = await executeWithTimeout(
        () => executionPromise,
        timeoutMs,
        task.abortController?.signal
      );

      if (
        result &&
        typeof result === "object" &&
        result !== null
      ) {
        const existingLogs = store.get(task.id)?.logs ?? [];
        const hasStdoutLog = existingLogs.some((entry) => entry.type === "stdout");
        const hasStderrLog = existingLogs.some((entry) => entry.type === "stderr");
        if ("stdout" in result && typeof result.stdout === "string" && result.stdout && !hasStdoutLog) {
          store.addLog(task.id, { type: "stdout", message: result.stdout });
        }
        if ("stderr" in result && typeof result.stderr === "string" && result.stderr && !hasStderrLog) {
          store.addLog(task.id, { type: "stderr", message: result.stderr });
        }
      }

      const failureMessage = extractFailureFromResult(result);
      if (failureMessage) {
        store.addLog(task.id, { type: "error", message: failureMessage });
        store.update(task.id, {
          status: "failed",
          result,
          error: failureMessage,
          completedAt: Date.now(),
        });

        return {
          taskId: task.id,
          status: "failed",
          logs: store.get(task.id)?.logs ?? [],
          result,
          error: failureMessage,
        };
      }

      store.update(task.id, { status: "completed", result, completedAt: Date.now() });

      return {
        taskId: task.id,
        status: "completed",
        logs: store.get(task.id)?.logs ?? [],
        result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      store.addLog(task.id, { type: "error", message: errorMessage });
      const wasCancelled = task.abortController?.signal.aborted
        || (error instanceof Error && error.name === "AbortError");
      const status: BackgroundTaskStatus = wasCancelled ? "cancelled" : "failed";
      store.update(task.id, { status, error: errorMessage, completedAt: Date.now() });

      return {
        taskId: task.id,
        status,
        logs: store.get(task.id)?.logs ?? [],
        error: errorMessage,
      };
    }
  })();

  if (store.waitUntil) {
    store.waitUntil(bgPromise);
  }

  return {
    backgroundTaskId: task.id,
    status: initialLog ? "converted_to_background" : "started",
  };
}
