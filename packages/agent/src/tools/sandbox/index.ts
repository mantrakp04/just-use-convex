import { AIChatAgent } from "@cloudflare/ai-chat";
import { Daytona, type Sandbox } from "@daytonaio/sdk";
import { callable } from "agents";
import { isFileUIPart, type UIMessage } from "ai";
import {
  createTool,
  createToolkit,
  type BaseTool,
  type Toolkit,
} from "@voltagent/core";
import { z } from "zod";
import { sanitizeFilename } from "@just-use-convex/agent/src/agent/messages";
import {
  createWrappedTool,
  type BackgroundTaskStoreApi,
  type WrappedExecuteOptions,
} from "../utils/wrapper";
import type { worker } from "@just-use-convex/agent/alchemy.run";
import {
  closeAllLspSessions,
  getLspCompletions,
} from "./lsp";
import {
  closeAllPtySessions,
  closePtySession,
  execOnPty,
  getOrCreatePtySession,
  listPtySessions,
  readPtyOutput,
  resizePty,
  writeToPty,
} from "./pty";
import {
  editParameters,
  exposeServiceParameters,
  execParameters,
  globParameters,
  grepParameters,
  lsParameters,
  lspCompletionsParameters,
  readParameters,
  writeParameters,
  xtermCloseParameters,
  type EditInput,
  type ExecInput,
  type ExecOutput,
  type ExposeServiceInput,
  type GlobInput,
  type GrepInput,
  type LsInput,
  type LspCompletionsInput,
  type PtySessionCreateInput,
  type ReadInput,
  type SandboxSessionState,
  type WriteInput,
  type XtermCloseInput,
  type XtermListInput,
  type XtermReadInput,
  type XtermResizeInput,
  type XtermWriteInput,
} from "./types";

type SandboxToolkitOptions = {
  store?: BackgroundTaskStoreApi;
};

const SANDBOX_TOOLKIT_INSTRUCTIONS = `You can operate directly on the chat sandbox.

- Paths are sandbox paths and can be relative to workdir. \`/workspace/*\` is accepted as an alias for \`workspace/*\`.
- PTY sessions are get-or-create by terminalId.
- LSP has a single active session per sandbox: reused for same language, recreated on language change.
- Use \`exec\` for command execution via PTY.
- Use \`expose_service\` to expose HTTP services on ports 3000-9999.
- Standard preview auth uses \`x-daytona-preview-token\`; signed preview auth is embedded in the URL.
- LSP lifecycle is managed automatically.`;

const DEFAULT_TOOL_MAX_DURATION_MS = 30 * 60 * 1000;
const DEFAULT_TOOL_CALL_CONFIG = {
  maxDuration: DEFAULT_TOOL_MAX_DURATION_MS,
  allowAgentSetDuration: true,
  allowBackground: true,
} as const;
const EXEC_PROMOTED_CONTINUATION_TIMEOUT_MS = DEFAULT_TOOL_MAX_DURATION_MS;

const INTERNAL_PTY_TERMINAL_ID = "__sandbox_internal__";
const INTERNAL_PTY_TIMEOUT_MS = 20_000;
const SANDBOX_UPLOADS_DIR = "workspace/uploads";
const SANDBOX_UPLOADS_TEMP_DIR = "workspace/.tmp/uploads";
const DAYTONA_PREVIEW_TOKEN_HEADER = "x-daytona-preview-token";

export class SandboxFilesystemBackend {
  private readonly daytona: Daytona;
  private sandboxSession: SandboxSessionState | null = null;

  constructor(
    env: typeof worker.Env,
    private readonly sandboxId: string
  ) {
    this.daytona = new Daytona({
      apiKey: env.DAYTONA_API_KEY,
      ...(env.DAYTONA_API_URL ? { apiUrl: env.DAYTONA_API_URL } : {}),
      ...(env.DAYTONA_TARGET ? { target: env.DAYTONA_TARGET } : {}),
    });
    this.createSandboxSession();
  }

  private async createSandboxSession(): Promise<SandboxSessionState> {
    const ensureSandboxStarted = async (sandbox: Sandbox) => {
      await sandbox.start().catch(() => undefined);
      await sandbox.waitUntilStarted().catch(() => undefined);
    };

    if (this.sandboxSession) {
      await ensureSandboxStarted(this.sandboxSession.sandbox);
      return this.sandboxSession;
    }

    const sandbox = await this.daytona.get(this.sandboxId);
    await ensureSandboxStarted(sandbox);

    const session: SandboxSessionState = {
      id: this.sandboxId,
      sandbox,
      lspSession: null,
      ptySessions: new Map(),
    };
    this.sandboxSession = session;
    return session;
  }

  private async ensureParentDirectories(
    sandbox: Sandbox,
    path: string
  ): Promise<void> {
    const normalizedPath = path.replace(/\/+$/, "");
    const parts = normalizedPath.split("/").filter(Boolean);
    if (parts.length <= 1) {
      return;
    }

    const parentParts = parts.slice(0, -1);
    const isAbsolutePath = normalizedPath.startsWith("/");
    let currentPath = isAbsolutePath ? "" : "";

    for (const part of parentParts) {
      currentPath = isAbsolutePath
        ? `${currentPath}/${part}`
        : currentPath.length > 0
          ? `${currentPath}/${part}`
          : part;
      await sandbox.fs.createFolder(currentPath, "755").catch(() => undefined);
    }
  }

  private ensureSandboxSession() {
    if (!this.sandboxSession) {
      throw new Error("Sandbox session not found");
    }
    return this.sandboxSession;
  }

  private async runInternalPtyCommand(command: string, timeoutMs = INTERNAL_PTY_TIMEOUT_MS) {
    const sandboxSession = this.ensureSandboxSession();
    return await execOnPty(sandboxSession, {
      command,
      terminalId: INTERNAL_PTY_TERMINAL_ID,
      timeoutMs,
      closeAfter: false,
    });
  }

  private async checkServiceConnectivity(port: number) {
    const command = [
      "python3 - <<'PY'",
      "import socket",
      `port = ${port}`,
      "sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)",
      "sock.settimeout(1.0)",
      "reachable = sock.connect_ex(('127.0.0.1', port)) == 0",
      "sock.close()",
      "print('reachable' if reachable else 'unreachable')",
      "PY",
    ].join("\n");

    const result = await this.runInternalPtyCommand(command, 5_000);
    if (!result.success || result.timedOut) {
      return {
        checked: true,
        reachable: false,
        warning: "Connectivity check failed while probing the sandbox port.",
      };
    }

    const normalizedOutput = result.output.trim().split(/\r?\n/).at(-1) ?? "";
    const reachable = normalizedOutput === "reachable";
    return {
      checked: true,
      reachable,
      ...(reachable
        ? {}
        : {
            warning: `No service detected on port ${port}. Preview URL may return 502/timeout.`,
          }),
    };
  }

  async listFiles(input: LsInput) {
    const resolvedPath = normalizeSandboxPath(input.path);
    const files = await this.ensureSandboxSession().sandbox.fs.listFiles(resolvedPath);
    if (!files) {
      throw new Error("Sandbox session not found");
    }
    return {
      path: resolvedPath,
      entries: files.map((file) => ({
        name: file.name,
        path: joinSandboxPath(resolvedPath, file.name),
        isDir: file.isDir,
        size: file.size,
        modifiedAt: parseModTime(file.modTime),
        permissions: file.permissions,
      })),
    };
  }

  async readFile(input: ReadInput) {
    const resolvedPath = normalizeSandboxPath(input.path);
    const contentBuffer = await this.ensureSandboxSession().sandbox.fs.downloadFile(resolvedPath);
    if (!contentBuffer) {
      throw new Error("Sandbox session not found");
    }
    const content = contentBuffer.toString("utf8");
    const start = input.offset ?? 0;
    const end = input.limit !== undefined ? start + input.limit : undefined;
    return {
      path: resolvedPath,
      content: content.slice(start, end),
      size: content.length,
      offset: start,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    };
  }

  async writeFile(input: WriteInput) {
    const resolvedPath = normalizeSandboxPath(input.path);
    await this.ensureParentDirectories(this.ensureSandboxSession().sandbox, resolvedPath);
    await this.ensureSandboxSession().sandbox.fs.uploadFile(
      Buffer.from(input.content),
      resolvedPath
    );
    return {
      path: resolvedPath,
      bytesWritten: Buffer.byteLength(input.content),
    };
  }

  async editFile(input: EditInput) {
    if (!input.oldText) {
      return {
        path: normalizeSandboxPath(input.path),
        edited: false,
        occurrences: 0,
        error: "oldText must not be empty",
      };
    }

    const resolvedPath = normalizeSandboxPath(input.path);
    const sandboxSession = this.ensureSandboxSession();
    const contentBuffer = await sandboxSession.sandbox.fs.downloadFile(resolvedPath);
    const content = contentBuffer.toString("utf8");
    const occurrences = countSubstringOccurrences(content, input.oldText);
    const appliedOccurrences = input.replaceAll ? occurrences : Math.min(occurrences, 1);
    if (appliedOccurrences > 0) {
      const updatedContent = input.replaceAll
        ? content.split(input.oldText).join(input.newText)
        : replaceFirstOccurrence(content, input.oldText, input.newText);
      await sandboxSession.sandbox.fs.uploadFile(
        Buffer.from(updatedContent, "utf8"),
        resolvedPath
      );
    }

    return {
      path: resolvedPath,
      edited: appliedOccurrences > 0,
      occurrences: appliedOccurrences,
    };
  }

  async globFiles(input: GlobInput) {
    const sandboxSession = this.ensureSandboxSession();
    const resolvedPath = normalizeSandboxPath(input.path);
    const result = await sandboxSession.sandbox.fs.searchFiles(
      resolvedPath,
      input.pattern
    ).catch((error: unknown) => {
      if (isSandboxPathNotFoundError(error)) {
        return null;
      }
      throw error;
    });
    const files = Array.isArray(result?.files) ? result?.files ?? [] : [];
    return {
      path: resolvedPath,
      pattern: input.pattern,
      files,
      count: files.length,
    };
  }

  async grepFiles(input: GrepInput) {
    const sandboxSession = this.ensureSandboxSession();
    const resolvedPath = normalizeSandboxPath(input.path);
    const matches = await sandboxSession.sandbox.fs.findFiles(
      resolvedPath,
      input.pattern
    );
    return {
      path: resolvedPath,
      pattern: input.pattern,
      matches,
      count: matches.length,
    };
  }

  async openPtySession(input: PtySessionCreateInput) {
    const sandboxSession = this.ensureSandboxSession();
    const ptySession = await getOrCreatePtySession(sandboxSession, input);
    return {
      terminalId: ptySession.id,
      created: true,
    };
  }

  async exec(input: ExecInput, options?: WrappedExecuteOptions) {
    const sandboxSession = this.ensureSandboxSession();
    const result = await execOnPty(sandboxSession, {
      ...input,
      timeoutMs: resolveExecTimeoutMs(input.timeoutMs, options?.timeout),
    }, {
      streamLogs: options?.streamLogs ?? options?.log,
      abortSignal: options?.toolContext?.abortSignal ?? options?.abortController?.signal,
    });
    if (input.closeAfter) {
      await closePtySession(sandboxSession, { terminalId: result.terminalId });
    }
    return result;
  }

  async exposeService(input: ExposeServiceInput) {
    const sandboxSession = this.ensureSandboxSession();
    const sandbox = sandboxSession.sandbox;
    const revokedSignedToken = input.revokeSignedToken?.trim();
    const shouldFetchStandard =
      input.previewType === "standard" || input.previewType === "both";
    const shouldFetchSigned =
      input.previewType === "signed" || input.previewType === "both";

    if (revokedSignedToken) {
      await sandbox.expireSignedPreviewUrl(input.port, revokedSignedToken);
    }

    const [standardPreview, signedPreview] = await Promise.all([
      shouldFetchStandard ? sandbox.getPreviewLink(input.port) : Promise.resolve(null),
      shouldFetchSigned
        ? sandbox.getSignedPreviewUrl(input.port, input.expiresInSeconds)
        : Promise.resolve(null),
    ]);
    const connectivity = input.checkConnectivity
      ? await this.checkServiceConnectivity(input.port)
      : null;

    return {
      port: input.port,
      previewType: input.previewType,
      ...(revokedSignedToken ? { revokedSignedToken } : {}),
      ...(standardPreview ? { standard: buildStandardPreviewResult(standardPreview) } : {}),
      ...(signedPreview ? { signed: buildSignedPreviewResult(signedPreview, input) } : {}),
      ...(connectivity ? { connectivity } : {}),
    };
  }

  async readPtySession(
    input: XtermReadInput &
      Pick<XtermWriteInput, "cols" | "rows" | "cwd" | "envs">
  ) {
    const sandboxSession = this.ensureSandboxSession();
    return await readPtyOutput(sandboxSession, input);
  }

  async writePtySession(input: XtermWriteInput) {
    const sandboxSession = this.ensureSandboxSession();
    return await writeToPty(sandboxSession, input);
  }

  async resizePtySession(input: XtermResizeInput) {
    const sandboxSession = this.ensureSandboxSession();
    return await resizePty(sandboxSession, input);
  }

  async listPtySessions(input: XtermListInput = {}) {
    void input;
    const sandboxSession = this.ensureSandboxSession();
    const sessions = await listPtySessions(sandboxSession);
    return { sessions };
  }

  async closePtySession(input: XtermCloseInput) {
    const sandboxSession = this.ensureSandboxSession();
    return await closePtySession(sandboxSession, input);
  }

  async lspCompletions(input: LspCompletionsInput) {
    const sandboxSession = this.ensureSandboxSession();
    const normalizedInput: LspCompletionsInput = {
      ...input,
      projectPath: normalizeSandboxPath(input.projectPath),
      filePath: normalizeSandboxPath(input.filePath),
    };

    try {
      return await getLspCompletions(sandboxSession, normalizedInput);
    } catch (error) {
      return {
        languageId: normalizedInput.languageId,
        filePath: normalizedInput.filePath,
        line: normalizedInput.line,
        character: normalizedInput.character,
        completions: [],
        error: "LSP server not available",
        reason: buildLspErrorReason(normalizedInput.languageId, error),
      };
    }
  }

  async closeSandboxSession() {
    const sandboxSession = this.sandboxSession;
    if (!sandboxSession) {
      return;
    }
    await Promise.all([
      closeAllPtySessions(sandboxSession),
      closeAllLspSessions(sandboxSession),
    ]);
    this.sandboxSession = null;
  }

  private async loadAttachment(url: string): Promise<Buffer | null> {
    const dataUrlContent = decodeDataUrl(url);
    if (dataUrlContent) {
      return dataUrlContent;
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return null;
    }

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer);
  }

  async saveFilesToSandbox(messages: UIMessage[]) {
    const sandboxSession = this.ensureSandboxSession();
    let uploaded = 0;
    let skipped = 0;
    let errors = 0;

    const ensureDirsResult = await this.runInternalPtyCommand(
      `mkdir -p ${shellQuote(SANDBOX_UPLOADS_DIR)} ${shellQuote(SANDBOX_UPLOADS_TEMP_DIR)}`
    );
    if (!ensureDirsResult.success || ensureDirsResult.timedOut) {
      throw new Error(
        createPtyCommandError("saveFilesToSandbox mkdir", ensureDirsResult)
      );
    }

    for (const message of messages) {
      for (const [index, part] of message.parts.entries()) {
        if (!isFileUIPart(part)) {
          continue;
        }

        const payload = await this.loadAttachment(part.url).catch(() => null);
        if (!payload) {
          skipped += 1;
          continue;
        }

        const filename = sanitizeFilename(
          part.filename ?? `${message.id}-${index}.bin`
        );
        const destinationPath = `${SANDBOX_UPLOADS_DIR}/${filename}`;
        const tempPath = `${SANDBOX_UPLOADS_TEMP_DIR}/${createTempFileName(
          message.id,
          index,
          filename
        )}`;

        try {
          await sandboxSession.sandbox.fs.uploadFile(payload, tempPath);
          const moveResult = await this.runInternalPtyCommand(
            `mv -f ${shellQuote(tempPath)} ${shellQuote(destinationPath)}`
          );
          if (!moveResult.success || moveResult.timedOut) {
            throw new Error(createPtyCommandError("saveFilesToSandbox mv", moveResult));
          }
          uploaded += 1;
        } catch {
          void this.runInternalPtyCommand(`rm -f ${shellQuote(tempPath)}`).catch(
            () => undefined
          );
          errors += 1;
        }
      }
    }

    return {
      uploaded,
      skipped,
      errors,
    };
  }
}

function createSandboxTool(
  options: SandboxToolkitOptions,
  config: {
    name: string;
    description: string;
    parameters: z.ZodObject<z.ZodRawShape>;
    execute: (
      args: Record<string, unknown>,
      toolOptions?: WrappedExecuteOptions
    ) => Promise<unknown>;
  }
): BaseTool {
  if (options.store) {
    return createWrappedTool({
      name: config.name,
      description: config.description,
      parameters: config.parameters,
      store: options.store,
      toolCallConfig: DEFAULT_TOOL_CALL_CONFIG,
      execute: config.execute,
    });
  }

  return createTool({
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: async (args, toolOptions) =>
      await config.execute(
        args,
        toolOptions
      ),
  });
}

export function createSandboxToolkit(
  filesystemBackend: SandboxFilesystemBackend,
  options: SandboxToolkitOptions = {}
): Toolkit {
  const tools: BaseTool[] = [
    createSandboxTool(options, {
      name: "ls",
      description: "List files and directories in the sandbox.",
      parameters: lsParameters,
      execute: async (args) => await filesystemBackend.listFiles(lsParameters.parse(args)),
    }),
    createSandboxTool(options, {
      name: "read",
      description: "Read a text file from the sandbox.",
      parameters: readParameters,
      execute: async (args) => await filesystemBackend.readFile(readParameters.parse(args)),
    }),
    createSandboxTool(options, {
      name: "write",
      description: "Write text content to a sandbox file.",
      parameters: writeParameters,
      execute: async (args) => await filesystemBackend.writeFile(writeParameters.parse(args)),
    }),
    createSandboxTool(options, {
      name: "edit",
      description: "Edit a sandbox file by replacing text.",
      parameters: editParameters,
      execute: async (args) => await filesystemBackend.editFile(editParameters.parse(args)),
    }),
    createSandboxTool(options, {
      name: "glob",
      description: "Find files in the sandbox with a glob pattern.",
      parameters: globParameters,
      execute: async (args) => await filesystemBackend.globFiles(globParameters.parse(args)),
    }),
    createSandboxTool(options, {
      name: "grep",
      description: "Search sandbox files for a pattern.",
      parameters: grepParameters,
      execute: async (args) => await filesystemBackend.grepFiles(grepParameters.parse(args)),
    }),
    createSandboxTool(options, {
      name: "exec",
      description: "Execute a shell command through a PTY session.",
      parameters: execParameters,
      execute: async (args, toolOptions) =>
        await filesystemBackend.exec(execParameters.parse(args), toolOptions),
    }),
    createSandboxTool(options, {
      name: "expose_service",
      description:
        "Expose a sandbox HTTP service by generating Daytona standard and/or signed preview links.",
      parameters: exposeServiceParameters,
      execute: async (args) => {
        return await filesystemBackend.exposeService(
          exposeServiceParameters.parse(args)
        );
      },
    }),
    createSandboxTool(options, {
      name: "close_pty_session",
      description: "Close and kill a PTY session.",
      parameters: xtermCloseParameters,
      execute: async (args) => {
        return await filesystemBackend.closePtySession(
          xtermCloseParameters.parse(args)
        );
      },
    }),
    createSandboxTool(options, {
      name: "lsp_completions",
      description: "Get LSP completions from the single active LSP session (auto-recreated on language change).",
      parameters: lspCompletionsParameters,
      execute: async (args) => {
        return await filesystemBackend.lspCompletions(
          lspCompletionsParameters.parse(args)
        );
      },
    }),
  ];

  return createToolkit({
    name: "sandbox",
    description:
      "Sandbox filesystem, PTY terminal, and LSP tools backed by Daytona.",
    instructions: SANDBOX_TOOLKIT_INSTRUCTIONS,
    tools,
  });
}

export abstract class SandboxTerminalAgentBase<
  State = unknown,
> extends AIChatAgent<typeof worker.Env, State> {
  private terminalBackend: SandboxFilesystemBackend | null = null;
  private terminalBackendSandboxId: string | null = null;

  protected abstract initSandboxAccess(): Promise<void>;
  protected abstract getSandboxIdForTerminal(): string | null;

  private async getTerminalBackend(): Promise<SandboxFilesystemBackend> {
    await this.initSandboxAccess();
    const sandboxId = this.getSandboxIdForTerminal();
    if (!sandboxId) {
      throw new Error("No sandbox attached to this chat");
    }

    if (this.terminalBackend && this.terminalBackendSandboxId === sandboxId) {
      return this.terminalBackend;
    }

    if (this.terminalBackend) {
      await this.terminalBackend.closeSandboxSession().catch(() => undefined);
    }

    const backend = new SandboxFilesystemBackend(this.env, sandboxId);
    this.terminalBackend = backend;
    this.terminalBackendSandboxId = sandboxId;
    return this.terminalBackend;
  }

  @callable()
  async listFiles(input?: { path?: string }) {
    const backend = await this.getTerminalBackend();
    return await backend.listFiles({
      path: input?.path ?? ".",
    });
  }

  @callable()
  async openPtyTerminal(input?: {
    terminalId?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    envs?: Record<string, string>;
  }) {
    const backend = await this.getTerminalBackend();
    const response = await backend.openPtySession({
      terminalId: input?.terminalId,
      cols: input?.cols,
      rows: input?.rows,
      cwd: input?.cwd,
      envs: input?.envs,
    });
    return { terminalId: response.terminalId };
  }

  @callable()
  async readPtyTerminal(input: {
    terminalId: string;
    offset?: number;
    cols?: number;
    rows?: number;
    cwd?: string;
    envs?: Record<string, string>;
  }) {
    const backend = await this.getTerminalBackend();
    return await backend.readPtySession({
      terminalId: input.terminalId,
      offset: input.offset ?? 0,
      cols: input.cols,
      rows: input.rows,
      cwd: input.cwd,
      envs: input.envs,
    });
  }

  @callable()
  async writePtyTerminal(input: {
    terminalId: string;
    data: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    envs?: Record<string, string>;
  }) {
    const backend = await this.getTerminalBackend();
    return await backend.writePtySession({
      terminalId: input.terminalId,
      data: input.data,
      cols: input.cols,
      rows: input.rows,
      cwd: input.cwd,
      envs: input.envs,
    });
  }

  @callable()
  async resizePtyTerminal(input: {
    terminalId: string;
    cols: number;
    rows: number;
  }) {
    const backend = await this.getTerminalBackend();
    return await backend.resizePtySession({
      terminalId: input.terminalId,
      cols: input.cols,
      rows: input.rows,
    });
  }

  @callable()
  async listPtyTerminalSessions() {
    const backend = await this.getTerminalBackend();
    return await backend.listPtySessions();
  }

  @callable()
  async closePtyTerminal(input: { terminalId: string }) {
    const backend = await this.getTerminalBackend();
    return await backend.closePtySession({
      terminalId: input.terminalId,
    });
  }
}

function resolveExecTimeoutMs(timeoutMs: number, wrappedTimeoutMs?: number): number {
  const normalizedTimeoutMs = Math.max(1, Math.floor(timeoutMs));
  if (typeof wrappedTimeoutMs !== "number" || !Number.isFinite(wrappedTimeoutMs)) {
    return normalizedTimeoutMs;
  }

  const normalizedWrappedTimeoutMs = Math.max(1, Math.floor(wrappedTimeoutMs));
  if (normalizedTimeoutMs > normalizedWrappedTimeoutMs) {
    return normalizedTimeoutMs;
  }

  return Math.max(normalizedTimeoutMs, EXEC_PROMOTED_CONTINUATION_TIMEOUT_MS);
}

function parseModTime(modTime: string): number {
  const parsed = Date.parse(modTime);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function joinSandboxPath(basePath: string, name: string): string {
  if (basePath === ".") {
    return name;
  }
  if (basePath === "/") {
    return `/${name}`;
  }
  const normalizedBase = basePath.endsWith("/")
    ? basePath.slice(0, -1)
    : basePath;
  return `${normalizedBase}/${name}`;
}

function decodeDataUrl(url: string): Buffer | null {
  if (!url.startsWith("data:")) {
    return null;
  }

  const commaIndex = url.indexOf(",");
  if (commaIndex === -1) {
    return null;
  }

  const metadata = url.slice(5, commaIndex);
  const payload = url.slice(commaIndex + 1);
  if (metadata.includes(";base64")) {
    return Buffer.from(payload, "base64");
  }

  return Buffer.from(decodeURIComponent(payload), "utf8");
}

function countSubstringOccurrences(content: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  return content.split(needle).length - 1;
}

function replaceFirstOccurrence(content: string, oldText: string, newText: string): string {
  const index = content.indexOf(oldText);
  if (index < 0) {
    return content;
  }
  return `${content.slice(0, index)}${newText}${content.slice(index + oldText.length)}`;
}

function createPtyCommandError(
  operation: string,
  result: Pick<ExecOutput, "success" | "timedOut" | "exitCode" | "error" | "output">
): string {
  if (result.timedOut) {
    return `${operation} timed out`;
  }
  const outputTail = result.output.slice(-500).trim();
  const errorReason = result.error?.trim();
  if (errorReason) {
    return `${operation} failed: ${errorReason}`;
  }
  if (outputTail) {
    return `${operation} failed: ${outputTail}`;
  }
  if (result.exitCode !== null) {
    return `${operation} failed with exit code ${result.exitCode}`;
  }
  return `${operation} failed`;
}

function buildStandardPreviewResult(
  preview: Awaited<ReturnType<Sandbox["getPreviewLink"]>>
) {
  return {
    url: preview.url,
    token: preview.token ?? null,
    auth: {
      type: "header" as const,
      headerName: DAYTONA_PREVIEW_TOKEN_HEADER,
      ...(preview.token ? { headerValue: preview.token } : {}),
    },
  };
}

function buildSignedPreviewResult(
  preview: Awaited<ReturnType<Sandbox["getSignedPreviewUrl"]>>,
  input: Pick<ExposeServiceInput, "expiresInSeconds">
) {
  return {
    url: preview.url,
    token: preview.token,
    ...(input.expiresInSeconds !== undefined
      ? { expiresInSeconds: input.expiresInSeconds }
      : {}),
    auth: {
      type: "token_in_url" as const,
    },
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function createTempFileName(messageId: string, index: number, filename: string): string {
  const safeMessageId = messageId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${safeMessageId}_${index}_${nonce}_${filename}`;
}

function normalizeSandboxPath(path: string): string {
  if (path === "/workspace") {
    return "workspace";
  }
  if (path.startsWith("/workspace/")) {
    return `workspace/${path.slice("/workspace/".length)}`;
  }
  if (path === "/home/daytona/workspace") {
    return "workspace";
  }
  if (path.startsWith("/home/daytona/workspace/")) {
    return `workspace/${path.slice("/home/daytona/workspace/".length)}`;
  }
  return path;
}

function getLspBinaryCandidates(languageId: string): string[] {
  switch (languageId.toLowerCase()) {
    case "typescript":
    case "javascript":
      return ["typescript-language-server", "vtsls"];
    case "python":
      return ["pylsp", "pyright-langserver", "basedpyright-langserver"];
    default:
      return [];
  }
}

function isSandboxPathNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return message.includes("not found") || message.includes("no such file") || message.includes("404");
}

function buildLspErrorReason(languageId: string, error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    const message = error.message.trim();
    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes("not found") || normalizedMessage.includes("enoent")) {
      const binaries = getLspBinaryCandidates(languageId);
      if (binaries.length > 0) {
        return `Server binary not found (${binaries.join(" or ")})`;
      }
    }
    return message;
  }
  return "Unknown LSP startup failure";
}
