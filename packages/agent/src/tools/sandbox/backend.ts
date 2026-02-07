import { Daytona } from "@daytonaio/sdk";
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
  private static daytonaClient: Daytona | null = null;
  private static sandboxByName = new Map<string, ReturnType<Daytona["get"]>>();
  private env: typeof worker.Env;
  private sandboxName: string;
  public rootDir: string;

  constructor(env: typeof worker.Env, sandboxName: string) {
    this.env = env;
    this.sandboxName = sandboxName;
    this.rootDir = env.SANDBOX_ROOT_DIR;
  }

  private resolvePath(path: string): string {
    if (path.startsWith("/")) {
      return path;
    }
    return `${this.rootDir}/${path}`.replace(/\/+/g, "/");
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

  private async runCommand(command: string, options?: { cwd?: string; timeoutSeconds?: number }) {
    const sandbox = await this.getSandbox();
    const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.rootDir;
    const timeoutSeconds = options?.timeoutSeconds
      ? Math.max(1, Math.ceil(options.timeoutSeconds))
      : undefined;
    const response = await sandbox.process.executeCommand(command, cwd, undefined, timeoutSeconds);
    const exitCode = response.exitCode ?? 0;
    const result = response.result ?? "";
    const stdout = typeof result === "string" ? result : JSON.stringify(result);
    const stderr = exitCode === 0 ? "" : stdout;

    return {
      success: exitCode === 0,
      stdout,
      stderr,
      exitCode,
    };
  }

  async lsInfo(path: string): Promise<FileInfo[]> {
    const resolvedPath = this.resolvePath(path);

    try {
      const result = await this.runCommand(
        `ls -la --time-style=+%Y-%m-%dT%H:%M:%S ${escapeShellArg(resolvedPath)} 2>/dev/null || echo "[]"`
      );

      if (!result.success || !result.stdout.trim()) {
        return [];
      }

      const lines = result.stdout.trim().split("\n");
      const files: FileInfo[] = [];

      for (const line of lines) {
        if (line.startsWith("total") || !line.trim()) continue;

        const parts = line.split(/\s+/);
        if (parts.length < 7) continue;

        const permissions = parts[0] ?? "";
        const sizeStr = parts[4];
        const size = sizeStr ? parseInt(sizeStr, 10) : NaN;
        const date = parts[5] ?? "";
        const name = parts.slice(6).join(" ");

        if (name === "." || name === "..") continue;

        files.push({
          path: `${resolvedPath}/${name}`.replace(/\/+/g, "/"),
          is_dir: permissions.startsWith("d"),
          size: isNaN(size) ? undefined : size,
          modified_at: date || undefined,
        });
      }

      return files;
    } catch {
      return [];
    }
  }

  async read(filePath: string, offset?: number, limit?: number): Promise<string> {
    const resolvedPath = this.resolvePath(filePath);

    let cmd = `cat ${escapeShellArg(resolvedPath)}`;
    if (offset !== undefined || limit !== undefined) {
      const start = (offset || 0) + 1;
      if (limit !== undefined) {
        const end = start + limit - 1;
        cmd = `sed -n '${start},${end}p' ${escapeShellArg(resolvedPath)}`;
      } else {
        cmd = `sed -n '${start},$p' ${escapeShellArg(resolvedPath)}`;
      }
    }

    const result = await this.runCommand(cmd);

    if (!result.success) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }

    return result.stdout;
  }

  async readRaw(filePath: string): Promise<FileData> {
    const resolvedPath = this.resolvePath(filePath);

    const [contentResult, statResult] = await Promise.all([
      this.runCommand(`cat ${escapeShellArg(resolvedPath)}`),
      this.runCommand(
        `stat -c '%Y' ${escapeShellArg(resolvedPath)} 2>/dev/null || echo "0"`
      ),
    ]);

    if (!contentResult.success) {
      throw new Error(`Failed to read file: ${contentResult.stderr}`);
    }

    const modifiedTimestamp = parseInt(statResult.stdout.trim(), 10) || 0;
    const modifiedAt = new Date(modifiedTimestamp * 1000).toISOString();

    return {
      content: contentResult.stdout.split("\n"),
      created_at: modifiedAt,
      modified_at: modifiedAt,
    };
  }

  async grepRaw(pattern: string, path?: string | null, glob?: string | null): Promise<GrepMatch[] | string> {
    const searchPath = path ? this.resolvePath(path) : this.rootDir;

    let cmd: string;
    if (glob) {
      cmd = `find ${escapeShellArg(searchPath)} -type f -name ${escapeShellArg(glob)} -exec grep -nH ${escapeShellArg(pattern)} {} \\; 2>/dev/null || true`;
    } else {
      cmd = `grep -rnH ${escapeShellArg(pattern)} ${escapeShellArg(searchPath)} 2>/dev/null || true`;
    }

    const result = await this.runCommand(cmd);

    if (!result.stdout.trim()) {
      return [];
    }

    const matches: GrepMatch[] = [];
    const lines = result.stdout.trim().split("\n");

    for (const line of lines) {
      const match = line.match(/^(.+?):(\d+):(.*)$/);
      if (match && match[1] && match[2] && match[3] !== undefined) {
        matches.push({
          path: match[1],
          line: parseInt(match[2], 10),
          text: match[3],
        });
      }
    }

    return matches;
  }

  async globInfo(pattern: string, path?: string): Promise<FileInfo[]> {
    const searchPath = path ? this.resolvePath(path) : this.rootDir;

    const result = await this.runCommand(
      `find ${escapeShellArg(searchPath)} -name ${escapeShellArg(pattern)} -printf '%p\\t%s\\t%T@\\t%y\\n' 2>/dev/null || true`
    );

    if (!result.stdout.trim()) {
      return [];
    }

    const files: FileInfo[] = [];
    const lines = result.stdout.trim().split("\n");

    for (const line of lines) {
      const [filePath, size, mtime, type] = line.split("\t");
      if (!filePath) continue;

      files.push({
        path: filePath,
        is_dir: type === "d",
        size: size ? parseInt(size, 10) : undefined,
        modified_at: mtime
          ? new Date(parseFloat(mtime) * 1000).toISOString()
          : undefined,
      });
    }

    return files;
  }

  async write(filePath: string, content: string, encoding: BufferEncoding = "utf-8"): Promise<WriteResult> {
    const resolvedPath = this.resolvePath(filePath);

    try {
      const parentDir = resolvedPath.substring(0, resolvedPath.lastIndexOf("/"));
      await this.runCommand(`mkdir -p ${escapeShellArg(parentDir)}`);
      const sandbox = await this.getSandbox();
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
    const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.rootDir;
    const cmd = `cd ${escapeShellArg(cwd)} && ${command}`;
    const streamLogs = options?.streamLogs;

    if (!streamLogs) {
      const result = await this.runCommand(cmd, { timeoutSeconds: options?.timeout });

      return {
        success: result.success,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.success ? 0 : 1,
      };
    }

    const sandbox = await this.getSandbox();
    const sessionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await sandbox.process.createSession(sessionId);

    let stdout = "";
    let stderr = "";
    let commandId: string | undefined;

    try {
      const runResponse = await sandbox.process.executeSessionCommand(sessionId, {
        command: cmd,
        runAsync: true,
      });
      commandId = runResponse.cmdId;

      if (!commandId) {
        const fallbackStdout = runResponse.stdout ?? "";
        const fallbackStderr = runResponse.stderr ?? "";
        if (fallbackStdout) {
          streamLogs({ type: "stdout", message: fallbackStdout });
        }
        if (fallbackStderr) {
          streamLogs({ type: "stderr", message: fallbackStderr });
        }
        return {
          success: (runResponse.exitCode ?? 1) === 0,
          stdout: fallbackStdout,
          stderr: fallbackStderr,
          exitCode: runResponse.exitCode ?? 1,
        };
      }

      const logStreamPromise = sandbox.process
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

      const timeoutMs = options?.timeout ? Math.max(1, Math.ceil(options.timeout * 1000)) : undefined;
      const startedAt = Date.now();
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

      await logStreamPromise;

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
}
