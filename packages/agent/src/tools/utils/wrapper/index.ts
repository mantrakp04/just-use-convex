import { createTool, type BaseTool } from "@voltagent/core";
import { runInBackground } from "./background";
import {
  createWrappedExecute,
  augmentParametersSchema,
  DEFAULT_MAX_OUTPUT_TOKENS,
  isZodObjectSchema,
} from "./tool";
import { isToolTimeoutError } from "./timeout";
import type {
  BackgroundTaskStoreApi,
  BeforeFailureHook,
  StartBackgroundTask,
  ToolCallConfig,
  WrappedToolOptions,
} from "./types";

function createStartBackgroundTask(store: BackgroundTaskStoreApi): StartBackgroundTask {
  return ({ initialLog, ...input }) => {
    const backgroundResult = runInBackground({ store, ...input });
    if (typeof initialLog === "string" && initialLog.trim().length > 0) {
      store.addLog(backgroundResult.backgroundTaskId, {
        type: "info",
        message: initialLog.trim(),
      });
    }
    return backgroundResult;
  };
}

function createTimeoutPromotionHook(startBackgroundTask: StartBackgroundTask): BeforeFailureHook {
  return async ({
    error,
    toolCallId,
    toolName,
    toolArgs,
    executionFactory,
    maxAllowedDuration,
  }) => {
    if (!isToolTimeoutError(error)) {
      return undefined;
    }

    return startBackgroundTask({
      toolCallId,
      toolName,
      toolArgs,
      executionFactory,
      timeoutMs: maxAllowedDuration,
      initialLog: `Foreground execution timed out. Continued in background for up to ${maxAllowedDuration}ms.`,
    });
  };
}

export function createWrappedTool(options: WrappedToolOptions): BaseTool {
  const { name, description, parameters, toolCallConfig, store, execute } = options;
  const config = toolCallConfig ?? {};
  const startBackgroundTask = createStartBackgroundTask(store);
  const truncateOutput = createResultTruncationHook(store);

  return createTool({
    name,
    description,
    parameters: augmentParametersSchema(parameters.shape, config),
    execute: createWrappedExecute({
      toolName: name,
      execute: execute ?? (() => undefined),
      config,
      startBackground: startBackgroundTask,
      postExecute: truncateOutput,
      beforeFailureHooks: [createTimeoutPromotionHook(startBackgroundTask)],
    }),
  });
}

export function patchToolWithBackgroundSupport(
  tool: BaseTool,
  store: BackgroundTaskStoreApi,
  config: ToolCallConfig = {}
): void {
  if (!tool.execute) {
    return;
  }

  const startBackgroundTask = createStartBackgroundTask(store);
  const truncateOutput = createResultTruncationHook(store);

  Object.defineProperty(tool, "execute", {
    value: createWrappedExecute({
      toolName: tool.name,
      execute: tool.execute,
      config,
      startBackground: startBackgroundTask,
      postExecute: truncateOutput,
      beforeFailureHooks: [createTimeoutPromotionHook(startBackgroundTask)],
    }),
    writable: true,
    configurable: true,
  });

  if (isZodObjectSchema(tool.parameters)) {
    Object.defineProperty(tool, "parameters", {
      value: augmentParametersSchema(tool.parameters.shape, config),
      writable: true,
      configurable: true,
    });
  }
}

export { BackgroundTaskStore, runInBackground } from "./background";
export { createBackgroundTaskToolkit, withBackgroundTaskTools } from "./tools";
export { DEFAULT_MAX_DURATION_MS } from "./tool";
export { TERMINAL_STATUSES } from "./types";
export type {
  BackgroundTask,
  BackgroundTaskLog,
  BackgroundTaskLogType,
  BackgroundTaskResult,
  BackgroundTaskStatus,
  BackgroundTaskStoreApi,
  BeforeFailureHook,
  BeforeFailureHookContext,
  ExecutionFactory,
  RunInBackgroundOptions,
  StartBackgroundTask,
  StartBackgroundTaskInput,
  ToolCallConfig,
  ToolOrToolkit,
  WrappedExecuteFactoryOptions,
  WrappedExecuteOptions,
  WrappedToolOptions,
} from "./types";

const OUTPUT_CHARS_PER_TOKEN = 4;
const DEFAULT_READ_LOG_LINES = 200;

function createResultTruncationHook(store: BackgroundTaskStoreApi) {
  return ({
    result,
    toolCallId,
    toolName,
    maxOutputTokens,
  }: {
    result: unknown;
    toolCallId: string;
    toolName: string;
    maxOutputTokens: number;
  }): unknown => {
    const maxTokens = Math.max(1, Math.floor(maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS));
    const maxChars = maxTokens * OUTPUT_CHARS_PER_TOKEN;
    const serialized = serializeResult(result);

    if (serialized.length <= maxChars) {
      return result;
    }

    const { logId, size, totalLines } = store.createOutputLog({
      toolCallId,
      toolName,
      content: serialized,
    });
    const truncated = withTruncationNote(serialized.slice(0, maxChars), logId, maxTokens);
    const readLogs = { logId, offset: 0, lines: DEFAULT_READ_LOG_LINES };

    if (typeof result === "string") {
      return truncated;
    }

    if (isRecord(result)) {
      const largeField = pickLargeTextField(result, maxChars);
      if (largeField) {
        const fieldContent = result[largeField] as string;
        return {
          ...result,
          [largeField]: withTruncationNote(fieldContent.slice(0, maxChars), logId, maxTokens),
          _truncated: true,
          _readLogs: readLogs,
          _fullOutputSize: size,
          _fullOutputLines: totalLines,
        };
      }

      return {
        ...result,
        _truncated: true,
        _readLogs: readLogs,
        _fullOutputSize: size,
        _fullOutputLines: totalLines,
        _note: `Output truncated. Use read_logs with logId "${logId}".`,
      };
    }

    return {
      _truncated: true,
      _readLogs: readLogs,
      _fullOutputSize: size,
      _fullOutputLines: totalLines,
      preview: truncated,
    };
  };
}

function serializeResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  try {
    const stringified = JSON.stringify(result, null, 2);
    if (typeof stringified === "string") {
      return stringified;
    }
  } catch {
    // Fall back to String conversion.
  }

  return String(result);
}

function withTruncationNote(content: string, logId: string, maxOutputTokens: number): string {
  return `${content}

[Output truncated to ~${maxOutputTokens} tokens. Use read_logs with {"logId":"${logId}","offset":0,"lines":${DEFAULT_READ_LOG_LINES}}.]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickLargeTextField(value: Record<string, unknown>, maxChars: number): string | null {
  const candidates = ["output", "content", "stdout", "stderr", "text", "result"];
  for (const key of candidates) {
    const fieldValue = value[key];
    if (typeof fieldValue === "string" && fieldValue.length > maxChars) {
      return key;
    }
  }
  return null;
}
