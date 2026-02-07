import type { PtyHandle } from "@daytonaio/sdk";
import type { worker } from "../../../../alchemy.run";
import { getSandbox, type SandboxInstance } from "./daytona";

type TerminalChunk = {
  offset: number;
  data: string;
};

export type SshTerminalSession = {
  sandbox: SandboxInstance;
  ptyHandle: PtyHandle;
  chunks: TerminalChunk[];
  nextSeq: number;
  connected: boolean;
  closed: boolean;
  closeReason: string | null;
  lastUsedAt: number;
};

export type SshTerminalSessions = Map<string, SshTerminalSession>;

export type OpenSshTerminalParams = {
  env: typeof worker.Env;
  sandboxName: string;
  sessions: SshTerminalSessions;
  waitUntil: (promise: Promise<unknown>) => void;
  cols?: number;
  rows?: number;
};

export type ReadSshTerminalParams = {
  sessions: SshTerminalSessions;
  terminalId: string;
  offset?: number;
};

export type WriteSshTerminalParams = {
  sessions: SshTerminalSessions;
  terminalId: string;
  data: string;
};

export type ResizeSshTerminalParams = {
  sessions: SshTerminalSessions;
  terminalId: string;
  cols: number;
  rows: number;
};

export type CloseSshTerminalParams = {
  sessions: SshTerminalSessions;
  terminalId: string;
};

export function createSshTerminalSessions(): SshTerminalSessions {
  return new Map<string, SshTerminalSession>();
}

async function closeSshTerminalSession(
  sessions: SshTerminalSessions,
  terminalId: string,
  reason: string
) {
  const session = sessions.get(terminalId);
  if (!session) {
    return;
  }
  try {
    await session.ptyHandle.kill();
  } catch {
    // ignore close errors
  }
  await session.ptyHandle.disconnect().catch(() => {});
  await session.sandbox.process.killPtySession(terminalId).catch(() => {});
  markTerminalClosed(sessions, terminalId, reason);
  sessions.delete(terminalId);
}

function pushTerminalChunk(session: SshTerminalSession, data: string) {
  session.chunks.push({
    offset: session.nextSeq,
    data,
  });
  session.nextSeq += data.length;
  if (session.chunks.length > 2000) {
    session.chunks.splice(0, session.chunks.length - 2000);
  }
}

function markTerminalClosed(sessions: SshTerminalSessions, terminalId: string, reason?: string) {
  const session = sessions.get(terminalId);
  if (!session) {
    return;
  }

  session.closed = true;
  session.connected = false;
  session.closeReason = reason ?? session.closeReason;
  session.lastUsedAt = Date.now();
}

export async function openSshTerminal({
  env,
  sandboxName,
  sessions,
  waitUntil,
  cols = 120,
  rows = 30,
}: OpenSshTerminalParams) {
  if (!env.DAYTONA_API_KEY) {
    throw new Error("DAYTONA_API_KEY is not configured");
  }

  const sandbox = await getSandbox(env, sandboxName);
  await sandbox.start();
  await sandbox.waitUntilStarted();
  const workdir = await sandbox.getWorkDir();
  const terminalId = crypto.randomUUID();
  const decoder = new TextDecoder();

  const ptyHandle = await sandbox.process.createPty({
    id: terminalId,
    cwd: workdir ?? "/",
    cols,
    rows,
    onData: (data) => {
      const currentSession = sessions.get(terminalId);
      if (!currentSession) {
        return;
      }
      const text = decoder.decode(data, { stream: true });
      if (!text) {
        return;
      }
      pushTerminalChunk(currentSession, text);
    },
  });

  await ptyHandle.waitForConnection();

  sessions.set(terminalId, {
    sandbox,
    ptyHandle,
    chunks: [],
    nextSeq: 0,
    connected: true,
    closed: false,
    closeReason: null,
    lastUsedAt: Date.now(),
  });

  await ptyHandle.sendInput("if [ -n \"$ZSH_VERSION\" ]; then PROMPT=\"${USER}@workspace:%~$ \"; else PS1=\"\\u@workspace:\\w\\$ \"; fi\nclear\n");

  waitUntil(
    ptyHandle.wait().then((result) => {
      const reason = result.error ?? `Shell exited with code ${result.exitCode ?? "unknown"}`;
      markTerminalClosed(sessions, terminalId, reason);
    }).catch((error) => {
      markTerminalClosed(
        sessions,
        terminalId,
        error instanceof Error ? error.message : String(error)
      );
    })
  );

  return {
    terminalId
  };
}

export async function readSshTerminal({ sessions, terminalId, offset }: ReadSshTerminalParams) {
  const session = sessions.get(terminalId);
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
  const dataParts = session.chunks
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
    .filter(Boolean);
  const data = dataParts.join("");
  const nextOffset = session.nextSeq;

  session.lastUsedAt = Date.now();
  return {
    data,
    offset: nextOffset,
    connected: session.connected,
    closed: session.closed,
    closeReason: session.closeReason,
  };
}

export async function writeSshTerminal({ sessions, terminalId, data }: WriteSshTerminalParams) {
  const session = sessions.get(terminalId);
  if (!session || session.closed) {
    throw new Error("Terminal session is not connected");
  }
  session.lastUsedAt = Date.now();
  await session.ptyHandle.sendInput(data);
  return { ok: true };
}

export async function resizeSshTerminal({
  sessions,
  terminalId,
  cols,
  rows,
}: ResizeSshTerminalParams) {
  const session = sessions.get(terminalId);
  if (!session || session.closed) {
    return { ok: false };
  }
  const safeCols = Math.max(20, Math.min(500, Math.floor(cols)));
  const safeRows = Math.max(5, Math.min(200, Math.floor(rows)));
  session.lastUsedAt = Date.now();
  await session.ptyHandle.resize(safeCols, safeRows);
  return { ok: true };
}

export async function closeSshTerminal({ sessions, terminalId }: CloseSshTerminalParams) {
  await closeSshTerminalSession(sessions, terminalId, "Closed by client");
  return { ok: true };
}
