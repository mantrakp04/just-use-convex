import { ToolTimeoutError } from "./timeout";
import { TERMINAL_STATUSES } from "./types";
import type {
  BackgroundTask,
  BackgroundTaskFilterStatus,
  BackgroundTaskStoreApi,
  BackgroundTaskWaitConfig,
  GetBackgroundTaskInput,
} from "./types";

export async function getBackgroundTask(
  store: BackgroundTaskStoreApi,
  input: GetBackgroundTaskInput,
  waitConfig: BackgroundTaskWaitConfig,
) {
  if (!input.waitForCompletion) {
    return buildTaskResult(getTaskOrThrow(store, input.taskId));
  }

  const timeoutMs = resolveTimeoutMs(input.timeoutMs, waitConfig.defaultTimeoutMs);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    throwIfAborted(waitConfig.abortSignal);

    const task = getTaskOrThrow(store, input.taskId);
    if (TERMINAL_STATUSES.includes(task.status)) {
      return buildTaskResult(task);
    }

    await sleep(waitConfig.pollIntervalMs);
  }

  const latestTask = getTaskOrThrow(store, input.taskId);
  if (TERMINAL_STATUSES.includes(latestTask.status)) {
    return buildTaskResult(latestTask);
  }

  throw new ToolTimeoutError(timeoutMs);
}

export function listBackgroundTasks(
  store: BackgroundTaskStoreApi,
  status: BackgroundTaskFilterStatus = "all",
) {
  let tasks = store.getAll();
  if (status !== "all") {
    tasks = tasks.filter((task) => task.status === status);
  }

  return {
    tasks: tasks.map((task) => ({ id: task.id, status: task.status })),
  };
}

export function cancelBackgroundTask(
  store: BackgroundTaskStoreApi,
  taskId: string,
) {
  const { cancelled, previousStatus, reason } = store.cancel(taskId);
  if (previousStatus === null) {
    throw new Error(`Task not found: ${taskId}`);
  }

  return { taskId, cancelled, ...(reason ? { reason } : {}) };
}

function getTaskOrThrow(store: BackgroundTaskStoreApi, taskId: string): BackgroundTask {
  const task = store.get(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}

function buildTaskResult(task: BackgroundTask) {
  return {
    taskId: task.id,
    status: task.status,
    ...(task.status === "completed" ? { result: task.result } : {}),
    ...(task.status === "failed" ? { error: task.error } : {}),
  };
}

function resolveTimeoutMs(timeoutMs: number | undefined, defaultTimeoutMs: number): number {
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs)) {
    return defaultTimeoutMs;
  }
  return Math.max(1, Math.floor(timeoutMs));
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw new DOMException("Aborted", "AbortError");
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
