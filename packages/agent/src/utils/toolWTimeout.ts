import {
  createTool,
  type BaseTool,
  type ToolExecuteOptions,
} from "@voltagent/core";
import { z, type ZodObject, type ZodRawShape } from "zod";
import {
  type BackgroundTaskLogType,
  type BackgroundTaskStore,
  runInBackground,
} from "./toolWBackground";

const DEFAULT_MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes

/** Configuration for wrapped tool timeout and background behavior */
export type ToolCallConfig = {
  maxDuration?: number;
  allowAgentSetDuration?: boolean;
  allowBackground?: boolean;
};

/** Extended execute options passed to wrapped tool handlers */
export type WrappedExecuteOptions = ToolExecuteOptions & {
  timeout?: number;
  log?: (entry: { type: BackgroundTaskLogType; message: string }) => void;
};

/** Options for createWrappedTool */
export type WrappedToolOptions = Omit<
  Parameters<typeof createTool>[0],
  "execute" | "parameters"
> & {
  parameters: ZodObject<ZodRawShape>;
  toolCallConfig?: ToolCallConfig;
  store: BackgroundTaskStore;
  execute?: (
    args: Record<string, unknown>,
    options?: WrappedExecuteOptions
  ) => unknown | Promise<unknown>;
};

async function executeWithTimeout<R>(
  fn: () => R | Promise<R> | undefined,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<R | undefined> {
  if (abortSignal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  return new Promise<R | undefined>((resolve, reject) => {
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      abortSignal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      if (!settled) {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
      }
    };

    abortSignal?.addEventListener("abort", onAbort);

    timeoutId = setTimeout(() => {
      if (!settled) {
        cleanup();
        reject(new Error(`Tool execution timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    Promise.resolve(fn())
      .then((result) => {
        if (!settled) {
          cleanup();
          resolve(result);
        }
      })
      .catch((error) => {
        if (!settled) {
          cleanup();
          reject(error);
        }
      });
  });
}

function augmentParametersSchema(
  shape: ZodRawShape,
  config: ToolCallConfig
): ZodObject<ZodRawShape> {
  const augmentedShape: ZodRawShape = { ...shape };

  if (config.allowAgentSetDuration) {
    augmentedShape.timeout = z
      .number()
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
      // Ignore errors from repeated abort calls.
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
  } else if (executionOpts.toolContext) {
    executionOpts.toolContext = {
      ...executionOpts.toolContext,
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

function createWrappedExecute(
  toolName: string,
  originalExecute: (args: Record<string, unknown>, opts?: ToolExecuteOptions) => unknown | Promise<unknown>,
  config: ToolCallConfig,
  store: BackgroundTaskStore
) {
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

    if (allowBackground && background) {
      const toolCallId = resolveToolCallId(opts);
      const executionFactory = (backgroundSignal?: AbortSignal) => {
        const abortController = deriveAbortController(opts, backgroundSignal);
        return originalExecute(toolArgs, buildExecutionOptions(opts, abortController));
      };

      return runInBackground({
        store,
        toolName,
        toolArgs,
        executionFactory,
        timeoutMs: effectiveTimeout,
        toolCallId,
      });
    }

    const executionPromise = originalExecute(toolArgs, opts);
    const abortSignal = opts?.toolContext?.abortSignal ?? opts?.abortController?.signal;
    const toolCallId = resolveToolCallId(opts);

    try {
      return await executeWithTimeout(
        () => executionPromise,
        effectiveTimeout,
        abortSignal
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("timed out")) {
        return runInBackground({
          store,
          toolName,
          toolArgs,
          executionFactory: () => executionPromise,
          timeoutMs: maxAllowedDuration,
          initialLog: `Foreground execution timed out after ${effectiveTimeout}ms, converted to background task`,
          toolCallId,
        });
      }
      throw error;
    }
  };
}

export function createWrappedTool(options: WrappedToolOptions): BaseTool {
  const { name, description, toolCallConfig, parameters, store, execute } = options;

  return createTool({
    name,
    description,
    parameters: augmentParametersSchema(parameters.shape, toolCallConfig ?? {}),
    execute: createWrappedExecute(name, execute ?? (() => undefined), toolCallConfig ?? {}, store),
  });
}

export function patchToolWithBackgroundSupport(
  tool: BaseTool,
  store: BackgroundTaskStore,
  config: ToolCallConfig = {}
): void {
  const originalExecute = tool.execute;
  if (!originalExecute) return;

  Object.defineProperty(tool, "execute", {
    value: createWrappedExecute(tool.name, originalExecute, config, store),
    writable: true,
    configurable: true,
  });

  const originalParams = tool.parameters;
  if (originalParams && typeof originalParams === "object" && "shape" in originalParams) {
    Object.defineProperty(tool, "parameters", {
      value: augmentParametersSchema(
        (originalParams as ZodObject<ZodRawShape>).shape,
        config
      ),
      writable: true,
      configurable: true,
    });
  }
}
