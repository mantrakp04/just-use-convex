import type {
  ExecInput,
  ExecOutput,
  PtySessionCreateInput,
  PtySessionState,
  SandboxSessionState,
  XtermCloseInput,
  XtermReadInput,
  XtermResizeInput,
  XtermWriteInput,
} from "./types";
import type { WrappedExecuteOptions } from "../utils/wrapper";

export async function getOrCreatePtySession(
  sandboxSession: SandboxSessionState,
  input: PtySessionCreateInput
): Promise<PtySessionState> {
  const terminalId = input.terminalId ?? `terminal_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const existing = sandboxSession.ptySessions.get(terminalId);
  if (existing) {
    if (input.cols !== undefined && input.rows !== undefined) {
      await existing.handle.resize(input.cols, input.rows).catch(() => undefined);
    }
    return existing;
  }

  const decoder = new TextDecoder();
  let pendingOutput = "";
  let ptySession: PtySessionState | null = null;
  const onData = (chunk: Uint8Array) => {
    const text = decoder.decode(chunk, { stream: true });
    if (ptySession) {
      ptySession.output += text;
      return;
    }
    pendingOutput += text;
  };

  const handle = await sandboxSession.sandbox.process.connectPty(terminalId, {
    onData,
  }).catch(async () => {
    return await sandboxSession.sandbox.process.createPty({
      id: terminalId,
      cols: input.cols,
      rows: input.rows,
      cwd: input.cwd,
      envs: input.envs,
      onData,
    });
  });

  await handle.waitForConnection();

  ptySession = {
    id: terminalId,
    handle,
    output: pendingOutput,
    closed: false,
    closeReason: null,
    exitCode: null,
    commandQueue: Promise.resolve(),
  };

  sandboxSession.ptySessions.set(terminalId, ptySession);
  void handle.wait().then((result) => {
    ptySession!.output += decoder.decode();
    ptySession!.closed = true;
    ptySession!.exitCode =
      typeof result.exitCode === "number" ? result.exitCode : null;
    ptySession!.closeReason = result.error ?? null;
  }).catch((error: unknown) => {
    ptySession!.output += decoder.decode();
    ptySession!.closed = true;
    ptySession!.closeReason =
      error instanceof Error ? error.message : String(error);
  });

  if (input.cols !== undefined && input.rows !== undefined) {
    await handle.resize(input.cols, input.rows).catch(() => undefined);
  }

  return ptySession;
}

export async function listPtySessions(sandboxSession: SandboxSessionState) {
  const remoteSessions = await sandboxSession.sandbox.process.listPtySessions();
  const localSessions = sandboxSession.ptySessions;

  return remoteSessions.map((session) => {
    const local = localSessions.get(session.id);
    return {
      id: session.id,
      active: session.active,
      cols: session.cols,
      rows: session.rows,
      cwd: session.cwd,
      createdAt: session.createdAt,
      localTracked: Boolean(local),
      localClosed: local?.closed ?? false,
      localCloseReason: local?.closeReason ?? null,
    };
  });
}

export async function readPtyOutput(
  sandboxSession: SandboxSessionState,
  input: XtermReadInput & Pick<XtermWriteInput, "cols" | "rows" | "cwd" | "envs">
) {
  const ptySession = await getOrCreatePtySession(sandboxSession, {
    terminalId: input.terminalId,
    cols: input.cols,
    rows: input.rows,
    cwd: input.cwd,
    envs: input.envs,
  });
  const startOffset = Math.max(0, Math.min(input.offset, ptySession.output.length));
  const data = ptySession.output.slice(startOffset);
  return {
    terminalId: ptySession.id,
    data,
    offset: ptySession.output.length,
    closed: ptySession.closed,
    closeReason: ptySession.closeReason,
    exitCode: ptySession.exitCode,
  };
}

export async function writeToPty(
  sandboxSession: SandboxSessionState,
  input: XtermWriteInput
) {
  const ptySession = await getOrCreatePtySession(sandboxSession, input);
  await ptySession.handle.sendInput(input.data);
  return {
    terminalId: ptySession.id,
    written: input.data.length,
  };
}

export async function resizePty(
  sandboxSession: SandboxSessionState,
  input: XtermResizeInput
) {
  const ptySession = await getOrCreatePtySession(sandboxSession, input);
  const resized = await ptySession.handle.resize(input.cols, input.rows);
  return {
    terminalId: ptySession.id,
    cols: resized.cols,
    rows: resized.rows,
  };
}

export async function closePtySession(
  sandboxSession: SandboxSessionState,
  input: XtermCloseInput
): Promise<{ terminalId: string; closed: boolean; reason?: string }> {
  const ptySession = sandboxSession.ptySessions.get(input.terminalId);
  if (!ptySession) {
    let killError: unknown | null = null;
    const closed = await sandboxSession.sandbox.process.killPtySession(input.terminalId).then(
      () => true
    ).catch((error: unknown) => {
      killError = error;
      return false;
    });
    return {
      terminalId: input.terminalId,
      closed,
      ...(closed
        ? {}
        : {
            reason: isTerminalNotFoundError(killError)
              ? "terminal not found"
              : "close operation failed",
          }),
    };
  }

  ptySession.closed = true;
  const [disconnectResult, killResult] = await Promise.allSettled([
    ptySession.handle.disconnect(),
    sandboxSession.sandbox.process.killPtySession(input.terminalId),
  ]);
  const failed =
    disconnectResult.status === "rejected" && killResult.status === "rejected";

  if (failed) {
    return {
      terminalId: input.terminalId,
      closed: false,
      reason: "close operation failed",
    };
  }

  sandboxSession.ptySessions.delete(input.terminalId);
  return {
    terminalId: input.terminalId,
    closed: true,
  };
}

export async function execOnPty(
  sandboxSession: SandboxSessionState,
  input: ExecInput,
  options?: Pick<WrappedExecuteOptions, "streamLogs" | "log"> & {
    abortSignal?: AbortSignal;
  }
): Promise<ExecOutput> {
  const ptySession = await getOrCreatePtySession(sandboxSession, {
    terminalId: input.terminalId,
    cols: input.cols,
    rows: input.rows,
    cwd: input.cwd,
    envs: input.envs,
  });

  return await nextQueueTask(ptySession, async () => {
    const marker = `__JUC_EXIT_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const commandStart = ptySession.output.length;
    let streamedLength = 0;
    const normalizedCommand = input.command.endsWith("\n")
      ? input.command
      : `${input.command}\n`;
    const markerCommand = `printf "${marker}:%s\\n" "$?"\n`;

    await ptySession.handle.sendInput(`${normalizedCommand}${markerCommand}`);

    const deadline = Date.now() + input.timeoutMs;
    while (Date.now() <= deadline) {
      if (options?.abortSignal?.aborted) {
        const output = ptySession.output.slice(commandStart);
        streamedLength = streamExecOutputDelta({
          options,
          marker,
          parsed: { result: null, dataUpToMarker: output },
          streamedLength,
          force: true,
        });
        return {
          terminalId: ptySession.id,
          command: input.command,
          output,
          exitCode: null,
          success: false,
          timedOut: false,
          error: "PTY command was aborted",
        };
      }

      const dataSinceCommand = ptySession.output.slice(commandStart);
      const parsed = extractExecResult(dataSinceCommand, marker);
      streamedLength = streamExecOutputDelta({
        options,
        marker,
        parsed,
        streamedLength,
      });
      if (parsed.result) {
        return {
          ...parsed.result,
          terminalId: ptySession.id,
          command: input.command,
        };
      }

      if (ptySession.closed) {
        streamedLength = streamExecOutputDelta({
          options,
          marker,
          parsed: { result: null, dataUpToMarker: parsed.dataUpToMarker },
          streamedLength,
          force: true,
        });
        return {
          terminalId: ptySession.id,
          command: input.command,
          output: parsed.dataUpToMarker,
          exitCode: ptySession.exitCode,
          success: ptySession.exitCode === 0,
          timedOut: false,
          ...(ptySession.closeReason ? { error: ptySession.closeReason } : {}),
        };
      }

      await delay(50);
    }

    const timedOutOutput = ptySession.output.slice(commandStart);
    streamedLength = streamExecOutputDelta({
      options,
      marker,
      parsed: { result: null, dataUpToMarker: timedOutOutput },
      streamedLength,
      force: true,
    });
    return {
      terminalId: ptySession.id,
      command: input.command,
      output: timedOutOutput,
      exitCode: null,
      success: false,
      timedOut: true,
      error: `PTY command timed out after ${input.timeoutMs}ms`,
    };
  });
}

export async function closeAllPtySessions(
  sandboxSession: SandboxSessionState
): Promise<void> {
  const closeRequests = Array.from(sandboxSession.ptySessions.keys()).map(
    async (terminalId) => {
      await closePtySession(sandboxSession, { terminalId });
    }
  );
  await Promise.all(closeRequests);
}

function extractExecResult(output: string, marker: string): {
  result: ExecOutput | null;
  dataUpToMarker: string;
} {
  const markerRegex = new RegExp(`${escapeRegExp(marker)}:(\\d+)\\r?\\n`);
  const match = markerRegex.exec(output);
  if (!match || match.index === undefined) {
    return {
      result: null,
      dataUpToMarker: output,
    };
  }

  const dataUpToMarker = output.slice(0, match.index);
  const exitCode = Number.parseInt(match[1] ?? "", 10);
  if (Number.isNaN(exitCode)) {
    return {
      result: null,
      dataUpToMarker: output,
    };
  }

  return {
    result: {
      terminalId: "",
      command: "",
      output: dataUpToMarker,
      exitCode,
      success: exitCode === 0,
      timedOut: false,
    },
    dataUpToMarker,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function streamExecOutputDelta({
  options,
  marker,
  parsed,
  streamedLength,
  force = false,
}: {
  options: Pick<WrappedExecuteOptions, "streamLogs" | "log"> | undefined;
  marker: string;
  parsed: ReturnType<typeof extractExecResult>;
  streamedLength: number;
  force?: boolean;
}): number {
  const streamLogs = options?.streamLogs ?? options?.log;
  if (!streamLogs) {
    return streamedLength;
  }

  const data = parsed.dataUpToMarker;
  const maxLength = force || parsed.result
    ? data.length
    : Math.max(0, data.length - getMarkerGuardLength(marker));
  const nextLength = Math.max(
    streamedLength,
    Math.min(maxLength, data.length)
  );
  if (nextLength <= streamedLength) {
    return streamedLength;
  }

  const delta = data.slice(streamedLength, nextLength);
  if (delta.length > 0) {
    streamLogs({ type: "stdout", message: delta });
  }
  return nextLength;
}

function getMarkerGuardLength(marker: string): number {
  // Keep a small trailing buffer to avoid streaming partial marker text.
  return marker.length + 16;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTerminalNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("no such") || message.includes("404");
}

function nextQueueTask<T>(
  session: PtySessionState,
  task: () => Promise<T>
): Promise<T> {
  const queuedTask = session.commandQueue.then(task, task);
  session.commandQueue = queuedTask.then(
    () => undefined,
    () => undefined
  );
  return queuedTask;
}
