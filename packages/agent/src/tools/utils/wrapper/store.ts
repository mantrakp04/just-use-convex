import { executeWithTimeout, isAbortError } from "./timeout";
import type {
  BackgroundTask,
  BackgroundTaskResult,
  BackgroundTaskStatus,
  BackgroundTaskStoreApi,
  RunInBackgroundOptions,
} from "./types";
import { DEFAULT_TASK_RETENTION_MS } from "./types";

export class BackgroundTaskStore implements BackgroundTaskStoreApi {
  private tasks = new Map<string, BackgroundTask>();
  private idCounter = 0;

  constructor(readonly waitUntil: (promise: Promise<unknown>) => void) {}

  create(toolName: string, args: Record<string, unknown>, toolCallId: string): BackgroundTask {
    const task: BackgroundTask = {
      id: this.generateId(),
      toolCallId,
      toolName,
      args,
      status: "pending",
      startedAt: Date.now(),
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
    if (!task) return;
    Object.assign(task, updates);
  }

  cancel(id: string): {
    cancelled: boolean;
    previousStatus: BackgroundTaskStatus | null;
    reason?: string;
  } {
    const task = this.tasks.get(id);
    if (!task) {
      return { cancelled: false, previousStatus: null, reason: "task not found" };
    }

    const previousStatus = task.status;
    if (previousStatus === "pending" || previousStatus === "running") {
      task.abortController?.abort();
      task.status = "cancelled";
      task.completedAt = Date.now();
      return { cancelled: true, previousStatus };
    }

    return {
      cancelled: false,
      previousStatus,
      reason: `task already in terminal state: ${previousStatus}`,
    };
  }

  cleanup(maxAgeMs = DEFAULT_TASK_RETENTION_MS): void {
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (task.completedAt && now - task.completedAt > maxAgeMs) {
        this.tasks.delete(id);
      }
    }
  }

  private generateId(): string {
    this.idCounter += 1;
    return `bg_${Date.now()}_${this.idCounter}`;
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
        () => executionFactory(task.abortController?.signal),
        timeoutMs,
        task.abortController?.signal,
      );

      const failure = extractFailureMessage(result);
      store.update(task.id, {
        status: failure ? "failed" : "completed",
        result,
        ...(failure ? { error: failure } : {}),
        completedAt: Date.now(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const cancelled = task.abortController?.signal.aborted || isAbortError(error);
      const status: BackgroundTaskStatus = cancelled ? "cancelled" : "failed";

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
  if (!result || typeof result !== "object") return null;

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
