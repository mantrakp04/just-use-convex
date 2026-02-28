// ── Store ──────────────────────────────────────────────────────────────
export { BackgroundTaskStore, runInBackground } from "./store";
export { TruncatedOutputStore } from "./truncation";
export {
  cancelBackgroundTask,
  getBackgroundTask,
  listBackgroundTasks,
} from "./background-task-control";

// ── Wrapping ───────────────────────────────────────────────────────────
export { createWrappedTool, patchToolWithBackgroundSupport } from "./wrap";
export { patchToolWithStepTracking, type StepTrackingContext } from "./step-tracking";

// ── Toolkit ────────────────────────────────────────────────────────────
export { createBackgroundTaskToolkit } from "./toolkit";

// ── Constants ──────────────────────────────────────────────────────────
export { DEFAULT_MAX_DURATION_MS, TERMINAL_STATUSES } from "./types";

// ── Types ──────────────────────────────────────────────────────────────
export type {
  BackgroundTaskFilterStatus,
  BackgroundTask,
  BackgroundTaskResult,
  BackgroundTaskStatus,
  BackgroundTaskStoreApi,
  BackgroundTaskToolkitConfig,
  BackgroundTaskWaitConfig,
  BeforeFailureHook,
  BeforeFailureHookContext,
  ExecutionFactory,
  GetBackgroundTaskInput,
  PostExecuteContext,
  PostExecuteHook,
  RunInBackgroundOptions,
  StartBackgroundTask,
  StartBackgroundTaskInput,
  ToolCallConfig,
  ToolExecuteFn,
  TruncatedOutput,
  TruncatedOutputStoreApi,
  WrappedExecuteFactoryOptions,
  WrappedExecuteOptions,
  WrappedToolOptions,
} from "./types";
