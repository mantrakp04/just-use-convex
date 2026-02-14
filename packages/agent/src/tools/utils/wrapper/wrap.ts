import { createTool, type BaseTool } from "@voltagent/core";
import { runInBackground } from "./store";
import { createWrappedExecute, augmentParametersSchema, isZodObjectSchema } from "./execute";
import { createResultTruncationHook } from "./truncation";
import { isToolTimeoutError } from "./timeout";
import type {
  BackgroundTaskStoreApi,
  BeforeFailureHook,
  StartBackgroundTask,
  ToolCallConfig,
  TruncatedOutputStoreApi,
  WrappedToolOptions,
} from "./types";

// ── Public API ─────────────────────────────────────────────────────────

export function createWrappedTool(options: WrappedToolOptions): BaseTool {
  const { name, description, parameters, toolCallConfig, store, outputStore, execute } = options;
  const config = toolCallConfig ?? {};
  const startBackground = createStartBackgroundTask(store);
  const truncateOutput = createResultTruncationHook(outputStore);

  return createTool({
    name,
    description,
    parameters: augmentParametersSchema(parameters.shape, config),
    execute: createWrappedExecute({
      toolName: name,
      execute: execute ?? (() => undefined),
      config,
      startBackground,
      postExecute: truncateOutput,
      beforeFailureHooks: [createTimeoutPromotionHook(startBackground)],
    }),
  });
}

export function patchToolWithBackgroundSupport(
  tool: BaseTool,
  store: BackgroundTaskStoreApi,
  outputStore: TruncatedOutputStoreApi,
  config: ToolCallConfig = {},
): void {
  if (!tool.execute) return;

  const startBackground = createStartBackgroundTask(store);
  const truncateOutput = createResultTruncationHook(outputStore);

  Object.defineProperty(tool, "execute", {
    value: createWrappedExecute({
      toolName: tool.name,
      execute: tool.execute,
      config,
      startBackground,
      postExecute: truncateOutput,
      beforeFailureHooks: [createTimeoutPromotionHook(startBackground)],
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

// ── Internals ──────────────────────────────────────────────────────────

function createStartBackgroundTask(store: BackgroundTaskStoreApi): StartBackgroundTask {
  return (input) => runInBackground({ store, ...input });
}

function createTimeoutPromotionHook(startBackground: StartBackgroundTask): BeforeFailureHook {
  return (context) => {
    if (!isToolTimeoutError(context.error) || !context.config.allowBackground) return undefined;

    return startBackground({
      toolCallId: context.toolCallId,
      toolName: context.toolName,
      toolArgs: context.toolArgs,
      executionFactory: context.executionFactory,
      timeoutMs: context.maxBackgroundDuration,
    });
  };
}
