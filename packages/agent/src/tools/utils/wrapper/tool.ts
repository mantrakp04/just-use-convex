import type { BaseTool, ToolExecuteOptions } from "@voltagent/core";
import { z, type ZodObject, type ZodRawShape } from "zod";
import { executeWithTimeout, isToolTimeoutError } from "./timeout";
import type {
  StartBackgroundTask,
  ToolCallConfig,
  WrappedExecuteFactoryOptions,
  WrappedExecuteOptions,
} from "./types";

export const DEFAULT_MAX_DURATION_MS = 30 * 60 * 1000;
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;

export function augmentParametersSchema(
  shape: ZodRawShape,
  config: ToolCallConfig
): ZodObject<ZodRawShape> {
  const nextShape: ZodRawShape = { ...shape };

  if (config.allowAgentSetDuration && !("timeout" in nextShape)) {
    nextShape.timeout = z
      .number()
      .nonnegative()
      .max(config.maxDuration ?? DEFAULT_MAX_DURATION_MS)
      .optional()
      .describe("Optional timeout in milliseconds.");
  }

  if (config.allowBackground && !("background" in nextShape)) {
    nextShape.background = z
      .boolean()
      .optional()
      .describe("Run in background and return immediately with a backgroundTaskId.");
  }

  return z.object(nextShape);
}

export function createWrappedExecute({
  toolName,
  execute,
  config,
  postExecute,
  beforeFailureHooks = [],
  startBackground,
}: WrappedExecuteFactoryOptions & { startBackground?: StartBackgroundTask }) {
  return async (
    rawArgs: Record<string, unknown>,
    options?: ToolExecuteOptions
  ): Promise<unknown> => {
    const {
      toolArgs,
      shouldRunInBackground,
      maxAllowedDuration,
      effectiveTimeout,
      effectiveMaxOutputTokens,
    } = splitToolArgs(rawArgs, config);

    const toolCallId = resolveToolCallId(options);
    const execution = createExecutionSession({
      execute: async (args, executeOptions) => {
        const result = await execute(args, executeOptions);
        if (!postExecute) {
          return result;
        }
        return await postExecute({
          result,
          toolCallId,
          toolName,
          toolArgs,
          maxOutputTokens: effectiveMaxOutputTokens,
        });
      },
      toolArgs,
      options,
      executionTimeoutMs: effectiveTimeout,
    });

    if (shouldRunInBackground) {
      if (!startBackground) {
        throw new Error(`Background execution is not configured for tool "${toolName}"`);
      }

      return startBackground({
        toolCallId,
        toolName,
        toolArgs,
        executionFactory: execution.executionFactory,
        timeoutMs: effectiveTimeout,
        initialLog: `Background execution started for ${toolName}.`,
      });
    }

    const executionPromise = execution.startForeground();

    try {
      return await executeWithTimeout(
        () => executionPromise,
        effectiveTimeout,
        execution.getAbortSignal()
      );
    } catch (error) {
      if (isToolTimeoutError(error)) {
        execution.detachRequestAbortLinks();
      }

      for (const hook of beforeFailureHooks) {
        const hookResult = await hook({
          error,
          options,
          toolCallId,
          toolName,
          toolArgs,
          config,
          effectiveTimeout,
          maxAllowedDuration,
          executionFactory: execution.executionFactory,
          executionPromise,
        });

        if (hookResult !== undefined) {
          return hookResult;
        }
      }

      throw error;
    }
  };
}

export function isZodObjectSchema(
  schema: BaseTool["parameters"]
): schema is ZodObject<ZodRawShape> {
  return Boolean(schema && typeof schema === "object" && "shape" in schema);
}

function createExecutionSession({
  execute,
  toolArgs,
  options,
  executionTimeoutMs,
}: Pick<WrappedExecuteFactoryOptions, "execute"> & {
  toolArgs: Record<string, unknown>;
  options?: ToolExecuteOptions;
  executionTimeoutMs: number;
}) {
  type LogSink = NonNullable<WrappedExecuteOptions["streamLogs"]>;
  type LogEntry = Parameters<LogSink>[0];

  const logHistory: LogEntry[] = [];
  const logSinks = new Set<LogSink>();
  const requestAbortUnsubscribers: Array<() => void> = [];

  let abortController: AbortController | undefined;
  let executionPromise: Promise<unknown> | undefined;

  const emitLog: LogSink = (entry) => {
    logHistory.push(entry);
    for (const sink of logSinks) {
      try {
        sink(entry);
      } catch {
        // Ignore log sink errors so tools are never interrupted by logging failures.
      }
    }
  };

  const registerLogSink = (sink?: LogSink) => {
    if (!sink) {
      return;
    }
    logSinks.add(sink);
    for (const historicalEntry of logHistory) {
      try {
        sink(historicalEntry);
      } catch {
        // Ignore sink replay errors.
      }
    }
  };

  const startExecution = (
    mode: "foreground" | "background",
    backgroundSignal?: AbortSignal,
    streamLogs?: LogSink
  ): Promise<unknown> => {
    registerLogSink(streamLogs);

    if (executionPromise) {
      if (backgroundSignal && abortController) {
        linkAbortSignal(backgroundSignal, abortController);
      }
      return executionPromise;
    }

    abortController = new AbortController();

    if (mode === "foreground") {
      const requestAbortSignal = options?.abortController?.signal;
      const toolContextAbortSignal = options?.toolContext?.abortSignal;

      const requestAbortCleanup = linkAbortSignal(requestAbortSignal, abortController);
      if (requestAbortCleanup) {
        requestAbortUnsubscribers.push(requestAbortCleanup);
      }

      const toolContextCleanup = linkAbortSignal(toolContextAbortSignal, abortController);
      if (toolContextCleanup) {
        requestAbortUnsubscribers.push(toolContextCleanup);
      }
    }

    if (backgroundSignal) {
      linkAbortSignal(backgroundSignal, abortController);
    }

    const wrappedOptions = buildWrappedExecuteOptions(
      options,
      abortController,
      emitLog,
      executionTimeoutMs
    );
    executionPromise = Promise.resolve(execute(toolArgs, wrappedOptions));
    return executionPromise;
  };

  return {
    startForeground: () => startExecution("foreground"),
    getAbortSignal: (): AbortSignal | undefined => abortController?.signal,
    executionFactory: (abortSignal?: AbortSignal, streamLogs?: LogSink) =>
      startExecution("background", abortSignal, streamLogs),
    detachRequestAbortLinks: () => {
      while (requestAbortUnsubscribers.length > 0) {
        const unsubscribe = requestAbortUnsubscribers.pop();
        unsubscribe?.();
      }
    },
  };
}

function splitToolArgs(args: Record<string, unknown>, config: ToolCallConfig) {
  const toolArgs: Record<string, unknown> = { ...args };

  let requestedTimeout: number | undefined;
  let shouldRunInBackground = false;

  if (config.allowAgentSetDuration) {
    const timeout = normalizeDuration(args.timeout);
    const timeoutMs = timeout === undefined
      ? normalizeDuration(args.timeoutMs)
      : undefined;
    const resolvedTimeout = timeout ?? timeoutMs;

    if (resolvedTimeout !== undefined) {
      requestedTimeout = resolvedTimeout;
      delete toolArgs.timeout;
    }
  }

  if (config.allowBackground && typeof args.background === "boolean") {
    shouldRunInBackground = args.background;
    delete toolArgs.background;
  }

  const maxAllowedDuration =
    normalizeDuration(config.maxDuration, DEFAULT_MAX_DURATION_MS) ?? DEFAULT_MAX_DURATION_MS;
  const effectiveTimeout =
    requestedTimeout !== undefined
      ? Math.min(requestedTimeout, maxAllowedDuration)
      : maxAllowedDuration;
  const effectiveMaxOutputTokens =
    normalizeTokenCount(config.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS) ??
    DEFAULT_MAX_OUTPUT_TOKENS;

  return {
    toolArgs,
    shouldRunInBackground,
    maxAllowedDuration,
    effectiveTimeout,
    effectiveMaxOutputTokens,
  };
}

function resolveToolCallId(options?: ToolExecuteOptions): string {
  const callId = options?.toolContext?.callId;
  if (typeof callId === "string" && callId.trim().length > 0) {
    return callId;
  }
  return `tool_${Date.now()}`;
}

function buildWrappedExecuteOptions(
  options: ToolExecuteOptions | undefined,
  abortController: AbortController,
  emitLog: NonNullable<WrappedExecuteOptions["streamLogs"]>,
  timeoutMs: number
): WrappedExecuteOptions {
  const wrappedOptions: WrappedExecuteOptions = {
    ...(options ?? {}),
    abortController,
    streamLogs: emitLog,
    log: emitLog,
    timeout: timeoutMs,
  };

  if (options?.toolContext) {
    wrappedOptions.toolContext = {
      ...options.toolContext,
      abortSignal: abortController.signal,
    };
  }

  return wrappedOptions;
}

function linkAbortSignal(
  sourceSignal: AbortSignal | undefined,
  targetController: AbortController
): (() => void) | undefined {
  if (!sourceSignal || sourceSignal === targetController.signal) {
    return undefined;
  }

  const abortTarget = () => {
    try {
      targetController.abort();
    } catch {
      // Ignore repeated abort calls.
    }
  };

  if (sourceSignal.aborted) {
    abortTarget();
    return undefined;
  }

  sourceSignal.addEventListener("abort", abortTarget, { once: true });
  return () => {
    sourceSignal.removeEventListener("abort", abortTarget);
  };
}

function normalizeDuration(value: unknown, fallback?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeTokenCount(value: unknown, fallback?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.floor(value));
}
