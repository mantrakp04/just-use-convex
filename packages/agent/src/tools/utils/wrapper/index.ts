// ── Store ──────────────────────────────────────────────────────────────
export { BackgroundTaskStore, runInBackground } from "./store";
export { TruncatedOutputStore } from "./truncation";

// ── Wrapping ───────────────────────────────────────────────────────────
export { createWrappedTool, patchToolWithBackgroundSupport } from "./wrap";

// ── Toolkit ────────────────────────────────────────────────────────────
export { createBackgroundTaskToolkit, withBackgroundTaskTools } from "./toolkit";

// ── Constants ──────────────────────────────────────────────────────────
export { DEFAULT_MAX_DURATION_MS, TERMINAL_STATUSES } from "./types";

// ── Types ──────────────────────────────────────────────────────────────
export type {
  BackgroundTask,
  BackgroundTaskResult,
  BackgroundTaskStatus,
  BackgroundTaskStoreApi,
  BeforeFailureHook,
  BeforeFailureHookContext,
  ExecutionFactory,
  PostExecuteContext,
  PostExecuteHook,
  RunInBackgroundOptions,
  StartBackgroundTask,
  StartBackgroundTaskInput,
  ToolCallConfig,
  ToolExecuteFn,
  ToolOrToolkit,
  TruncatedOutput,
  TruncatedOutputStoreApi,
  WrappedExecuteFactoryOptions,
  WrappedExecuteOptions,
  WrappedToolOptions,
} from "./types";
