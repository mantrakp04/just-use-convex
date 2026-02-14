export class ToolTimeoutError extends Error {
  timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Tool execution timed out after ${timeoutMs}ms`);
    this.name = "ToolTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isToolTimeoutError(error: unknown): error is ToolTimeoutError {
  return error instanceof ToolTimeoutError;
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  if (error instanceof Error) {
    return error.name === "AbortError";
  }
  return false;
}

export async function executeWithTimeout<R>(
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
        reject(new ToolTimeoutError(timeoutMs));
      }
    }, timeoutMs);

    Promise.resolve()
      .then(() => fn())
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
