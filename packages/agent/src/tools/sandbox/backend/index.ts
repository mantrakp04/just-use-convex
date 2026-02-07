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
import { escapeShellArg } from "../shared";
import {
  LSP_IDLE_TTL_MS,
  getLspCache,
  getSandbox,
  type SandboxInstance,
} from "./daytona";
import { runSandboxCommand } from "./exec";
import { ensureDirectory, getFileDetailsOrNull } from "./fs-utils";
import {
  escapeRegex,
  getParentDir,
  joinPath,
  normalizeReturnedPath,
  normalizeRootDir,
  normalizeTimestamp,
  resolvePath,
} from "./path-utils";

export class SandboxFilesystemBackend implements FilesystemBackend {
  private env: typeof worker.Env;
  private sandboxName: string;
  private rootDir: string | null = null;

  constructor(env: typeof worker.Env, sandboxName: string) {
    this.env = env;
    this.sandboxName = sandboxName;
  }

  private async getSandbox(): Promise<SandboxInstance> {
    return getSandbox(this.env, this.sandboxName);
  }

  private async ensureRootDir(sandbox?: SandboxInstance): Promise<string> {
    if (this.rootDir) {
      return this.rootDir;
    }

    const targetSandbox = sandbox ?? await this.getSandbox();
    const workDir = await targetSandbox.getWorkDir();
    this.rootDir = normalizeRootDir(workDir!);

    return this.rootDir;
  }

  private async withSandboxContext<T>(
    callback: (sandbox: SandboxInstance, rootDir: string) => Promise<T>
  ): Promise<T> {
    const sandbox = await this.getSandbox();
    const rootDir = await this.ensureRootDir(sandbox);
    return callback(sandbox, rootDir);
  }

  private async withResolvedPath<T>(
    path: string,
    callback: (sandbox: SandboxInstance, rootDir: string, resolvedPath: string) => Promise<T>
  ): Promise<T> {
    return this.withSandboxContext(async (sandbox, rootDir) => {
      const resolvedPath = resolvePath(path, rootDir);
      return callback(sandbox, rootDir, resolvedPath);
    });
  }

  async getWorkingDirectory(): Promise<string> {
    return this.ensureRootDir();
  }

  private async cleanupIdleLspServers(): Promise<void> {
    const cache = getLspCache(this.sandboxName);
    const now = Date.now();

    for (const [key, entry] of cache) {
      if (now - entry.lastUsedAt < LSP_IDLE_TTL_MS) {
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

    const cache = getLspCache(this.sandboxName);
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
    try {
      return await this.withResolvedPath(path, async (sandbox, _rootDir, resolvedPath) => {
        const files = await sandbox.fs.listFiles(resolvedPath);

        return files.map((file) => ({
          path: joinPath(resolvedPath, file.name),
          is_dir: file.isDir,
          size: file.size,
          modified_at: file.modTime ? normalizeTimestamp(file.modTime) : undefined,
        }));
      });
    } catch {
      return [];
    }
  }

  async read(filePath: string, offset?: number, limit?: number): Promise<string> {
    return this.withResolvedPath(filePath, async (sandbox, _rootDir, resolvedPath) => {
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
    return this.withResolvedPath(filePath, async (sandbox, _rootDir, resolvedPath) => {
      const [rawBuffer, details] = await Promise.all([
        sandbox.fs.downloadFile(resolvedPath),
        sandbox.fs.getFileDetails(resolvedPath).catch(() => null),
      ]);
      const content = rawBuffer.toString("utf-8");
      const modifiedAt = normalizeTimestamp(details?.modTime);

      return {
        content: content.split("\n"),
        created_at: modifiedAt,
        modified_at: modifiedAt,
      };
    });
  }

  async grepRaw(pattern: string, path?: string | null, glob?: string | null): Promise<GrepMatch[] | string> {
    try {
      return await this.withSandboxContext(async (sandbox, rootDir) => {
        const searchPath = path ? resolvePath(path, rootDir) : rootDir;
        const matches = await sandbox.fs.findFiles(searchPath, pattern);
        if (!matches.length) {
          return [];
        }

        const normalizedMatches = matches.map((match) => ({
          path: normalizeReturnedPath(match.file, searchPath),
          line: match.line,
          text: match.content,
        }));

        if (!glob) {
          return normalizedMatches;
        }

        const globMatches = await sandbox.fs.searchFiles(searchPath, glob);
        const allowedPaths = new Set(
          globMatches.files.map((file) => normalizeReturnedPath(file, searchPath))
        );

        return normalizedMatches.filter((match) => allowedPaths.has(match.path));
      });
    } catch {
      return [];
    }
  }

  async globInfo(pattern: string, path?: string): Promise<FileInfo[]> {
    try {
      return await this.withSandboxContext(async (sandbox, rootDir) => {
        const searchPath = path ? resolvePath(path, rootDir) : rootDir;
        const results = await sandbox.fs.searchFiles(searchPath, pattern);
        if (!results.files.length) {
          return [];
        }

        const detailedResults = await Promise.all(
          results.files.map(async (filePath) => {
            const resolvedFilePath = normalizeReturnedPath(filePath, searchPath);
            const details = await sandbox.fs.getFileDetails(resolvedFilePath).catch(() => null);
            return {
              path: resolvedFilePath,
              is_dir: details?.isDir,
              size: details?.size,
              modified_at: details?.modTime
                ? normalizeTimestamp(details.modTime)
                : undefined,
            } satisfies FileInfo;
          })
        );

        return detailedResults;
      });
    } catch {
      return [];
    }
  }

  async write(
    filePath: string,
    content: string | Buffer,
    encoding: BufferEncoding = "utf-8"
  ): Promise<WriteResult> {
    try {
      return await this.withResolvedPath(filePath, async (sandbox, _rootDir, resolvedPath) => {
        const existing = await getFileDetailsOrNull(sandbox, resolvedPath);
        if (existing) {
          return {
            error: `Cannot write to ${resolvedPath} because it already exists. Read and then make an edit, or write to a new path.`,
            path: resolvedPath,
          };
        }

        const parentDir = getParentDir(resolvedPath);
        await ensureDirectory(sandbox, parentDir);
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
      return await this.withResolvedPath(filePath, async (sandbox, _rootDir, resolvedPath) => {
        const currentContent = await this.read(filePath);

        const regex = replaceAll
          ? new RegExp(escapeRegex(oldString), "g")
          : new RegExp(escapeRegex(oldString));

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

        await sandbox.fs.uploadFile(Buffer.from(newContent, "utf-8"), resolvedPath);

        const fileData = await this.readRaw(filePath);

        return {
          path: resolvedPath,
          filesUpdate: {
            [resolvedPath]: fileData,
          },
          occurrences: replaceAll ? occurrences : 1,
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
    return this.withResolvedPath(params.path, async (sandbox, _rootDir, targetPath) => {
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
    return this.withResolvedPath(path, async (sandbox, _rootDir, resolvedPath) => {
      return sandbox.git.status(resolvedPath);
    });
  }

  async gitBranches(path: string) {
    return this.withResolvedPath(path, async (sandbox, _rootDir, resolvedPath) => {
      return sandbox.git.branches(resolvedPath);
    });
  }

  async gitCreateBranch(path: string, name: string) {
    return this.withResolvedPath(path, async (sandbox, _rootDir, resolvedPath) => {
      await sandbox.git.createBranch(resolvedPath, name);
      return {
        success: true,
      };
    });
  }

  async gitDeleteBranch(path: string, name: string) {
    return this.withResolvedPath(path, async (sandbox, _rootDir, resolvedPath) => {
      await sandbox.git.deleteBranch(resolvedPath, name);
      return {
        success: true,
      };
    });
  }

  async gitCheckoutBranch(path: string, branch: string) {
    return this.withResolvedPath(path, async (sandbox, _rootDir, resolvedPath) => {
      await sandbox.git.checkoutBranch(resolvedPath, branch);
      return {
        success: true,
      };
    });
  }

  async gitAdd(path: string, files: string[]) {
    return this.withResolvedPath(path, async (sandbox, _rootDir, resolvedPath) => {
      await sandbox.git.add(resolvedPath, files);
      return {
        success: true,
      };
    });
  }

  async gitCommit(path: string, params: {
    message: string;
    author: string;
    email: string;
    allowEmpty?: boolean;
  }) {
    return this.withResolvedPath(path, async (sandbox, _rootDir, resolvedPath) => {
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
    return this.withResolvedPath(path, async (sandbox, _rootDir, resolvedPath) => {
      await sandbox.git.push(resolvedPath, username, password);
      return {
        success: true,
      };
    });
  }

  async gitPull(path: string, username?: string, password?: string) {
    return this.withResolvedPath(path, async (sandbox, _rootDir, resolvedPath) => {
      await sandbox.git.pull(resolvedPath, username, password);
      return {
        success: true,
      };
    });
  }

  async lspStart(languageId: string, projectPath: string) {
    const rootDir = await this.ensureRootDir();
    const resolvedProjectPath = resolvePath(projectPath, rootDir);
    await this.getOrCreateLspServer(languageId, resolvedProjectPath);
    return {
      languageId,
      projectPath: resolvedProjectPath,
      started: true,
    };
  }

  async lspStop(languageId: string, projectPath: string) {
    const rootDir = await this.ensureRootDir();
    const resolvedProjectPath = resolvePath(projectPath, rootDir);
    const key = this.buildLspCacheKey(languageId, resolvedProjectPath);
    const cache = getLspCache(this.sandboxName);
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
    const rootDir = await this.ensureRootDir();
    const resolvedProjectPath = resolvePath(params.projectPath, rootDir);
    const resolvedFilePath = resolvePath(params.filePath, rootDir);
    const server = await this.getOrCreateLspServer(params.languageId, resolvedProjectPath);
    await server.didOpen(resolvedFilePath).catch(() => {});
    return server.completions(resolvedFilePath, {
      line: params.line,
      character: params.character,
    });
  }

  async lspDocumentSymbols(languageId: string, projectPath: string, filePath: string) {
    const rootDir = await this.ensureRootDir();
    const resolvedProjectPath = resolvePath(projectPath, rootDir);
    const resolvedFilePath = resolvePath(filePath, rootDir);
    const server = await this.getOrCreateLspServer(languageId, resolvedProjectPath);
    await server.didOpen(resolvedFilePath).catch(() => {});
    return server.documentSymbols(resolvedFilePath);
  }

  async lspSandboxSymbols(languageId: string, projectPath: string, query: string) {
    const rootDir = await this.ensureRootDir();
    const resolvedProjectPath = resolvePath(projectPath, rootDir);
    const server = await this.getOrCreateLspServer(languageId, resolvedProjectPath);
    return server.sandboxSymbols(query);
  }

  async saveFilesToSandbox(messages: UIMessage[]): Promise<void> {
    const uploadDir = joinPath(await this.ensureRootDir(), "uploads");
    await this.exec(`mkdir -p ${escapeShellArg(uploadDir)}`);

    for (const msg of messages) {
      for (const part of msg.parts) {
        if (!isFileUIPart(part)) continue;

        const { url, filename } = part;
        if (!filename) continue;
        const filePath = `${uploadDir}/${filename}`;

        try {
          if (url.startsWith("data:")) {
            const base64Match = url.match(/^data:[^,]*;base64,(.+)$/i);
            if (base64Match?.[1]) {
              await this.write(filePath, Buffer.from(base64Match[1], "base64"));
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
          // intentionally ignore individual file-save failures
        }
      }
    }
  }

  async exec(command: string, options?: {
    timeout?: number;
    cwd?: string;
    terminalId?: string;
    abortSignal?: AbortSignal;
    streamLogs?: (entry: { type: "stdout" | "stderr" | "info" | "error"; message: string }) => void;
  }): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    terminalId?: string;
  }> {
    return this.withSandboxContext(async (sandbox, rootDir) => {
      return runSandboxCommand(sandbox, this.sandboxName, command, rootDir, resolvePath, options);
    });
  }
}
