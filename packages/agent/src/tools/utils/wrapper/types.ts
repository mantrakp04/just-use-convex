import type { BaseTool, ToolExecuteOptions, Toolkit } from "@voltagent/core";
import type { ZodObject, ZodRawShape } from "zod";

// ── Constants ──────────────────────────────────────────────────────────

export const DEFAULT_MAX_DURATION_MS = 30 * 60 * 1000;
export const DEFAULT_MAX_BACKGROUND_DURATION_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;
export const DEFAULT_TASK_RETENTION_MS = 60 * 60 * 1000;
export const OUTPUT_CHARS_PER_TOKEN = 4;

export const TERMINAL_STATUSES: readonly BackgroundTaskStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

// ── Background Task ────────────────────────────────────────────────────

export type BackgroundTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

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
  abortController?: AbortController;
};

export type BackgroundTaskResult = {
  backgroundTaskId: string;
};

export interface BackgroundTaskStoreApi {
  waitUntil: (promise: Promise<unknown>) => void;
  create(toolName: string, args: Record<string, unknown>, toolCallId: string): BackgroundTask;
  get(id: string): BackgroundTask | undefined;
  getAll(): BackgroundTask[];
  update(id: string, updates: Partial<BackgroundTask>): void;
  cancel(id: string): {
    cancelled: boolean;
    previousStatus: BackgroundTaskStatus | null;
    reason?: string;
  };
}

// ── Execution ──────────────────────────────────────────────────────────

export type ExecutionFactory = (
  abortSignal?: AbortSignal,
) => Promise<unknown> | unknown;

export type ToolExecuteFn = (
  args: Record<string, unknown>,
  opts?: ToolExecuteOptions,
) => unknown | Promise<unknown>;

export type RunInBackgroundOptions = {
  store: BackgroundTaskStoreApi;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  executionFactory: ExecutionFactory;
  timeoutMs: number;
};

export type StartBackgroundTaskInput = {
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  executionFactory: ExecutionFactory;
  timeoutMs: number;
};

export type StartBackgroundTask = (input: StartBackgroundTaskInput) => unknown;

// ── Tool Config ────────────────────────────────────────────────────────

export type ToolCallConfig = {
  maxDuration?: number;
  maxBackgroundDuration?: number;
  allowAgentSetDuration?: boolean;
  allowBackground?: boolean;
  maxOutputTokens?: number;
};

export type WrappedExecuteOptions = ToolExecuteOptions & {
  timeout?: number;
};

// ── Hooks ──────────────────────────────────────────────────────────────

export type PostExecuteContext = {
  result: unknown;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  maxOutputTokens: number;
};

export type PostExecuteHook = (context: PostExecuteContext) => Promise<unknown> | unknown;

export type BeforeFailureHookContext = {
  error: unknown;
  options?: ToolExecuteOptions;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  config: ToolCallConfig;
  effectiveTimeout: number;
  maxAllowedDuration: number;
  maxBackgroundDuration: number;
  executionFactory: ExecutionFactory;
  executionPromise: Promise<unknown>;
};

export type BeforeFailureHook = (
  context: BeforeFailureHookContext,
) => Promise<unknown | undefined> | unknown | undefined;

// ── Factory Options ────────────────────────────────────────────────────

export type WrappedExecuteFactoryOptions = {
  toolName: string;
  execute: ToolExecuteFn;
  config: ToolCallConfig;
  startBackground?: StartBackgroundTask;
  postExecute?: PostExecuteHook;
  beforeFailureHooks?: BeforeFailureHook[];
};

export type WrappedToolOptions = {
  name: string;
  description: string;
  parameters: ZodObject<ZodRawShape>;
  toolCallConfig?: ToolCallConfig;
  store: BackgroundTaskStoreApi;
  outputStore: TruncatedOutputStoreApi;
  execute?: (
    args: Record<string, unknown>,
    options?: WrappedExecuteOptions,
  ) => unknown | Promise<unknown>;
};

// ── Truncated Output ──────────────────────────────────────────────────

export type TruncatedOutput = {
  id: string;
  toolCallId: string;
  toolName: string;
  content: string;
  createdAt: number;
};

export interface TruncatedOutputStoreApi {
  store(content: string, meta: { toolCallId: string; toolName: string }): string;
  get(id: string): TruncatedOutput | undefined;
  getAll(): TruncatedOutput[];
  cleanup(maxAgeMs?: number): void;
}

// ── Utilities ──────────────────────────────────────────────────────────

export type ToolOrToolkit = BaseTool | Toolkit;
