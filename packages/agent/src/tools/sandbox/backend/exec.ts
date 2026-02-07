import { escapeShellArg } from "../shared";
import {
  TERMINAL_IDLE_TTL_MS,
  getTerminalCache,
  type SandboxInstance,
  type TerminalSessionState,
} from "./daytona";

type ExecLogEntry = { type: "stdout" | "stderr" | "info" | "error"; message: string };

type ExecOptions = {
  timeout?: number;
  cwd?: string;
  terminalId?: string;
  abortSignal?: AbortSignal;
  streamLogs?: (entry: ExecLogEntry) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getOrCreateTerminalState(sandboxName: string, terminalId: string): TerminalSessionState {
  const cache = getTerminalCache(sandboxName);
  const existing = cache.get(terminalId);
  if (existing) {
    return existing;
  }

  const created: TerminalSessionState = {
    lastUsedAt: Date.now(),
    activeCommands: 0,
    queue: Promise.resolve(),
  };
  cache.set(terminalId, created);
  return created;
}

function runQueuedOnTerminal<T>(
  terminalState: TerminalSessionState,
  operation: () => Promise<T>
): Promise<T> {
  const wrapped = async () => {
    terminalState.activeCommands += 1;
    try {
      return await operation();
    } finally {
      terminalState.activeCommands = Math.max(0, terminalState.activeCommands - 1);
      terminalState.lastUsedAt = Date.now();
    }
  };

  const queuedRun = terminalState.queue.then(wrapped, wrapped);
  terminalState.queue = queuedRun.then(() => undefined, () => undefined);
  return queuedRun;
}

async function cleanupIdleTerminals(
  sandbox: SandboxInstance,
  sandboxName: string,
  keepTerminalId?: string
): Promise<void> {
  const cache = getTerminalCache(sandboxName);
  const now = Date.now();

  for (const [terminalId, state] of cache) {
    if (keepTerminalId && terminalId === keepTerminalId) {
      continue;
    }
    if (state.activeCommands > 0) {
      continue;
    }
    if (now - state.lastUsedAt < TERMINAL_IDLE_TTL_MS) {
      continue;
    }

    cache.delete(terminalId);
    await sandbox.process.killPtySession(terminalId).catch(() => {});
  }
}

async function connectOrCreateTerminal(
  sandbox: SandboxInstance,
  terminalId: string,
  cwd: string,
  onData: (data: Uint8Array) => void | Promise<void>
) {
  try {
    return await sandbox.process.connectPty(terminalId, { onData });
  } catch {
    try {
      return await sandbox.process.createPty({
        id: terminalId,
        cwd,
        cols: 120,
        rows: 30,
        onData,
      });
    } catch (createError) {
      try {
        return await sandbox.process.connectPty(terminalId, { onData });
      } catch {
        throw createError;
      }
    }
  }
}

async function runPtyCommand(params: {
  sandbox: SandboxInstance;
  terminalId: string;
  cwd: string;
  command: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  streamLogs?: (entry: ExecLogEntry) => void;
  keepTerminalAlive: boolean;
}): Promise<{
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const {
    sandbox,
    terminalId,
    cwd,
    command,
    timeoutMs,
    abortSignal,
    streamLogs,
    keepTerminalAlive,
  } = params;
  const decoder = new TextDecoder();
  const marker = `__exec_exit_code_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const markerRegex = new RegExp(`${escapeRegex(marker)}:(-?\\d+)`);
  const escapedCwd = escapeShellArg(cwd);
  const commandInput = [
    `cd ${escapedCwd}`,
    command,
    "__sandbox_exec_exit_code=$?",
    `printf '\\n${marker}:%s\\n' "$__sandbox_exec_exit_code"`,
  ].join("\n") + "\n";

  let output = "";
  let markerIndex = -1;
  let exitCode = 1;
  const startedAt = Date.now();
  const ptyHandle = await connectOrCreateTerminal(
    sandbox,
    terminalId,
    cwd,
    (data) => {
      const chunk = decoder.decode(data, { stream: true });
      if (!chunk) {
        return;
      }

      output += chunk.replace(/\r/g, "");
      streamLogs?.({ type: "stdout", message: chunk });

      if (markerIndex !== -1) {
        return;
      }

      const markerMatch = output.match(markerRegex);
      if (!markerMatch) {
        return;
      }

      markerIndex = output.indexOf(markerMatch[0]);
      const parsed = Number.parseInt(markerMatch[1] ?? "", 10);
      if (Number.isFinite(parsed)) {
        exitCode = parsed;
      }
    }
  );

  try {
    await ptyHandle.waitForConnection();
    await ptyHandle.sendInput(commandInput);

    while (markerIndex === -1) {
      if (abortSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Command timed out after ${timeoutMs}ms`);
      }
      await sleep(100);
    }

    output += decoder.decode();
    const stdout = output.slice(0, markerIndex);
    return {
      success: exitCode === 0,
      stdout,
      stderr: "",
      exitCode,
    };
  } finally {
    await ptyHandle.disconnect().catch(() => {});
    if (!keepTerminalAlive) {
      await sandbox.process.killPtySession(terminalId).catch(() => {});
    }
  }
}

export async function runSandboxCommand(
  sandbox: SandboxInstance,
  sandboxName: string,
  command: string,
  defaultRootDir: string,
  resolvePath: (path: string, rootDir: string) => string,
  options?: ExecOptions
): Promise<{
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  terminalId?: string;
}> {
  const providedCwd = typeof options?.cwd === "string" ? options.cwd.trim() : "";
  const providedTerminalId = typeof options?.terminalId === "string"
    ? options.terminalId.trim()
    : "";
  const cwd = providedCwd ? resolvePath(providedCwd, defaultRootDir) : defaultRootDir;
  const terminalId = providedTerminalId || `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const keepTerminalAlive = Boolean(providedTerminalId);
  const timeoutMs = options?.timeout ? Math.max(1, Math.ceil(options.timeout)) : undefined;
  await cleanupIdleTerminals(sandbox, sandboxName, keepTerminalAlive ? terminalId : undefined);

  if (!keepTerminalAlive) {
    return runPtyCommand({
      sandbox,
      terminalId,
      cwd,
      command,
      timeoutMs,
      abortSignal: options?.abortSignal,
      streamLogs: options?.streamLogs,
      keepTerminalAlive: false,
    });
  }

  const cache = getTerminalCache(sandboxName);
  const terminalState = getOrCreateTerminalState(sandboxName, terminalId);
  terminalState.lastUsedAt = Date.now();

  try {
    const result = await runQueuedOnTerminal(terminalState, () => runPtyCommand({
      sandbox,
      terminalId,
      cwd,
      command,
      timeoutMs,
      abortSignal: options?.abortSignal,
      streamLogs: options?.streamLogs,
      keepTerminalAlive: true,
    }));
    return {
      ...result,
      terminalId,
    };
  } catch (error) {
    cache.delete(terminalId);
    await sandbox.process.killPtySession(terminalId).catch(() => {});
    throw error;
  }
}
