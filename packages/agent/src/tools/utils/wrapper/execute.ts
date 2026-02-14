import type { BaseTool, ToolExecuteOptions } from "@voltagent/core";
import { z, type ZodObject, type ZodRawShape } from "zod";
import { executeWithTimeout, isToolTimeoutError } from "./timeout";
import {
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_MAX_BACKGROUND_DURATION_MS,
  DEFAULT_MAX_OUTPUT_TOKENS,
} from "./types";
import type {
  ToolCallConfig,
  WrappedExecuteFactoryOptions,
  WrappedExecuteOptions,
} from "./types";

// ── Public ─────────────────────────────────────────────────────────────

export function createWrappedExecute({
  toolName,
  execute,
  config,
  postExecute,
  beforeFailureHooks = [],
  startBackground,
}: WrappedExecuteFactoryOptions) {
  return async (
    rawArgs: Record<string, unknown>,
    options?: ToolExecuteOptions,
  ): Promise<unknown> => {
    const {
      toolArgs,
      shouldRunInBackground,
      maxAllowedDuration,
      maxBackgroundDuration,
      effectiveTimeout,
      effectiveBackgroundTimeout,
      effectiveMaxOutputTokens,
    } = splitToolArgs(rawArgs, config);

    const toolCallId = resolveToolCallId(options);
    const session = createExecutionSession({
      execute: async (args, executeOptions) => {
        const result = await execute(args, executeOptions);
        if (!postExecute) return result;
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
        executionFactory: session.executionFactory,
        timeoutMs: effectiveBackgroundTimeout,
      });
    }

    const executionPromise = session.startForeground();

    try {
      return await executeWithTimeout(
        () => executionPromise,
        effectiveTimeout,
        session.getAbortSignal(),
      );
    } catch (error) {
      if (isToolTimeoutError(error)) {
        session.detachRequestAbortLinks();
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
          maxBackgroundDuration,
          executionFactory: session.executionFactory,
          executionPromise,
        });

        if (hookResult !== undefined) return hookResult;
      }

      throw error;
    }
  };
}

export function augmentParametersSchema(
  shape: ZodRawShape,
  config: ToolCallConfig,
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

export function isZodObjectSchema(
  schema: BaseTool["parameters"],
): schema is ZodObject<ZodRawShape> {
  return Boolean(schema && typeof schema === "object" && "shape" in schema);
}

// ── Internals ──────────────────────────────────────────────────────────

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
  const requestAbortUnsubscribers: Array<() => void> = [];
  let abortController: AbortController | undefined;
  let executionPromise: Promise<unknown> | undefined;

  const startExecution = (
    mode: "foreground" | "background",
    backgroundSignal?: AbortSignal,
  ): Promise<unknown> => {
    if (executionPromise) {
      if (backgroundSignal && abortController) {
        linkAbortSignal(backgroundSignal, abortController);
      }
      return executionPromise;
    }

    abortController = new AbortController();

    if (mode === "foreground") {
      const requestCleanup = linkAbortSignal(options?.abortController?.signal, abortController);
      if (requestCleanup) requestAbortUnsubscribers.push(requestCleanup);

      const contextCleanup = linkAbortSignal(options?.toolContext?.abortSignal, abortController);
      if (contextCleanup) requestAbortUnsubscribers.push(contextCleanup);
    }

    if (backgroundSignal) {
      linkAbortSignal(backgroundSignal, abortController);
    }

    const wrappedOptions = buildWrappedExecuteOptions(options, abortController, executionTimeoutMs);
    executionPromise = Promise.resolve(execute(toolArgs, wrappedOptions));
    return executionPromise;
  };

  return {
    startForeground: () => startExecution("foreground"),
    getAbortSignal: (): AbortSignal | undefined => abortController?.signal,
    executionFactory: (abortSignal?: AbortSignal) => startExecution("background", abortSignal),
    detachRequestAbortLinks: () => {
      while (requestAbortUnsubscribers.length > 0) {
        requestAbortUnsubscribers.pop()?.();
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
    const timeoutMs = timeout === undefined ? normalizeDuration(args.timeoutMs) : undefined;
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
  const maxBackgroundDuration =
    normalizeDuration(config.maxBackgroundDuration, DEFAULT_MAX_BACKGROUND_DURATION_MS) ?? DEFAULT_MAX_BACKGROUND_DURATION_MS;
  const effectiveTimeout =
    requestedTimeout !== undefined
      ? Math.min(requestedTimeout, maxAllowedDuration)
      : maxAllowedDuration;
  const effectiveBackgroundTimeout = maxBackgroundDuration ?? DEFAULT_MAX_BACKGROUND_DURATION_MS;
  const effectiveMaxOutputTokens =
    normalizeTokenCount(config.maxOutputTokens, DEFAULT_MAX_OUTPUT_TOKENS) ??
    DEFAULT_MAX_OUTPUT_TOKENS;

  return { toolArgs, shouldRunInBackground, maxAllowedDuration, maxBackgroundDuration, effectiveTimeout, effectiveBackgroundTimeout, effectiveMaxOutputTokens };
}

function resolveToolCallId(options?: ToolExecuteOptions): string {
  const callId = options?.toolContext?.callId;
  return typeof callId === "string" && callId.trim().length > 0 ? callId : `tool_${Date.now()}`;
}

function buildWrappedExecuteOptions(
  options: ToolExecuteOptions | undefined,
  abortController: AbortController,
  timeoutMs: number,
): WrappedExecuteOptions {
  const wrappedOptions: WrappedExecuteOptions = {
    ...(options ?? {}),
    abortController,
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
  targetController: AbortController,
): (() => void) | undefined {
  if (!sourceSignal || sourceSignal === targetController.signal) return undefined;

  const abortTarget = () => {
    try { targetController.abort(); } catch { /* repeated abort */ }
  };

  if (sourceSignal.aborted) {
    abortTarget();
    return undefined;
  }

  sourceSignal.addEventListener("abort", abortTarget, { once: true });
  return () => sourceSignal.removeEventListener("abort", abortTarget);
}

function normalizeDuration(value: unknown, fallback?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function normalizeTokenCount(value: unknown, fallback?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}
