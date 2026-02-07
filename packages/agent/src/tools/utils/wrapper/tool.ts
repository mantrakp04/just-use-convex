import type { BaseTool, ToolExecuteOptions } from "@voltagent/core";
import { z, type ZodObject, type ZodRawShape } from "zod";
import { executeWithTimeout, isToolTimeoutError } from "./timeout";
import type {
  ToolCallConfig,
  WrappedExecuteOptions,
  WrappedExecuteFactoryOptions,
} from "./types";

export const DEFAULT_MAX_DURATION_MS = 30 * 60 * 1000;

export function augmentParametersSchema(
  shape: ZodRawShape,
  config: ToolCallConfig
): ZodObject<ZodRawShape> {
  const augmentedShape: ZodRawShape = { ...shape };

  if (config.allowAgentSetDuration) {
    augmentedShape.timeout = z
      .number()
      .nonnegative()
      .max(config.maxDuration ?? DEFAULT_MAX_DURATION_MS)
      .optional()
      .describe("Optional timeout in milliseconds");
  }

  if (config.allowBackground) {
    augmentedShape.background = z
      .boolean()
      .optional()
      .describe(
        "Set to true to run this tool in the background. Returns immediately with a task ID."
      );
  }

  return z.object(augmentedShape);
}

function linkAbortSignal(source: AbortSignal | undefined, target: AbortController): void {
  if (!source || source === target.signal) {
    return;
  }

  const triggerAbort = () => {
    try {
      target.abort();
    } catch {
      // Ignore repeated abort calls.
    }
  };

  if (source.aborted) {
    triggerAbort();
    return;
  }

  source.addEventListener("abort", triggerAbort, { once: true });
}

function resolveToolCallId(opts?: ToolExecuteOptions): string {
  const candidate = opts?.toolContext?.callId;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate;
  }
  return `tool_${Date.now()}`;
}

function buildExecutionOptions(
  opts: ToolExecuteOptions | undefined,
  abortController: AbortController
): ToolExecuteOptions {
  const executionOpts: ToolExecuteOptions = {
    ...(opts ?? {}),
    abortController,
  };

  if (opts?.toolContext) {
    executionOpts.toolContext = {
      ...opts.toolContext,
      abortSignal: abortController.signal,
    };
  }

  return executionOpts;
}

function deriveAbortController(
  opts: ToolExecuteOptions | undefined,
  extraSignal?: AbortSignal
): AbortController {
  const abortController = opts?.abortController ?? new AbortController();
  linkAbortSignal(opts?.toolContext?.abortSignal, abortController);
  linkAbortSignal(extraSignal, abortController);
  return abortController;
}

export function createWrappedExecute({
  toolName,
  originalExecute,
  config,
  startBackground,
  beforeFailureHooks = [],
}: WrappedExecuteFactoryOptions) {
  const { maxDuration, allowAgentSetDuration, allowBackground } = config;

  return async (
    args: Record<string, unknown>,
    opts?: ToolExecuteOptions
  ): Promise<unknown> => {
    const timeout = typeof args.timeout === "number" ? args.timeout : undefined;
    const background = typeof args.background === "boolean" ? args.background : undefined;
    const { timeout: _timeout, background: _background, ...toolArgs } = args;
    void _timeout;
    void _background;

    const maxAllowedDuration = maxDuration ?? DEFAULT_MAX_DURATION_MS;
    const effectiveTimeout =
      allowAgentSetDuration && timeout !== undefined
        ? Math.min(timeout, maxAllowedDuration)
        : maxAllowedDuration;

    const toolCallId = resolveToolCallId(opts);

    if (allowBackground && background && startBackground) {
      const executionFactory = (
        backgroundSignal?: AbortSignal,
        streamLogs?: WrappedExecuteOptions["streamLogs"]
      ) => {
        const abortController = deriveAbortController(opts, backgroundSignal);
        const wrappedOptions: WrappedExecuteOptions = {
          ...buildExecutionOptions(opts, abortController),
          streamLogs,
          log: streamLogs,
        };
        return originalExecute(toolArgs, wrappedOptions);
      };

      return startBackground({
        toolCallId,
        toolName,
        toolArgs,
        executionFactory,
        timeoutMs: effectiveTimeout,
      });
    }

    const executionFactory = (
      backgroundSignal?: AbortSignal,
      streamLogs?: WrappedExecuteOptions["streamLogs"]
    ) => {
      const abortController = deriveAbortController(opts, backgroundSignal);
      const wrappedOptions: WrappedExecuteOptions = {
        ...buildExecutionOptions(opts, abortController),
        streamLogs,
        log: streamLogs,
      };
      return originalExecute(toolArgs, wrappedOptions);
    };
    const foregroundAbortController = deriveAbortController(opts);
    const foregroundOptions: WrappedExecuteOptions = {
      ...buildExecutionOptions(opts, foregroundAbortController),
    };
    const executionPromise = Promise.resolve(originalExecute(toolArgs, foregroundOptions));

    try {
      return await executeWithTimeout(
        () => executionPromise,
        effectiveTimeout,
        foregroundAbortController.signal
      );
    } catch (error) {
      if (isToolTimeoutError(error)) {
        foregroundAbortController.abort();
      }
      for (const hook of beforeFailureHooks) {
        const hookResult = await hook({
          error,
          options: opts,
          toolCallId,
          toolName,
          toolArgs,
          config,
          effectiveTimeout,
          maxAllowedDuration,
          executionFactory,
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
