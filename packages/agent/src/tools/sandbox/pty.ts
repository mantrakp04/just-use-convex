import {
  type Sandbox,
  type PtyHandle,
  type PtyCreateOptions,
} from "@daytonaio/sdk";
import type {
  ProcessApi,
  PtyResizeRequest,
  SessionSendInputRequest,
} from "@daytonaio/toolbox-api-client";
import { DEFAULT_TERMINAL_ID } from "./types";

type PtySessionState = { handle: PtyHandle; output: string };
type PtyOpenInput = { terminalId: string } & Partial<Omit<PtyCreateOptions, "id">>;
type PtyWriteInput = { terminalId: string } & SessionSendInputRequest;
type PtyReadInput = {
  terminalId: Parameters<ProcessApi["getPtySession"]>[0];
  offset?: number;
};
type PtyResizeInput = {
  terminalId: Parameters<ProcessApi["resizePtySession"]>[0];
} & PtyResizeRequest;
type PtyCloseInput = {
  terminalId: Parameters<ProcessApi["deletePtySession"]>[0];
};

const ptySessions = new Map<string, PtySessionState>();
const textDecoder = new TextDecoder();

export class SandboxPtyService {
  constructor(private sandbox: Sandbox) {}

  async openPtyTerminal(input: PtyOpenInput) {
    const terminalId = input.terminalId ?? DEFAULT_TERMINAL_ID;
    await getOrCreatePtySession(this.sandbox, { ...input, terminalId });
    return { terminalId };
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

  async readPtyTerminal(input: PtyReadInput) {
    const state = await getOrCreatePtySession(this.sandbox, {
      terminalId: input.terminalId,
    });
    const offset = Math.max(0, Number(input.offset ?? 0));
    const data = state.output.slice(offset);
    const sessionInfo = await this.sandbox.process
      .getPtySessionInfo(input.terminalId)
      .catch(() => null);
    const closed = sessionInfo !== null && !sessionInfo.active;
    return {
      data,
      offset: state.output.length,
      ...(closed && { closed: true as const, closeReason: "session closed" }),
    };
  }

  async resizePtyTerminal(input: PtyResizeInput) {
    await this.sandbox.process.resizePtySession(input.terminalId, input.cols, input.rows);
    await getOrCreatePtySession(this.sandbox, { terminalId: input.terminalId });
    return { terminalId: input.terminalId };
  }

  async closePtyTerminal(input: PtyCloseInput) {
    await this.sandbox.process.killPtySession(input.terminalId).catch(() => undefined);
    deletePtySession(this.sandbox.id, input.terminalId);
    return { terminalId: input.terminalId, closed: true as const };
  }
}

function getPtySessionKey(sandboxId: string, terminalId: string) {
  return `${sandboxId}:${terminalId}`;
}

async function getOrCreatePtySession(sandbox: Sandbox, input: PtyOpenInput) {
  const key = getPtySessionKey(sandbox.id, input.terminalId);
  const existing = ptySessions.get(key);
  if (existing) {
    return existing;
  }

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
  const state: PtySessionState = { handle, output: "" };
  ptySessions.set(key, state);
  return state;
}

function appendPtyOutput(key: string, chunk: string) {
  const state = ptySessions.get(key);
  if (!state || !chunk) return;
  state.output += chunk;
}

function deletePtySession(sandboxId: string, terminalId: string) {
  const key = getPtySessionKey(sandboxId, terminalId);
  const state = ptySessions.get(key);
  if (!state) return;
  void state.handle.disconnect().catch(() => undefined);
  ptySessions.delete(key);
}
