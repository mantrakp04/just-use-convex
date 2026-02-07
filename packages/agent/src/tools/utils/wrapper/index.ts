import { createTool, type BaseTool } from "@voltagent/core";
import { runInBackground, BackgroundTaskStore } from "./background";
import { createWrappedExecute, augmentParametersSchema, isZodObjectSchema } from "./tool";
import { isToolTimeoutError } from "./timeout";
import { createBackgroundTaskToolkit, withBackgroundTaskTools } from "./tools";
import type {
  BackgroundTaskStoreApi,
  BeforeFailureHook,
  ToolCallConfig,
  WrappedToolOptions,
} from "./types";

function createTimeoutToBackgroundHook(store: BackgroundTaskStoreApi): BeforeFailureHook {
  return async ({
    error,
    toolCallId,
    toolName,
    toolArgs,
    executionFactory,
    effectiveTimeout,
    maxAllowedDuration,
  }) => {
    if (!isToolTimeoutError(error)) {
      return undefined;
    }

    return runInBackground({
      store,
      toolCallId,
      toolName,
      toolArgs,
      executionFactory,
      timeoutMs: maxAllowedDuration,
      initialLog: `Foreground execution timed out after ${effectiveTimeout}ms, converted to background task`,
    });
  };
}

export function createWrappedTool(options: WrappedToolOptions): BaseTool {
  const { name, description, toolCallConfig, parameters, store, execute } = options;
  const config = toolCallConfig ?? {};

  return createTool({
    name,
    description,
    parameters: augmentParametersSchema(parameters.shape, config),
    execute: createWrappedExecute({
      toolName: name,
      originalExecute: execute ?? (() => undefined),
      config,
      startBackground: (input) => runInBackground({ store, ...input }),
      beforeFailureHooks: [createTimeoutToBackgroundHook(store)],
    }),
  });
}

export function patchToolWithBackgroundSupport(
  tool: BaseTool,
  store: BackgroundTaskStoreApi,
  config: ToolCallConfig = {}
): void {
  const originalExecute = tool.execute;
  if (!originalExecute) return;

  Object.defineProperty(tool, "execute", {
    value: createWrappedExecute({
      toolName: tool.name,
      originalExecute,
      config,
      startBackground: (input) => runInBackground({ store, ...input }),
      beforeFailureHooks: [createTimeoutToBackgroundHook(store)],
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

export {
  BackgroundTaskStore,
  runInBackground,
  createBackgroundTaskToolkit,
  withBackgroundTaskTools,
};
export {
  executeWithTimeout,
  isToolTimeoutError,
  ToolTimeoutError,
} from "./timeout";
export {
  DEFAULT_MAX_DURATION_MS,
  createWrappedExecute,
  augmentParametersSchema,
} from "./tool";
export type {
  BackgroundTaskStatus,
  BackgroundTaskLogType,
  BackgroundTaskLog,
  BackgroundTask,
  BackgroundTaskResult,
  BackgroundTaskWaitUntilResult,
  ToolOrToolkit,
  RunInBackgroundOptions,
  ToolCallConfig,
  WrappedExecuteOptions,
  WrappedToolOptions,
  BackgroundTaskStoreApi,
  StartBackgroundTask,
  StartBackgroundTaskInput,
  ExecutionFactory,
  BeforeFailureHook,
  BeforeFailureHookContext,
  WrappedExecuteFactoryOptions,
} from "./types";
