import type { BaseTool, ToolExecuteOptions, Toolkit } from "@voltagent/core";
import type { ZodObject, ZodRawShape } from "zod";

export type BackgroundTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type BackgroundTaskLogType = "stdout" | "stderr" | "info" | "error";

export type BackgroundTaskLog = {
  timestamp: number;
  type: BackgroundTaskLogType;
  message: string;
};

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

export interface BackgroundTaskStoreApi {
  readonly waitUntil?: (promise: Promise<unknown>) => void;
  create(toolName: string, args: Record<string, unknown>, toolCallId: string): BackgroundTask;
  get(id: string): BackgroundTask | undefined;
  getAll(): BackgroundTask[];
  update(id: string, updates: Partial<BackgroundTask>): void;
  addLog(id: string, log: Omit<BackgroundTaskLog, "timestamp">): void;
  getLogs(
    id: string,
    offset?: number,
    limit?: number
  ): { logs: BackgroundTaskLog[]; total: number; hasMore: boolean };
  cancel(id: string): { cancelled: boolean; previousStatus: BackgroundTaskStatus | null };
}

export type BackgroundTaskResult = {
  backgroundTaskId: string;
  status: "started" | "converted_to_background";
};

export type BackgroundTaskWaitUntilResult = {
  taskId: string;
  status: BackgroundTaskStatus;
  logs: BackgroundTaskLog[];
  result?: unknown;
  error?: string;
};

export type ExecutionFactory = (
  abortSignal?: AbortSignal,
  streamLogs?: (entry: { type: BackgroundTaskLogType; message: string }) => void
) => Promise<unknown> | unknown;

export type RunInBackgroundOptions = {
  store: BackgroundTaskStoreApi;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  executionFactory: ExecutionFactory;
  timeoutMs: number;
  initialLog?: string;
};

export const TERMINAL_STATUSES: readonly BackgroundTaskStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export type ToolOrToolkit = BaseTool | Toolkit;

export type ToolCallConfig = {
  maxDuration?: number;
  allowAgentSetDuration?: boolean;
  allowBackground?: boolean;
};

export type WrappedExecuteOptions = ToolExecuteOptions & {
  timeout?: number;
  streamLogs?: (entry: { type: BackgroundTaskLogType; message: string }) => void;
  log?: (entry: { type: BackgroundTaskLogType; message: string }) => void;
};

export type WrappedToolOptions = {
  name: string;
  description: string;
  parameters: ZodObject<ZodRawShape>;
  toolCallConfig?: ToolCallConfig;
  store: BackgroundTaskStoreApi;
  execute?: (
    args: Record<string, unknown>,
    options?: WrappedExecuteOptions
  ) => unknown | Promise<unknown>;
};

export type StartBackgroundTaskInput = {
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  executionFactory: ExecutionFactory;
  timeoutMs: number;
  initialLog?: string;
};

export type StartBackgroundTask = (input: StartBackgroundTaskInput) => unknown;

export type BeforeFailureHookContext = {
  error: unknown;
  options?: ToolExecuteOptions;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  config: ToolCallConfig;
  effectiveTimeout: number;
  maxAllowedDuration: number;
  executionFactory: ExecutionFactory;
  executionPromise: Promise<unknown>;
};

export type BeforeFailureHook = (
  context: BeforeFailureHookContext
) => Promise<unknown | undefined> | unknown | undefined;

export type WrappedExecuteFactoryOptions = {
  toolName: string;
  originalExecute: (
    args: Record<string, unknown>,
    opts?: ToolExecuteOptions
  ) => unknown | Promise<unknown>;
  config: ToolCallConfig;
  startBackground?: StartBackgroundTask;
  beforeFailureHooks?: BeforeFailureHook[];
};
