import { Daytona } from "@daytonaio/sdk";
import { isFileUIPart, type UIMessage } from "ai";
import type {
  EditResult,
  FileData,
  FileInfo,
  FilesystemBackend,
  GrepMatch,
  WriteResult,
} from "@voltagent/core";
import type { worker } from "../../../alchemy.run";
import { escapeShellArg } from "./shared";

export class SandboxFilesystemBackend implements FilesystemBackend {
  private static readonly LSP_IDLE_TTL_MS = 10 * 60 * 1000;
  private static daytonaClient: Daytona | null = null;
  private static sandboxByName = new Map<string, ReturnType<Daytona["get"]>>();
  private static lspServerBySandbox = new Map<
    string,
    Map<
      string,
      {
        server: Awaited<ReturnType<Awaited<ReturnType<Daytona["get"]>>["createLspServer"]>>;
        lastUsedAt: number;
      }
    >
  >();
  private env: typeof worker.Env;
  private sandboxName: string;
  public rootDir: string;

  constructor(env: typeof worker.Env, sandboxName: string) {
    this.env = env;
    this.sandboxName = sandboxName;
    this.rootDir = env.SANDBOX_ROOT_DIR;
  }

  private resolvePath(path: string): string {
    const normalizedInput = path.trim() || ".";
    if (normalizedInput === "/" || normalizedInput === ".") {
      return this.rootDir;
    }
    if (normalizedInput.startsWith("/")) {
      return normalizedInput.replace(/\/+/g, "/");
    }
    return `${this.rootDir}/${normalizedInput}`.replace(/\/+/g, "/");
  }

  private getDaytonaClient(): Daytona {
    if (SandboxFilesystemBackend.daytonaClient) {
      return SandboxFilesystemBackend.daytonaClient;
    }

    SandboxFilesystemBackend.daytonaClient = new Daytona({
      apiKey: this.env.DAYTONA_API_KEY,
      ...(this.env.DAYTONA_API_URL ? { apiUrl: this.env.DAYTONA_API_URL } : {}),
      ...(this.env.DAYTONA_TARGET ? { target: this.env.DAYTONA_TARGET } : {}),
    });

    return SandboxFilesystemBackend.daytonaClient;
  }

  private async getSandbox() {
    const cached = SandboxFilesystemBackend.sandboxByName.get(this.sandboxName);
    if (cached) {
      return cached;
    }

    const sandboxPromise = (async () => {
      const daytona = this.getDaytonaClient();

      try {
        return await daytona.get(this.sandboxName);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/404|not found/i.test(message)) {
          throw error;
        }

        return daytona.create({
          name: this.sandboxName,
          language: "typescript",
          snapshot: "daytona-medium",
        });
      }
    })();

    SandboxFilesystemBackend.sandboxByName.set(this.sandboxName, sandboxPromise);
    try {
      return await sandboxPromise;
    } catch (error) {
      SandboxFilesystemBackend.sandboxByName.delete(this.sandboxName);
      throw error;
    }
  }

  private getLspCache() {
    const cached = SandboxFilesystemBackend.lspServerBySandbox.get(this.sandboxName);
    if (cached) {
      return cached;
    }

    const created = new Map<
      string,
      {
        server: Awaited<ReturnType<Awaited<ReturnType<Daytona["get"]>>["createLspServer"]>>;
        lastUsedAt: number;
      }
    >();
    SandboxFilesystemBackend.lspServerBySandbox.set(this.sandboxName, created);
    return created;
  }

  private normalizeTimestamp(timestamp?: string): string {
    if (!timestamp) {
      return new Date().toISOString();
    }
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }
    return parsed.toISOString();
  }

  private normalizeReturnedPath(path: string, basePath: string): string {
    if (path.startsWith("/")) {
      return path.replace(/\/+/g, "/");
    }
    return `${basePath}/${path}`.replace(/\/+/g, "/");
  }

  private joinPath(basePath: string, childName: string): string {
    const cleanBase = basePath.endsWith("/") && basePath !== "/" ? basePath.slice(0, -1) : basePath;
    return `${cleanBase}/${childName}`.replace(/\/+/g, "/");
  }

  private getParentDir(path: string): string {
    const index = path.lastIndexOf("/");
    if (index <= 0) {
      return "/";
    }
    return path.slice(0, index) || "/";
  }

  private async getFileDetailsOrNull(
    sandbox: Awaited<ReturnType<Daytona["get"]>>,
    path: string
  ) {
    try {
      return await sandbox.fs.getFileDetails(path);
    } catch {
      return null;
    }
  }

  private async ensureDirectory(
    sandbox: Awaited<ReturnType<Daytona["get"]>>,
    directoryPath: string
  ): Promise<void> {
    if (!directoryPath || directoryPath === "/") {
      return;
    }

    const segments = directoryPath.split("/").filter(Boolean);
    let currentPath = "";

    for (const segment of segments) {
      currentPath = `${currentPath}/${segment}`.replace(/\/+/g, "/");
      const details = await this.getFileDetailsOrNull(sandbox, currentPath);

      if (details?.isDir) {
        continue;
      }
      if (details && !details.isDir) {
        throw new Error(`Path exists and is not a directory: ${currentPath}`);
      }

      try {
        await sandbox.fs.createFolder(currentPath, "755");
      } catch {
        const refreshed = await this.getFileDetailsOrNull(sandbox, currentPath);
        if (!refreshed?.isDir) {
          throw new Error(`Failed to create directory: ${currentPath}`);
        }
      }
    }
  }

  private async cleanupIdleLspServers(): Promise<void> {
    const cache = this.getLspCache();
    const now = Date.now();

    for (const [key, entry] of cache) {
      if (now - entry.lastUsedAt < SandboxFilesystemBackend.LSP_IDLE_TTL_MS) {
        continue;
      }
      await entry.server.stop().catch(() => {});
      cache.delete(key);
    }
  }

  private buildLspCacheKey(languageId: string, projectPath: string): string {
    return `${languageId.trim().toLowerCase()}::${projectPath}`;
  }

  private async getOrCreateLspServer(languageId: string, projectPath: string) {
    await this.cleanupIdleLspServers();

    const cache = this.getLspCache();
    const key = this.buildLspCacheKey(languageId, projectPath);
    const existing = cache.get(key);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing.server;
    }

    const sandbox = await this.getSandbox();
    const server = await sandbox.createLspServer(languageId, projectPath);
    await server.start();
    cache.set(key, { server, lastUsedAt: Date.now() });

    return server;
  }

  async lsInfo(path: string): Promise<FileInfo[]> {
    const resolvedPath = this.resolvePath(path);

    try {
      const sandbox = await this.getSandbox();
      const files = await sandbox.fs.listFiles(resolvedPath);

      return files.map((file) => ({
        path: this.joinPath(resolvedPath, file.name),
        is_dir: file.isDir,
        size: file.size,
        modified_at: file.modTime ? this.normalizeTimestamp(file.modTime) : undefined,
      }));
    } catch {
      return [];
    }
  }

  async read(filePath: string, offset?: number, limit?: number): Promise<string> {
    const resolvedPath = this.resolvePath(filePath);
    const sandbox = await this.getSandbox();
    const content = (await sandbox.fs.downloadFile(resolvedPath)).toString("utf-8");

    if (offset === undefined && limit === undefined) {
      return content;
    }

    const lines = content.split("\n");
    const start = Math.max(0, offset ?? 0);
    const end = limit === undefined ? lines.length : start + Math.max(0, limit);
    return lines.slice(start, end).join("\n");
  }

  async readRaw(filePath: string): Promise<FileData> {
    const resolvedPath = this.resolvePath(filePath);
    const sandbox = await this.getSandbox();
    const [rawBuffer, details] = await Promise.all([
      sandbox.fs.downloadFile(resolvedPath),
      sandbox.fs.getFileDetails(resolvedPath).catch(() => null),
    ]);
    const content = rawBuffer.toString("utf-8");
    const modifiedAt = this.normalizeTimestamp(details?.modTime);

    return {
      content: content.split("\n"),
      created_at: modifiedAt,
      modified_at: modifiedAt,
    };
  }

  async grepRaw(pattern: string, path?: string | null, glob?: string | null): Promise<GrepMatch[] | string> {
    const searchPath = path ? this.resolvePath(path) : this.rootDir;
    try {
      const sandbox = await this.getSandbox();
      const matches = await sandbox.fs.findFiles(searchPath, pattern);
      if (!matches.length) {
        return [];
      }

      if (!glob) {
        return matches.map((match) => ({
          path: this.normalizeReturnedPath(match.file, searchPath),
          line: match.line,
          text: match.content,
        }));
      }

      const globMatches = await sandbox.fs.searchFiles(searchPath, glob);
      const allowedPaths = new Set(
        globMatches.files.map((file) => this.normalizeReturnedPath(file, searchPath))
      );

      return matches
        .map((match) => ({
          path: this.normalizeReturnedPath(match.file, searchPath),
          line: match.line,
          text: match.content,
        }))
        .filter((match) => allowedPaths.has(match.path));
    } catch {
      return [];
    }
  }

  async globInfo(pattern: string, path?: string): Promise<FileInfo[]> {
    const searchPath = path ? this.resolvePath(path) : this.rootDir;
    try {
      const sandbox = await this.getSandbox();
      const results = await sandbox.fs.searchFiles(searchPath, pattern);
      if (!results.files.length) {
        return [];
      }

      const detailedResults = await Promise.all(
        results.files.map(async (filePath) => {
          const resolvedFilePath = this.normalizeReturnedPath(filePath, searchPath);
          const details = await sandbox.fs.getFileDetails(resolvedFilePath).catch(() => null);
          return {
            path: resolvedFilePath,
            is_dir: details?.isDir,
            size: details?.size,
            modified_at: details?.modTime
              ? this.normalizeTimestamp(details.modTime)
              : undefined,
          } satisfies FileInfo;
        })
      );

      return detailedResults;
    } catch {
      return [];
    }
  }

  async write(filePath: string, content: string, encoding: BufferEncoding = "utf-8"): Promise<WriteResult> {
    const resolvedPath = this.resolvePath(filePath);

    try {
      const sandbox = await this.getSandbox();
      const existing = await this.getFileDetailsOrNull(sandbox, resolvedPath);
      if (existing) {
        return {
          error: `Cannot write to ${resolvedPath} because it already exists. Read and then make an edit, or write to a new path.`,
          path: resolvedPath,
        };
      }

      const parentDir = this.getParentDir(resolvedPath);
      await this.ensureDirectory(sandbox, parentDir);
      await sandbox.fs.uploadFile(Buffer.from(content, encoding), resolvedPath);

      const fileData = await this.readRaw(filePath);

      return {
        path: resolvedPath,
        filesUpdate: {
          [resolvedPath]: fileData,
        },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult> {
    const resolvedPath = this.resolvePath(filePath);

    try {
      const currentContent = await this.read(filePath);

      const regex = replaceAll
        ? new RegExp(this.escapeRegex(oldString), "g")
        : new RegExp(this.escapeRegex(oldString));

      const occurrences = (currentContent.match(regex) || []).length;

      if (occurrences === 0) {
        return {
          error: `String not found in file: "${oldString.substring(0, 50)}${oldString.length > 50 ? "..." : ""}"`,
          path: resolvedPath,
          occurrences: 0,
        };
      }

      const newContent = replaceAll
        ? currentContent.replaceAll(oldString, newString)
        : currentContent.replace(oldString, newString);

      const sandbox = await this.getSandbox();
      await sandbox.fs.uploadFile(Buffer.from(newContent, "utf-8"), resolvedPath);

      const fileData = await this.readRaw(filePath);

      return {
        path: resolvedPath,
        filesUpdate: {
          [resolvedPath]: fileData,
        },
        occurrences: replaceAll ? occurrences : 1,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  async gitClone(params: {
    url: string;
    path: string;
    branch?: string;
    commitId?: string;
    username?: string;
    password?: string;
  }) {
    const sandbox = await this.getSandbox();
    const targetPath = this.resolvePath(params.path);
    await sandbox.git.clone(
      params.url,
      targetPath,
      params.branch,
      params.commitId,
      params.username,
      params.password
    );
    return {
      success: true,
      path: targetPath,
    };
  }

  async gitStatus(path: string) {
    const sandbox = await this.getSandbox();
    return sandbox.git.status(this.resolvePath(path));
  }

  async gitBranches(path: string) {
    const sandbox = await this.getSandbox();
    return sandbox.git.branches(this.resolvePath(path));
  }

  async gitCreateBranch(path: string, name: string) {
    const sandbox = await this.getSandbox();
    await sandbox.git.createBranch(this.resolvePath(path), name);
    return {
      success: true,
    };
  }

  async gitDeleteBranch(path: string, name: string) {
    const sandbox = await this.getSandbox();
    await sandbox.git.deleteBranch(this.resolvePath(path), name);
    return {
      success: true,
    };
  }

  async gitCheckoutBranch(path: string, branch: string) {
    const sandbox = await this.getSandbox();
    await sandbox.git.checkoutBranch(this.resolvePath(path), branch);
    return {
      success: true,
    };
  }

  async gitAdd(path: string, files: string[]) {
    const sandbox = await this.getSandbox();
    await sandbox.git.add(this.resolvePath(path), files);
    return {
      success: true,
    };
  }

  async gitCommit(path: string, params: {
    message: string;
    author: string;
    email: string;
    allowEmpty?: boolean;
  }) {
    const sandbox = await this.getSandbox();
    return sandbox.git.commit(
      this.resolvePath(path),
      params.message,
      params.author,
      params.email,
      params.allowEmpty
    );
  }

  async gitPush(path: string, username?: string, password?: string) {
    const sandbox = await this.getSandbox();
    await sandbox.git.push(this.resolvePath(path), username, password);
    return {
      success: true,
    };
  }

  async gitPull(path: string, username?: string, password?: string) {
    const sandbox = await this.getSandbox();
    await sandbox.git.pull(this.resolvePath(path), username, password);
    return {
      success: true,
    };
  }

  async lspStart(languageId: string, projectPath: string) {
    const resolvedProjectPath = this.resolvePath(projectPath);
    await this.getOrCreateLspServer(languageId, resolvedProjectPath);
    return {
      languageId,
      projectPath: resolvedProjectPath,
      started: true,
    };
  }

  async lspStop(languageId: string, projectPath: string) {
    const resolvedProjectPath = this.resolvePath(projectPath);
    const key = this.buildLspCacheKey(languageId, resolvedProjectPath);
    const cache = this.getLspCache();
    const entry = cache.get(key);
    if (!entry) {
      return {
        languageId,
        projectPath: resolvedProjectPath,
        stopped: false,
        running: false,
      };
    }

    await entry.server.stop();
    cache.delete(key);

    return {
      languageId,
      projectPath: resolvedProjectPath,
      stopped: true,
      running: false,
    };
  }

  async lspCompletions(params: {
    languageId: string;
    projectPath: string;
    filePath: string;
    line: number;
    character: number;
  }) {
    const resolvedProjectPath = this.resolvePath(params.projectPath);
    const resolvedFilePath = this.resolvePath(params.filePath);
    const server = await this.getOrCreateLspServer(params.languageId, resolvedProjectPath);
    await server.didOpen(resolvedFilePath).catch(() => {});
    return server.completions(resolvedFilePath, {
      line: params.line,
      character: params.character,
    });
  }

  async lspDocumentSymbols(languageId: string, projectPath: string, filePath: string) {
    const resolvedProjectPath = this.resolvePath(projectPath);
    const resolvedFilePath = this.resolvePath(filePath);
    const server = await this.getOrCreateLspServer(languageId, resolvedProjectPath);
    await server.didOpen(resolvedFilePath).catch(() => {});
    return server.documentSymbols(resolvedFilePath);
  }

  async lspSandboxSymbols(languageId: string, projectPath: string, query: string) {
    const resolvedProjectPath = this.resolvePath(projectPath);
    const server = await this.getOrCreateLspServer(languageId, resolvedProjectPath);
    return server.sandboxSymbols(query);
  }

  async saveFilesToSandbox(messages: UIMessage[]): Promise<void> {
    const uploadDir = "/workspace/uploads";
    await this.exec(`mkdir -p ${escapeShellArg(uploadDir)}`);

    for (const msg of messages) {
      for (const part of msg.parts) {
        if (!isFileUIPart(part)) continue;

        const { url, filename } = part;
        if (!filename) continue;
        const safeFilename = this.sanitizeFilename(filename);
        const filePath = `${uploadDir}/${safeFilename}`;

        try {
          if (url.startsWith("data:")) {
            const base64Match = url.match(/^data:[^;]+;base64,(.+)$/);
            if (base64Match?.[1]) {
              const binaryContent = atob(base64Match[1]);
              await this.write(filePath, binaryContent, "binary");
              continue;
            }
          }
          if (url.startsWith("http://") || url.startsWith("https://")) {
            if (!url.startsWith("https://")) {
              throw new Error("Only https URLs are allowed for sandbox downloads");
            }
            const result = await this.exec(
              `curl -L --fail --silent --show-error --connect-timeout 5 --max-time 20 --max-filesize 52428800 ${escapeShellArg(url)} -o ${escapeShellArg(filePath)}`
            );
            if (!result.success) {
              throw new Error(`Failed to curl ${url}: ${result.stderr}`);
            }
          }
        } catch {
          // silently ignore sandbox file save failures
        }
      }
    }
  }

  async exec(command: string, options?: {
    timeout?: number;
    cwd?: string;
    abortSignal?: AbortSignal;
    streamLogs?: (entry: { type: "stdout" | "stderr" | "info" | "error"; message: string }) => void;
  }): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    const sandbox = await this.getSandbox();
    const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.rootDir;
    const cmd = `cd ${escapeShellArg(cwd)} && ${command}`;
    const timeoutMs = options?.timeout
      ? Math.max(1, Math.ceil(options.timeout))
      : undefined;
    const streamLogs = options?.streamLogs;
    const sessionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await sandbox.process.createSession(sessionId);

    let stdout = "";
    let stderr = "";
    let commandId: string | undefined;
    let logStreamPromise: Promise<void> | undefined;
    const startedAt = Date.now();

    try {
      const runResponse = await sandbox.process.executeSessionCommand(sessionId, {
        command: cmd,
        runAsync: true,
      });
      commandId = runResponse.cmdId;

      if (!commandId) {
        const fallbackStdout = runResponse.stdout ?? "";
        const fallbackStderr = runResponse.stderr ?? "";
        if (fallbackStdout && streamLogs) {
          streamLogs({ type: "stdout", message: fallbackStdout });
        }
        if (fallbackStderr && streamLogs) {
          streamLogs({ type: "stderr", message: fallbackStderr });
        }
        return {
          success: (runResponse.exitCode ?? 1) === 0,
          stdout: fallbackStdout,
          stderr: fallbackStderr,
          exitCode: runResponse.exitCode ?? 1,
        };
      }

      if (streamLogs) {
        logStreamPromise = sandbox.process
          .getSessionCommandLogs(
            sessionId,
            commandId,
            (chunk) => {
              if (!chunk) return;
              stdout += chunk;
              streamLogs({ type: "stdout", message: chunk });
            },
            (chunk) => {
              if (!chunk) return;
              stderr += chunk;
              streamLogs({ type: "stderr", message: chunk });
            }
          )
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            streamLogs({ type: "error", message: `log stream error: ${message}` });
          });
      }

      let exitCode = 1;

      while (true) {
        if (options?.abortSignal?.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        if (timeoutMs !== undefined && Date.now() - startedAt >= timeoutMs) {
          throw new Error(`Command timed out after ${timeoutMs}ms`);
        }

        const commandState = await sandbox.process.getSessionCommand(sessionId, commandId);
        if (typeof commandState.exitCode === "number") {
          exitCode = commandState.exitCode;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      if (streamLogs) {
        await logStreamPromise;
      } else {
        const logs = await sandbox.process
          .getSessionCommandLogs(sessionId, commandId)
          .catch(() => null);
        stdout = logs?.stdout ?? "";
        stderr = logs?.stderr ?? "";
      }

      return {
        success: exitCode === 0,
        stdout,
        stderr,
        exitCode,
      };
    } finally {
      await sandbox.process.deleteSession(sessionId).catch(() => {});
    }
  }

  private sanitizeFilename(filename: string): string {
    const base = filename.split(/[\\/]/).pop() ?? "file";
    const sanitized = base.replace(/[\u0000-\u001F\u007F]/g, "_").trim();
    return sanitized.length > 0 ? sanitized : "file";
  }
}
