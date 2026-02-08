import type { Daytona, PtyHandle } from "@daytonaio/sdk";
import type { worker } from "../../../../alchemy.run";

export type SandboxEnv = typeof worker.Env;
export type SandboxInstance = Awaited<ReturnType<Daytona["get"]>>;
export type LspServer = Awaited<ReturnType<SandboxInstance["createLspServer"]>>;

export type CommandLogEntry = {
  type: "stdout" | "stderr" | "info" | "error";
  message: string;
};

export type CommandRunOptions = {
  timeoutMs?: number;
  cwd?: string;
  terminalId?: string;
  abortSignal?: AbortSignal;
  onLog?: (entry: CommandLogEntry) => void;
};

export type CommandRunResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  terminalId?: string;
};

export type LspSession = {
  server: LspServer;
  lastTouchedAt: number;
};

export type TerminalOutputChunk = {
  offset: number;
  data: string;
};

export type InteractivePtySession = {
  mode: "command" | "interactive";
  lastTouchedAt: number;
  activeCommandCount: number;
  queue: Promise<void>;
  sandbox?: SandboxInstance;
  ptyHandle?: PtyHandle;
  output?: TerminalOutputChunk[];
  nextOffset?: number;
  connected?: boolean;
  closed?: boolean;
  closeReason?: string | null;
};

export type SandboxPtySessions = {
  sessions: Map<string, InteractivePtySession>;
};

export type OpenTerminalParams = {
  waitUntil: (promise: Promise<unknown>) => void;
  cols?: number;
  rows?: number;
};

export type ReadTerminalParams = {
  terminalId: string;
  offset?: number;
};

export type WriteTerminalParams = {
  terminalId: string;
  data: string;
};

export type ResizeTerminalParams = {
  terminalId: string;
  cols: number;
  rows: number;
};

export type CloseTerminalParams = {
  terminalId: string;
};
