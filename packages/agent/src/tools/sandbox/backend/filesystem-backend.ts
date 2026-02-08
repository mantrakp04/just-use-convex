import { isFileUIPart, type UIMessage } from "ai";
import type {
  EditResult,
  FileData,
  FileInfo,
  FilesystemBackend,
  GrepMatch,
  WriteResult,
} from "@voltagent/core";
import type { worker } from "../../../../alchemy.run";
import { SandboxContext } from "./context";
import { SandboxLspService } from "./lsp";
import {
  ensureDirectoryExists,
  escapeRegexLiteral,
  escapeShellArg,
  getFileDetailsOrNull,
  joinPath,
  normalizeFoundPath,
  parentPath,
  resolveSandboxPath,
  toIsoTimestamp,
} from "./utils";
import { SandboxPtyService } from "./pty";
import type {
  CommandLogEntry,
  CommandRunResult,
  SandboxInstance,
} from "./types";

export class SandboxFilesystemBackend implements FilesystemBackend {
  private readonly context: SandboxContext;
  private readonly pty: SandboxPtyService;
  private readonly lsp: SandboxLspService;

  constructor(env: typeof worker.Env, sandboxId: string) {
    this.context = new SandboxContext(env, sandboxId);
    this.pty = new SandboxPtyService(this.context);
    this.lsp = new SandboxLspService(this.context);
  }

  private async withSandboxAndRoot<T>(
    callback: (sandbox: SandboxInstance, rootPath: string) => Promise<T>
  ): Promise<T> {
    const sandbox = await this.context.getSandbox();
    const rootPath = await this.context.getRootPath();
    return callback(sandbox, rootPath);
  }

  private async withResolvedPath<T>(
    inputPath: string,
    callback: (sandbox: SandboxInstance, rootPath: string, resolvedPath: string) => Promise<T>
  ): Promise<T> {
    return this.withSandboxAndRoot(async (sandbox, rootPath) => {
      const resolvedPath = resolveSandboxPath(inputPath, rootPath);
      return callback(sandbox, rootPath, resolvedPath);
    });
  }

  async getWorkingDirectory(): Promise<string> {
    return this.context.getRootPath();
  }

  async lsInfo(path: string): Promise<FileInfo[]> {
    return this.withResolvedPath(path, async (sandbox, _rootPath, resolvedPath) => {
      const entries = await sandbox.fs.listFiles(resolvedPath);

      return entries.map((entry) => ({
        path: joinPath(resolvedPath, entry.name),
        is_dir: entry.isDir,
        size: entry.size,
        modified_at: entry.modTime ? toIsoTimestamp(entry.modTime) : undefined,
      }));
    });
  }

  async read(filePath: string, offset?: number, limit?: number): Promise<string> {
    return this.withResolvedPath(filePath, async (sandbox, _rootPath, resolvedPath) => {
      const content = (await sandbox.fs.downloadFile(resolvedPath)).toString("utf-8");

      if (offset === undefined && limit === undefined) {
        return content;
      }

      const lines = content.split("\n");
      const start = Math.max(0, offset ?? 0);
      const end = limit === undefined ? lines.length : start + Math.max(0, limit);

      return lines.slice(start, end).join("\n");
    });
  }

  async readRaw(filePath: string): Promise<FileData> {
    return this.withResolvedPath(filePath, async (sandbox, _rootPath, resolvedPath) => {
      const [buffer, details] = await Promise.all([
        sandbox.fs.downloadFile(resolvedPath),
        sandbox.fs.getFileDetails(resolvedPath).catch(() => null),
      ]);

      const content = buffer.toString("utf-8");
      const normalizedTimestamp = toIsoTimestamp(details?.modTime);

      return {
        content: content.split("\n"),
        created_at: normalizedTimestamp,
        modified_at: normalizedTimestamp,
      };
    });
  }

  async grepRaw(pattern: string, path?: string | null, glob?: string | null): Promise<GrepMatch[] | string> {
    return this.withSandboxAndRoot(async (sandbox, rootPath) => {
      const searchPath = path ? resolveSandboxPath(path, rootPath) : rootPath;
      const matches = await sandbox.fs.findFiles(searchPath, pattern);

      const normalizedMatches = matches.map((match) => ({
        path: normalizeFoundPath(match.file, searchPath),
        line: match.line,
        text: match.content,
      }));

      if (!glob) {
        return normalizedMatches;
      }

      const globbed = await sandbox.fs.searchFiles(searchPath, glob);
      const allowedPaths = new Set(
        globbed.files.map((filePath) => normalizeFoundPath(filePath, searchPath))
      );

      return normalizedMatches.filter((match) => allowedPaths.has(match.path));
    });
  }

  async globInfo(pattern: string, path?: string): Promise<FileInfo[]> {
    return this.withSandboxAndRoot(async (sandbox, rootPath) => {
      const searchPath = path ? resolveSandboxPath(path, rootPath) : rootPath;
      const results = await sandbox.fs.searchFiles(searchPath, pattern);

      return Promise.all(
        results.files.map(async (filePath) => {
          const resolvedPath = normalizeFoundPath(filePath, searchPath);
          const details = await sandbox.fs.getFileDetails(resolvedPath).catch(() => null);

          return {
            path: resolvedPath,
            is_dir: details?.isDir,
            size: details?.size,
            modified_at: details?.modTime ? toIsoTimestamp(details.modTime) : undefined,
          } satisfies FileInfo;
        })
      );
    });
  }

  async write(
    filePath: string,
    content: string | Buffer,
    encoding: BufferEncoding = "utf-8"
  ): Promise<WriteResult> {
    try {
      return await this.withResolvedPath(filePath, async (sandbox, _rootPath, resolvedPath) => {
        const existing = await getFileDetailsOrNull(sandbox, resolvedPath);
        if (existing) {
          return {
            error: `Cannot write to ${resolvedPath} because it already exists. Read and then make an edit, or write to a new path.`,
            path: resolvedPath,
          };
        }

        await ensureDirectoryExists(sandbox, parentPath(resolvedPath));
        const buffer = typeof content === "string" ? Buffer.from(content, encoding) : content;
        await sandbox.fs.uploadFile(buffer, resolvedPath);

        const fileData = await this.readRaw(filePath);

        return {
          path: resolvedPath,
          filesUpdate: {
            [resolvedPath]: fileData,
          },
        };
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async edit(filePath: string, oldString: string, newString: string, replaceAll?: boolean): Promise<EditResult> {
    try {
      return await this.withResolvedPath(filePath, async (sandbox, _rootPath, resolvedPath) => {
        const currentContent = await this.read(filePath);

        const matchRegex = replaceAll
          ? new RegExp(escapeRegexLiteral(oldString), "g")
          : new RegExp(escapeRegexLiteral(oldString));

        const occurrenceCount = (currentContent.match(matchRegex) ?? []).length;
        if (occurrenceCount === 0) {
          return {
            error: `String not found in file: \"${oldString.substring(0, 50)}${oldString.length > 50 ? "..." : ""}\"`,
            path: resolvedPath,
            occurrences: 0,
          };
        }

        const nextContent = replaceAll
          ? currentContent.replaceAll(oldString, newString)
          : currentContent.replace(oldString, newString);

        await sandbox.fs.uploadFile(Buffer.from(nextContent, "utf-8"), resolvedPath);

        const fileData = await this.readRaw(filePath);

        return {
          path: resolvedPath,
          filesUpdate: {
            [resolvedPath]: fileData,
          },
          occurrences: replaceAll ? occurrenceCount : 1,
        };
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async gitClone(params: {
    url: string;
    path: string;
    branch?: string;
    commitId?: string;
    username?: string;
    password?: string;
  }) {
    return this.withResolvedPath(params.path, async (sandbox, _rootPath, targetPath) => {
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
    });
  }

  async gitStatus(path: string) {
    return this.withResolvedPath(path, async (sandbox, _rootPath, resolvedPath) => {
      return sandbox.git.status(resolvedPath);
    });
  }

  async gitBranches(path: string) {
    return this.withResolvedPath(path, async (sandbox, _rootPath, resolvedPath) => {
      return sandbox.git.branches(resolvedPath);
    });
  }

  async gitCreateBranch(path: string, name: string) {
    return this.withResolvedPath(path, async (sandbox, _rootPath, resolvedPath) => {
      await sandbox.git.createBranch(resolvedPath, name);
      return { success: true };
    });
  }

  async gitDeleteBranch(path: string, name: string) {
    return this.withResolvedPath(path, async (sandbox, _rootPath, resolvedPath) => {
      await sandbox.git.deleteBranch(resolvedPath, name);
      return { success: true };
    });
  }

  async gitCheckoutBranch(path: string, branch: string) {
    return this.withResolvedPath(path, async (sandbox, _rootPath, resolvedPath) => {
      await sandbox.git.checkoutBranch(resolvedPath, branch);
      return { success: true };
    });
  }

  async gitAdd(path: string, files: string[]) {
    return this.withResolvedPath(path, async (sandbox, _rootPath, resolvedPath) => {
      await sandbox.git.add(resolvedPath, files);
      return { success: true };
    });
  }

  async gitCommit(path: string, params: {
    message: string;
    author: string;
    email: string;
    allowEmpty?: boolean;
  }) {
    return this.withResolvedPath(path, async (sandbox, _rootPath, resolvedPath) => {
      return sandbox.git.commit(
        resolvedPath,
        params.message,
        params.author,
        params.email,
        params.allowEmpty
      );
    });
  }

  async gitPush(path: string, username?: string, password?: string) {
    return this.withResolvedPath(path, async (sandbox, _rootPath, resolvedPath) => {
      await sandbox.git.push(resolvedPath, username, password);
      return { success: true };
    });
  }

  async gitPull(path: string, username?: string, password?: string) {
    return this.withResolvedPath(path, async (sandbox, _rootPath, resolvedPath) => {
      await sandbox.git.pull(resolvedPath, username, password);
      return { success: true };
    });
  }

  async lspStart(languageId: string, projectPath: string) {
    return this.lsp.start(languageId, projectPath);
  }

  async lspStop(languageId: string, projectPath: string) {
    return this.lsp.stop(languageId, projectPath);
  }

  async lspCompletions(params: {
    languageId: string;
    projectPath: string;
    filePath: string;
    line: number;
    character: number;
  }) {
    return this.lsp.completions(params);
  }

  async lspDocumentSymbols(languageId: string, projectPath: string, filePath: string) {
    return this.lsp.documentSymbols(languageId, projectPath, filePath);
  }

  async lspSandboxSymbols(languageId: string, projectPath: string, query: string) {
    return this.lsp.sandboxSymbols(languageId, projectPath, query);
  }

  async saveFilesToSandbox(messages: UIMessage[]): Promise<void> {
    const uploadDirectory = joinPath(await this.context.getRootPath(), "uploads");
    await this.exec(`mkdir -p ${escapeShellArg(uploadDirectory)}`);

    for (const message of messages) {
      for (const part of message.parts) {
        if (!isFileUIPart(part)) {
          continue;
        }

        const { filename, url } = part;
        if (!filename) {
          throw new Error("Cannot save attachment without filename");
        }

        const destinationPath = joinPath(uploadDirectory, filename);

        if (url.startsWith("data:")) {
          const base64Match = url.match(/^data:[^,]*;base64,(.+)$/i);
          if (!base64Match?.[1]) {
            throw new Error(`Invalid data URL for file ${filename}`);
          }

          await this.write(destinationPath, Buffer.from(base64Match[1], "base64"));
          continue;
        }

        if (!url.startsWith("https://")) {
          throw new Error(`Only https URLs are allowed for sandbox downloads: ${url}`);
        }

        const downloadResult = await this.exec(
          `curl -L --fail --silent --show-error --connect-timeout 5 --max-time 20 --max-filesize 52428800 ${escapeShellArg(url)} -o ${escapeShellArg(destinationPath)}`
        );

        if (!downloadResult.success) {
          throw new Error(`Failed to download ${url}: ${downloadResult.stderr || downloadResult.stdout}`);
        }
      }
    }
  }

  async exec(command: string, options?: {
    timeout?: number;
    cwd?: string;
    terminalId?: string;
    abortSignal?: AbortSignal;
    streamLogs?: (entry: CommandLogEntry) => void;
  }): Promise<CommandRunResult> {
    return this.pty.run(command, {
      timeoutMs: options?.timeout,
      cwd: options?.cwd,
      terminalId: options?.terminalId,
      abortSignal: options?.abortSignal,
      onLog: options?.streamLogs,
    });
  }
}
