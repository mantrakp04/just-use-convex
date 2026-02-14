import { type Sandbox, type PtyHandle } from "@daytonaio/sdk";
import {
  DEFAULT_TERMINAL_ID,
  type PtySessionCreateInput,
  type OpenPtyTerminalResult,
  type PtySessionInfo,
  type XtermCloseInput,
  type ClosePtyTerminalResult,
  type XtermReadInput,
  type ReadPtyTerminalResult,
  type XtermResizeInput,
  type ResizePtyTerminalResult,
  type XtermWriteInput,
  type WritePtyTerminalResult,
  type ListPtyTerminalSessionsResult,
} from "./types";

type PtySessionState = {
  handle: PtyHandle;
  output: string;
};

const ptySessions = new Map<string, PtySessionState>();
const textDecoder = new TextDecoder();

export class SandboxPtyService {
  constructor(
    private readonly getSandbox: () => Promise<Sandbox>,
  ) {}

  async openPtyTerminal(input: PtySessionCreateInput): Promise<OpenPtyTerminalResult> {
    const terminalId = input.terminalId ?? DEFAULT_TERMINAL_ID;
    const sandbox = await this.getSandbox();
    await getOrCreatePtySession(sandbox, terminalId, {
      terminalId,
      cols: input.cols,
      rows: input.rows,
      cwd: input.cwd,
      envs: input.envs,
    });

    return { terminalId };
  }

  async listPtyTerminalSessions(): Promise<ListPtyTerminalSessionsResult> {
    const sandbox = await this.getSandbox();
    const sessions = await sandbox.process.listPtySessions();

    const normalizedSessions = sessions
      .map((session): PtySessionInfo | null => normalizePtySession(session))
      .filter((session): session is PtySessionInfo => session !== null);

    return {
      sessions: normalizedSessions,
    };
  }

  async writePtyTerminal(input: XtermWriteInput): Promise<WritePtyTerminalResult> {
    const sandbox = await this.getSandbox();
    const state = await getOrCreatePtySession(sandbox, input.terminalId, {
      terminalId: input.terminalId,
      cols: input.cols,
      rows: input.rows,
      cwd: input.cwd,
      envs: input.envs,
    });

    await state.handle.sendInput(input.data);

    return {
      bytes: input.data.length,
    };
  }

  async readPtyTerminal(input: XtermReadInput): Promise<ReadPtyTerminalResult> {
    const sandbox = await this.getSandbox();
    const state = await getOrCreatePtySession(sandbox, input.terminalId, {
      terminalId: input.terminalId,
    });

    const offset = Math.max(0, Number(input.offset));
    const data = state.output.slice(offset);
    const nextOffset = state.output.length;

    const sessionInfo = await sandbox.process
      .getPtySessionInfo(input.terminalId)
      .catch(() => null) as
      | { active?: unknown; exitCode?: unknown }
      | null;
    const isActive = typeof sessionInfo?.active === "boolean" ? sessionInfo.active : true;

    if (!isActive) {
      const exitCode = typeof sessionInfo?.exitCode === "number" ? sessionInfo.exitCode : undefined;
      return {
        data,
        offset: nextOffset,
        closed: true,
        closeReason: typeof exitCode === "number" ? `exitCode=${exitCode}` : "session closed",
      };
    }

    return {
      data,
      offset: nextOffset,
    };
  }

  async resizePtyTerminal(input: XtermResizeInput): Promise<ResizePtyTerminalResult> {
    const sandbox = await this.getSandbox();
    await sandbox.process.resizePtySession(input.terminalId, input.cols, input.rows);
    await getOrCreatePtySession(sandbox, input.terminalId, {
      terminalId: input.terminalId,
    });

    return {
      terminalId: input.terminalId,
    };
  }

  async closePtyTerminal(input: XtermCloseInput): Promise<ClosePtyTerminalResult> {
    const sandbox = await this.getSandbox();
    await sandbox.process.killPtySession(input.terminalId).catch(() => undefined);
    deletePtySession(sandbox.id, input.terminalId);

    return {
      terminalId: input.terminalId,
      closed: true,
    };
  }
}

function getPtySessionKey(sandboxId: string, terminalId: string) {
  return `${sandboxId}:${terminalId}`;
}

async function getOrCreatePtySession(
  sandbox: Sandbox,
  terminalId: string,
  input: Pick<PtySessionCreateInput, "terminalId"> & Partial<PtySessionCreateInput>
) {
  const key = getPtySessionKey(sandbox.id, terminalId);
  const existing = ptySessions.get(key);
  if (existing) {
    return existing;
  }

  const handle = await sandbox.process.connectPty(terminalId, {
    onData: (raw) => appendPtyOutput(key, decodePtyData(raw)),
    cols: input.cols,
    rows: input.rows,
    cwd: input.cwd,
    envs: input.envs,
  } as {
    onData: (data: unknown) => void;
    cols?: number;
    rows?: number;
    cwd?: string;
    envs?: Record<string, string>;
  }).catch(async () => {
    return sandbox.process.createPty({
      id: terminalId,
      onData: (raw) => appendPtyOutput(key, decodePtyData(raw)),
      cols: input.cols,
      rows: input.rows,
      cwd: input.cwd,
      envs: input.envs,
    } as {
      id: string;
      onData: (data: unknown) => void;
      cols?: number;
      rows?: number;
      cwd?: string;
      envs?: Record<string, string>;
    });
  });

  await handle.waitForConnection().catch(() => undefined);
  const state: PtySessionState = { handle, output: "" };
  ptySessions.set(key, state);
  return state;
}

function appendPtyOutput(key: string, chunk: string) {
  const state = ptySessions.get(key);
  if (!state || !chunk) {
    return;
  }
  state.output += chunk;
}

function decodePtyData(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (raw instanceof Uint8Array) {
    return textDecoder.decode(raw);
  }
  if (raw instanceof ArrayBuffer) {
    return textDecoder.decode(new Uint8Array(raw));
  }
  return "";
}

function deletePtySession(sandboxId: string, terminalId: string) {
  const key = getPtySessionKey(sandboxId, terminalId);
  const state = ptySessions.get(key);
  if (!state) {
    return;
  }

  void state.handle.disconnect().catch(() => undefined);
  ptySessions.delete(key);
}

function normalizePtySession(session: unknown): PtySessionInfo | null {
  if (!session || typeof session !== "object") {
    return null;
  }

  const nextSession = session as {
    id?: unknown;
    sessionId?: unknown;
    processId?: unknown;
    pid?: unknown;
    cwd?: unknown;
    active?: unknown;
  };

  const id = typeof nextSession.id === "string"
    ? nextSession.id
    : typeof nextSession.sessionId === "string"
      ? nextSession.sessionId
      : "";
  if (!id) {
    return null;
  }

  const pid = typeof nextSession.processId === "number"
    ? nextSession.processId
    : typeof nextSession.pid === "number"
      ? nextSession.pid
      : undefined;

  const isAlive = typeof nextSession.active === "boolean"
    ? nextSession.active
    : undefined;

  const cwd = typeof nextSession.cwd === "string" ? nextSession.cwd : undefined;

  return {
    id,
    pid,
    cwd,
    isAlive,
  };
}
