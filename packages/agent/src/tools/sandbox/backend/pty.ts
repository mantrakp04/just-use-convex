import {
  escapeRegexLiteral,
  escapeShellArg,
  normalizeModTime,
  resolveSandboxPath,
} from "./utils";
import {
  EXEC_SESSION_IDLE_MS,
  findInteractivePtySession,
  getSandboxPtySessions,
} from "./runtime";
import type { SandboxContext } from "./context";
import type {
  CommandRunOptions,
  CommandRunResult,
  InteractivePtySession,
  SandboxInstance,
} from "./types";
import type { OpenTerminalParams, ReadTerminalParams, WriteTerminalParams, ResizeTerminalParams, CloseTerminalParams } from "./types";

type LiveInteractivePtySession = InteractivePtySession & {
  mode: "interactive";
  sandbox: SandboxInstance;
  ptyHandle: NonNullable<InteractivePtySession["ptyHandle"]>;
  output: NonNullable<InteractivePtySession["output"]>;
  nextOffset: NonNullable<InteractivePtySession["nextOffset"]>;
  connected: NonNullable<InteractivePtySession["connected"]>;
  closed: NonNullable<InteractivePtySession["closed"]>;
  closeReason: InteractivePtySession["closeReason"];
};

export class SandboxPtyService {
  constructor(private readonly context?: SandboxContext) {}

  private requireContext(): SandboxContext {
    if (!this.context) {
      throw new Error("Sandbox PTY context is required for this operation");
    }

    return this.context;
  }

  private getOrCreateQueueSession(terminalId: string): InteractivePtySession {
    const context = this.requireContext();
    const sandboxPtySessions = getSandboxPtySessions(context.sandboxId);
    const existing = sandboxPtySessions.sessions.get(terminalId);

    if (existing) {
      return existing;
    }

    const created: InteractivePtySession = {
      mode: "command",
      lastTouchedAt: Date.now(),
      activeCommandCount: 0,
      queue: Promise.resolve(),
    };

    sandboxPtySessions.sessions.set(terminalId, created);
    return created;
  }

  private queueOnSession<T>(session: InteractivePtySession, operation: () => Promise<T>): Promise<T> {
    const run = async () => {
      session.activeCommandCount += 1;

      try {
        return await operation();
      } finally {
        session.activeCommandCount = Math.max(0, session.activeCommandCount - 1);
        session.lastTouchedAt = Date.now();
      }
    };

    const queued = session.queue.then(run, run);
    session.queue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private async cleanupIdleCommandSessions(sandbox: SandboxInstance, keepTerminalId?: string): Promise<void> {
    const context = this.requireContext();
    const now = Date.now();
    const sessions = getSandboxPtySessions(context.sandboxId).sessions;

    for (const [terminalId, session] of sessions) {
      if (session.mode !== "command") {
        continue;
      }

      if (terminalId === keepTerminalId) {
        continue;
      }

      if (session.activeCommandCount > 0) {
        continue;
      }

      if (now - session.lastTouchedAt < EXEC_SESSION_IDLE_MS) {
        continue;
      }

      sessions.delete(terminalId);
      await sandbox.process.killPtySession(terminalId);
    }
  }

  private async connectExecutionPty(params: {
    sandbox: SandboxInstance;
    terminalId: string;
    cwd: string;
    allowReuse: boolean;
    onData: (data: Uint8Array) => void;
  }) {
    const { sandbox, terminalId, cwd, allowReuse, onData } = params;

    if (allowReuse) {
      const context = this.requireContext();
      const session = getSandboxPtySessions(context.sandboxId).sessions.get(terminalId);
      const isKnownSession = session?.mode === "command";

      if (isKnownSession) {
        return sandbox.process.connectPty(terminalId, { onData });
      }
    }

    return sandbox.process.createPty({
      id: terminalId,
      cwd,
      cols: 120,
      rows: 30,
      onData,
    });
  }

  private async runOnPty(params: {
    sandbox: SandboxInstance;
    terminalId: string;
    cwd: string;
    command: string;
    timeoutMs?: number;
    abortSignal?: AbortSignal;
    onLog?: CommandRunOptions["onLog"];
    keepAlive: boolean;
    allowReuse: boolean;
  }): Promise<CommandRunResult> {
    const {
      sandbox,
      terminalId,
      cwd,
      command,
      timeoutMs,
      abortSignal,
      onLog,
      keepAlive,
      allowReuse,
    } = params;

    const decoder = new TextDecoder();
    const marker = `__sandbox_exec_marker_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const markerRegex = new RegExp(`${escapeRegexLiteral(marker)}:(-?\\d+)`);

    const commandInput = [
      `cd ${escapeShellArg(cwd)}`,
      command,
      "__sandbox_exec_exit_code=$?",
      `printf '\\n${marker}:%s\\n' \"$__sandbox_exec_exit_code\"`,
    ].join("\n") + "\n";

    let outputBuffer = "";
    let markerStartIndex = -1;
    let exitCode = 1;
    const startedAt = Date.now();

    const pty = await this.connectExecutionPty({
      sandbox,
      terminalId,
      cwd,
      allowReuse,
      onData: (chunkBytes) => {
        const chunk = decoder.decode(chunkBytes, { stream: true });
        if (!chunk) {
          return;
        }

        outputBuffer += chunk.replace(/\r/g, "");
        onLog?.({ type: "stdout", message: chunk });

        if (markerStartIndex !== -1) {
          return;
        }

        const markerMatch = outputBuffer.match(markerRegex);
        if (!markerMatch) {
          return;
        }

        markerStartIndex = outputBuffer.indexOf(markerMatch[0]);
        const parsedExitCode = Number.parseInt(markerMatch[1] ?? "", 10);
        if (Number.isFinite(parsedExitCode)) {
          exitCode = parsedExitCode;
        }
      },
    });

    try {
      await pty.waitForConnection();
      await pty.sendInput(commandInput);

      while (markerStartIndex === -1) {
        if (abortSignal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }

        if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) {
          throw new Error(`Command timed out after ${timeoutMs}ms`);
        }

        await sleep(100);
      }

      outputBuffer += decoder.decode();
      const stdout = outputBuffer.slice(0, markerStartIndex);

      return {
        success: exitCode === 0,
        stdout,
        stderr: "",
        exitCode,
      };
    } finally {
      await pty.disconnect();
      if (!keepAlive) {
        await sandbox.process.killPtySession(terminalId);
      }
    }
  }

  async run(command: string, options?: CommandRunOptions): Promise<CommandRunResult> {
    const context = this.requireContext();
    const sandbox = await context.getSandbox();
    const rootPath = await context.getRootPath();

    const requestedCwd = typeof options?.cwd === "string" ? options.cwd.trim() : "";
    const cwd = requestedCwd ? resolveSandboxPath(requestedCwd, rootPath) : rootPath;

    const requestedTerminalId = typeof options?.terminalId === "string"
      ? options.terminalId.trim()
      : "";

    const terminalId = requestedTerminalId || `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const keepAlive = Boolean(requestedTerminalId);

    await this.cleanupIdleCommandSessions(sandbox, keepAlive ? terminalId : undefined);

    const timeoutMs = options?.timeoutMs !== undefined
      ? Math.max(1, Math.ceil(options.timeoutMs))
      : undefined;

    if (!keepAlive) {
      return this.runOnPty({
        sandbox,
        terminalId,
        cwd,
        command,
        timeoutMs,
        abortSignal: options?.abortSignal,
        onLog: options?.onLog,
        keepAlive: false,
        allowReuse: false,
      });
    }

    const session = this.getOrCreateQueueSession(terminalId);
    session.lastTouchedAt = Date.now();

    try {
      const result = await this.queueOnSession(session, () => this.runOnPty({
        sandbox,
        terminalId,
        cwd,
        command,
        timeoutMs,
        abortSignal: options?.abortSignal,
        onLog: options?.onLog,
        keepAlive: true,
        allowReuse: true,
      }));

      return {
        ...result,
        terminalId,
      };
    } catch (error) {
      const sessions = getSandboxPtySessions(context.sandboxId).sessions;
      const existing = sessions.get(terminalId);
      if (existing?.mode === "command") {
        sessions.delete(terminalId);
      }
      await sandbox.process.killPtySession(terminalId);
      throw error;
    }
  }

  async open({ waitUntil, cols = 120, rows = 30 }: OpenTerminalParams) {
    const context = this.requireContext();
    const sessions = getSandboxPtySessions(context.sandboxId).sessions;
    const sandbox = await context.getSandbox();

    await sandbox.start();
    await sandbox.waitUntilStarted();

    const workdir = (await sandbox.getWorkDir()) ?? "/";
    const terminalId = crypto.randomUUID();
    const decoder = new TextDecoder();

    const ptyHandle = await sandbox.process.createPty({
      id: terminalId,
      cwd: workdir,
      cols,
      rows,
      onData: (chunk) => {
        const session = sessions.get(terminalId);
        if (!isLiveInteractiveSession(session)) {
          return;
        }

        const text = decoder.decode(chunk, { stream: true });
        if (!text) {
          return;
        }

        pushTerminalOutput(session, text);
      },
    });

    await ptyHandle.waitForConnection();

    sessions.set(terminalId, {
      mode: "interactive",
      activeCommandCount: 0,
      queue: Promise.resolve(),
      sandbox,
      ptyHandle,
      output: [],
      nextOffset: 0,
      connected: true,
      closed: false,
      closeReason: null,
      lastTouchedAt: Date.now(),
    });

    await ptyHandle.sendInput(
      "if [ -n \"$ZSH_VERSION\" ]; then PROMPT=\"${USER}@workspace:%~$ \"; else PS1=\"\\u@workspace:\\w\\$ \"; fi\nclear\n"
    );

    waitUntil(
      ptyHandle.wait().then((result) => {
        const reason = result.error ?? `Shell exited with code ${result.exitCode ?? "unknown"}`;
        markTerminalClosed(terminalId, reason);
      }).catch((error) => {
        markTerminalClosed(terminalId, error instanceof Error ? error.message : String(error));
      })
    );

    return { terminalId };
  }

  async read({ terminalId, offset }: ReadTerminalParams) {
    const found = findInteractivePtySession(terminalId);
    const session = found?.session && isLiveInteractiveSession(found.session)
      ? found.session
      : null;

    if (!session) {
      return {
        data: "",
        offset: offset ?? 0,
        connected: false,
        closed: true,
        closeReason: "Terminal session not found",
      };
    }

    const safeOffset = Math.max(0, offset ?? 0);
    const data = session.output
      .map((chunk) => {
        const chunkEnd = chunk.offset + chunk.data.length;
        if (chunkEnd <= safeOffset) {
          return "";
        }

        if (chunk.offset >= safeOffset) {
          return chunk.data;
        }

        return chunk.data.slice(safeOffset - chunk.offset);
      })
      .filter(Boolean)
      .join("");

    session.lastTouchedAt = Date.now();

    return {
      data,
      offset: session.nextOffset,
      connected: session.connected,
      closed: session.closed,
      closeReason: session.closeReason,
    };
  }

  async write({ terminalId, data }: WriteTerminalParams) {
    const found = findInteractivePtySession(terminalId);
    const session = found?.session && isLiveInteractiveSession(found.session)
      ? found.session
      : null;

    if (!session || session.closed) {
      throw new Error("Terminal session is not connected");
    }

    session.lastTouchedAt = Date.now();
    await session.ptyHandle.sendInput(data);

    return { ok: true };
  }

  async resize({ terminalId, cols, rows }: ResizeTerminalParams) {
    const found = findInteractivePtySession(terminalId);
    const session = found?.session && isLiveInteractiveSession(found.session)
      ? found.session
      : null;

    if (!session || session.closed) {
      return { ok: false };
    }

    const safeCols = Math.max(20, Math.min(500, Math.floor(cols)));
    const safeRows = Math.max(5, Math.min(200, Math.floor(rows)));

    session.lastTouchedAt = Date.now();
    await session.ptyHandle.resize(safeCols, safeRows);

    return { ok: true };
  }

  async close({ terminalId }: CloseTerminalParams) {
    await closeTerminalSession(terminalId, "Closed by client");
    return { ok: true };
  }

  async listFiles(path?: string) {
    const context = this.requireContext();
    const sandbox = await context.getSandbox();
    const workdir = (await sandbox.getWorkDir()) ?? "/";
    const targetPath = path?.trim() ? resolveSandboxPath(path, workdir) : workdir;
    const files = await sandbox.fs.listFiles(targetPath);

    return {
      path: targetPath,
      entries: files.map((file) => ({
        name: file.name,
        path: targetPath === "/"
          ? `/${file.name}`
          : `${targetPath.replace(/\/$/, "")}/${file.name}`,
        isDir: file.isDir,
        size: file.size ?? 0,
        modifiedAt: normalizeModTime(file.modTime),
      })),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markTerminalClosed(terminalId: string, reason?: string): void {
  const found = findInteractivePtySession(terminalId);
  if (!found || !isLiveInteractiveSession(found.session)) {
    return;
  }

  const session = found.session;
  session.closed = true;
  session.connected = false;
  session.closeReason = reason ?? session.closeReason;
  session.lastTouchedAt = Date.now();
}

function pushTerminalOutput(session: LiveInteractivePtySession, data: string): void {
  session.output.push({
    offset: session.nextOffset,
    data,
  });

  session.nextOffset += data.length;

  if (session.output.length > 2000) {
    session.output.splice(0, session.output.length - 2000);
  }
}

async function closeTerminalSession(terminalId: string, reason: string): Promise<void> {
  const found = findInteractivePtySession(terminalId);
  if (!found || !isLiveInteractiveSession(found.session)) {
    return;
  }

  const session = found.session;

  try {
    await session.ptyHandle.kill();
  } catch {
    // ignore kill errors during cleanup
  }

  try {
    await session.ptyHandle.disconnect();
  } catch {
    // ignore disconnect errors during cleanup
  }

  try {
    await session.sandbox.process.killPtySession(terminalId);
  } catch {
    // ignore kill-session errors during cleanup
  }

  markTerminalClosed(terminalId, reason);
  found.sessions.sessions.delete(terminalId);
}

function isLiveInteractiveSession(session: InteractivePtySession | undefined | null): session is LiveInteractivePtySession {
  return Boolean(
    session &&
    session.mode === "interactive" &&
    session.sandbox &&
    session.ptyHandle &&
    session.output &&
    typeof session.nextOffset === "number" &&
    typeof session.connected === "boolean" &&
    typeof session.closed === "boolean" &&
    (session.closeReason === null || typeof session.closeReason === "string")
  );
}
