import { type StreamingResponse } from "agents";
import { type Sandbox, type PtyHandle } from "@daytonaio/sdk";
import { DEFAULT_TERMINAL_ID, type PtyCloseInput, type PtyOpenInput, type PtyResizeInput, type PtyWriteInput } from "./types";

type PtySessionState = { handle: PtyHandle; output: string; closed: boolean };

const SANDBOX_HOME = "/home/daytona";
const ptySessions = new Map<string, PtySessionState>();
const shellConfigApplied = new Set<string>();
const textDecoder = new TextDecoder();

export class SandboxPtyService {
  constructor(private sandbox: Sandbox) {}

  async openPtyTerminal(input: PtyOpenInput): Promise<{ terminalId: string }> {
    const terminalId = input.terminalId ?? DEFAULT_TERMINAL_ID;
    await getOrCreatePtySession(this.sandbox, { ...input, terminalId });
    return { terminalId };
  }

  async streamPtyTerminal(
    stream: StreamingResponse,
    input: PtyCloseInput,
  ): Promise<void> {
    const terminalId = input.terminalId ?? DEFAULT_TERMINAL_ID;
    const state = await getOrCreatePtySession(this.sandbox, { terminalId });

    let offset = 0;
    while (!stream.isClosed) {
      const nextChunk = state.output.slice(offset);
      if (nextChunk.length > 0) {
        stream.send(nextChunk);
        offset = state.output.length;
      }

      const sessionInfo = await this.sandbox.process.getPtySessionInfo(terminalId).catch(() => null);
      const closed = sessionInfo !== null && !sessionInfo.active;
      if (state.closed || closed) {
        const remaining = state.output.slice(offset);
        if (remaining.length > 0) {
          stream.send(remaining);
        }
        stream.end({
          terminalId,
          closed: true as const,
          closeReason: "session closed",
        });
        return;
      }

      await delay(75);
    }
  }

  async listPtyTerminalSessions() {
    const sessions = await this.sandbox.process.listPtySessions();
    return { sessions };
  }

  async writePtyTerminal(input: PtyWriteInput) {
    const state = await getOrCreatePtySession(this.sandbox, input);

    await state.handle.sendInput(input.data);

    const byteLength = new TextEncoder().encode(input.data).byteLength;
    return { bytes: byteLength };
  }

  async resizePtyTerminal(input: PtyResizeInput) {
    await getOrCreatePtySession(this.sandbox, {
      terminalId: input.terminalId,
      cols: input.cols,
      rows: input.rows,
    });
    await this.sandbox.process.resizePtySession(input.terminalId, input.cols, input.rows);
    return { terminalId: input.terminalId };
  }

  async closePtyTerminal(input: PtyCloseInput) {
    const key = getPtySessionKey(this.sandbox.id, input.terminalId);
    const state = ptySessions.get(key);
    if (state) {
      state.closed = true;
    }
    await this.sandbox.process.killPtySession(input.terminalId).catch(() => undefined);
    deletePtySession(this.sandbox.id, input.terminalId);
    return { terminalId: input.terminalId, closed: true as const };
  }
}

function getPtySessionKey(sandboxId: string, terminalId: string) {
  return `${sandboxId}:${terminalId}`;
}

const ZSHENV_CONTENT =
  "export ZCOMPDUMP=/tmp/.zcompdump\n" +
  "autoload -Uz compinit && compinit -D\n";
const ZSHRC_CONTENT = "PROMPT='%n@workspace:%~$ '\n";

async function ensureShellConfig(sandbox: Sandbox) {
  if (shellConfigApplied.has(sandbox.id)) return;
  try {
    const home = (await sandbox.getUserHomeDir()) ?? SANDBOX_HOME;
    const zshenvPath = `${home}/.zshenv`;
    const zshrcPath = `${home}/.zshrc`;
    const [existingZshenv, existingZshrc] = await Promise.all([
      sandbox.fs.downloadFile(zshenvPath).then((b) => b.toString("utf8")).catch(() => null),
      sandbox.fs.downloadFile(zshrcPath).then((b) => b.toString("utf8")).catch(() => null),
    ]);
    const uploads: Promise<unknown>[] = [];
    if (existingZshenv !== ZSHENV_CONTENT) uploads.push(sandbox.fs.uploadFile(Buffer.from(ZSHENV_CONTENT, "utf8"), zshenvPath));
    if (existingZshrc !== ZSHRC_CONTENT) uploads.push(sandbox.fs.uploadFile(Buffer.from(ZSHRC_CONTENT, "utf8"), zshrcPath));
    if (uploads.length > 0) await Promise.all(uploads);
    shellConfigApplied.add(sandbox.id);
  } catch {
    // Non-fatal: PTY will still work, may show zsh newuser prompt
  }
}

async function getOrCreatePtySession(sandbox: Sandbox, input: PtyOpenInput) {
  const key = getPtySessionKey(sandbox.id, input.terminalId);
  const existing = ptySessions.get(key);
  if (existing) return existing;

  await ensureShellConfig(sandbox);

  const onData = (raw: Uint8Array | ArrayBuffer) => {
    appendPtyOutput(
      key,
      raw instanceof Uint8Array ? textDecoder.decode(raw) : textDecoder.decode(new Uint8Array(raw)),
    );
  };

  const createOptions = {
    id: input.terminalId,
    cwd: input.cwd,
    envs: input.envs,
    cols: input.cols,
    rows: input.rows,
    onData,
  };
  const handle = await sandbox.process
    .connectPty(input.terminalId, { onData })
    .catch(() => sandbox.process.createPty(createOptions));
  await handle.waitForConnection().catch(() => undefined);
  const state: PtySessionState = { handle, output: "", closed: false };
  ptySessions.set(key, state);
  return state;
}

function appendPtyOutput(key: string, chunk: string) {
  const state = ptySessions.get(key);
  if (!state || !chunk) return;
  state.output += chunk;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deletePtySession(sandboxId: string, terminalId: string) {
  const key = getPtySessionKey(sandboxId, terminalId);
  const state = ptySessions.get(key);
  if (!state) return;
  void state.handle.disconnect().catch(() => undefined);
  ptySessions.delete(key);
}
