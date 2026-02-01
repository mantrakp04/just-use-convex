import { getSandbox } from "@cloudflare/sandbox";
import {
  createTool,
  createToolkit,
  type FileInfo,
  type FileData,
  type GrepMatch,
  type WriteResult,
  type EditResult,
  type FilesystemBackend,
  type Toolkit,
} from "@voltagent/core";
import { z } from "zod";
import type { worker } from "../../alchemy.run";

export class SandboxFilesystemBackend implements FilesystemBackend {
  private sandbox: ReturnType<typeof getSandbox>;
  private rootDir: string;

  constructor(env: typeof worker.Env, sandboxName: string) {
    this.sandbox = getSandbox(env.Sandbox, sandboxName);
    this.rootDir = env.SANDBOX_ROOT_DIR;

    // Mount the R2 bucket for persistent storage
    this.sandbox.mountBucket(env.SANDBOX_BUCKET_NAME, this.rootDir, {
      endpoint: env.SANDBOX_BUCKET_ENDPOINT,
      provider: "r2",
      credentials: {
        accessKeyId: env.SANDBOX_BUCKET_ACCESS_KEY_ID,
        secretAccessKey: env.SANDBOX_BUCKET_SECRET_ACCESS_KEY,
      },
      prefix: sandboxName, // Each sandbox gets its own prefix for isolation
    });
  }

  private resolvePath(path: string): string {
    if (path.startsWith("/")) {
      return path;
    }
    return `${this.rootDir}/${path}`.replace(/\/+/g, "/");
  }

  async lsInfo(path: string): Promise<FileInfo[]> {
    const resolvedPath = this.resolvePath(path);

    try {
      const result = await this.sandbox.exec(
        `ls -la --time-style=+%Y-%m-%dT%H:%M:%S ${resolvedPath} 2>/dev/null || echo "[]"`
      );

      if (!result.success || !result.stdout.trim()) {
        return [];
      }

      const lines = result.stdout.trim().split("\n");
      const files: FileInfo[] = [];

      for (const line of lines) {
        // Skip total line and empty lines
        if (line.startsWith("total") || !line.trim()) continue;

        // Parse ls -la output: permissions links owner group size date name
        const parts = line.split(/\s+/);
        if (parts.length < 7) continue;

        const permissions = parts[0] ?? "";
        const sizeStr = parts[4];
        const size = sizeStr ? parseInt(sizeStr, 10) : NaN;
        const date = parts[5] ?? "";
        const name = parts.slice(6).join(" ");

        // Skip . and ..
        if (name === "." || name === "..") continue;

        files.push({
          path: `${resolvedPath}/${name}`.replace(/\/+/g, "/"),
          is_dir: permissions.startsWith("d"),
          size: isNaN(size) ? undefined : size,
          modified_at: date || undefined,
        });
      }

      return files;
    } catch (error) {
      console.error("lsInfo error:", error);
      return [];
    }
  }

  async read(
    filePath: string,
    offset?: number,
    limit?: number
  ): Promise<string> {
    const resolvedPath = this.resolvePath(filePath);

    let cmd = `cat "${resolvedPath}"`;
    if (offset !== undefined || limit !== undefined) {
      const start = (offset || 0) + 1; // sed is 1-indexed
      if (limit !== undefined) {
        const end = start + limit - 1;
        cmd = `sed -n '${start},${end}p' "${resolvedPath}"`;
      } else {
        cmd = `sed -n '${start},$p' "${resolvedPath}"`;
      }
    }

    const result = await this.sandbox.exec(cmd);

    if (!result.success) {
      throw new Error(`Failed to read file: ${result.stderr}`);
    }

    return result.stdout;
  }

  async readRaw(filePath: string): Promise<FileData> {
    const resolvedPath = this.resolvePath(filePath);

    const [contentResult, statResult] = await Promise.all([
      this.sandbox.exec(`cat "${resolvedPath}"`),
      this.sandbox.exec(
        `stat -c '%Y' "${resolvedPath}" 2>/dev/null || echo "0"`
      ),
    ]);

    if (!contentResult.success) {
      throw new Error(`Failed to read file: ${contentResult.stderr}`);
    }

    const modifiedTimestamp = parseInt(statResult.stdout.trim(), 10) || 0;
    const modifiedAt = new Date(modifiedTimestamp * 1000).toISOString();

    return {
      content: contentResult.stdout.split("\n"),
      created_at: modifiedAt, // Unix doesn't track creation time reliably
      modified_at: modifiedAt,
    };
  }

  async grepRaw(
    pattern: string,
    path?: string | null,
    glob?: string | null
  ): Promise<GrepMatch[] | string> {
    const searchPath = path ? this.resolvePath(path) : this.rootDir;

    // Build grep command
    let cmd: string;
    if (glob) {
      // Use find with grep for glob patterns
      cmd = `find "${searchPath}" -type f -name "${glob}" -exec grep -nH "${pattern}" {} \\; 2>/dev/null || true`;
    } else {
      cmd = `grep -rnH "${pattern}" "${searchPath}" 2>/dev/null || true`;
    }

    const result = await this.sandbox.exec(cmd);

    if (!result.stdout.trim()) {
      return [];
    }

    const matches: GrepMatch[] = [];
    const lines = result.stdout.trim().split("\n");

    for (const line of lines) {
      // Format: filepath:linenum:text
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

    const result = await this.sandbox.exec(
      `find "${searchPath}" -name "${pattern}" -printf '%p\\t%s\\t%T@\\t%y\\n' 2>/dev/null || true`
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

  async write(filePath: string, content: string): Promise<WriteResult> {
    const resolvedPath = this.resolvePath(filePath);

    try {
      // Ensure parent directory exists
      const parentDir = resolvedPath.substring(
        0,
        resolvedPath.lastIndexOf("/")
      );
      await this.sandbox.exec(`mkdir -p "${parentDir}"`);

      // Write file using sandbox's writeFile if available, otherwise use heredoc
      await this.sandbox.writeFile(resolvedPath, content);

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

  async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll?: boolean
  ): Promise<EditResult> {
    const resolvedPath = this.resolvePath(filePath);

    try {
      // Read current content
      const currentContent = await this.read(filePath);

      // Count occurrences
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

      // Perform replacement
      const newContent = replaceAll
        ? currentContent.replaceAll(oldString, newString)
        : currentContent.replace(oldString, newString);

      // Write back
      await this.sandbox.writeFile(resolvedPath, newContent);

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

  async exec(command: string, options?: { timeout?: number; cwd?: string }): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    const cwd = options?.cwd ? this.resolvePath(options.cwd) : this.rootDir;
    const cmd = `cd "${cwd}" && ${command}`;

    const result = await this.sandbox.exec(cmd);

    return {
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.success ? 0 : 1,
    };
  }
}

const SANDBOX_INSTRUCTIONS = `You have access to an isolated sandbox environment with a virtual filesystem.

## Sandbox Tools

- bash: Execute shell commands (npm, yarn, bun, cargo, git, etc.)
- ls: List files in a directory (requires absolute path)
- read_file: Read a file from the filesystem
- write_file: Write to a file in the filesystem
- edit_file: Edit a file by replacing a specific string
- glob: Find files matching a pattern (e.g., "**/*.ts")
- grep: Search for text within files

All file paths must start with a /. The working directory is /workspace by default.`;

export interface SandboxToolkitOptions {
  maxOutputChars?: number;
  logDir?: string;
}

/**
 * Creates a toolkit with all sandbox tools (bash + filesystem).
 * Uses simplified Zod schemas that are compatible with all providers.
 */
export function createSandboxToolkit(
  backend: SandboxFilesystemBackend,
  options: SandboxToolkitOptions = {}
): Toolkit {
  const maxOutputChars = options.maxOutputChars ?? 30000;
  const logDir = options.logDir ?? "/workspace/.logs";

  const bashTool = createTool({
    name: "bash",
    description: `Execute bash commands in the sandbox environment.

Use this tool for:
- Running build commands (npm, yarn, bun, cargo, etc.)
- Installing dependencies
- Running tests
- Git operations
- Any shell command that needs to be executed

The working directory is /workspace by default. Commands run in an isolated sandbox environment.

Important:
- Commands have a default timeout of 120 seconds
- For long-running commands, consider breaking them into smaller steps
- Use absolute paths or paths relative to /workspace
- If output exceeds ${maxOutputChars} characters, it will be written to a log file that you can explore using grep or read tools`,
    parameters: z.object({
      command: z.string().describe("The bash command to execute"),
      cwd: z.string().optional().describe("Working directory for the command (default: /workspace)"),
      timeout: z.number().optional().describe("Timeout in milliseconds (default: 120000)"),
    }),
    execute: async ({ command, cwd, timeout }) => {
      const result = await backend.exec(command, { cwd, timeout });

      // Format output
      const outputParts: string[] = [];

      if (result.stdout) {
        outputParts.push(result.stdout);
      }

      if (result.stderr) {
        outputParts.push(`[stderr]\n${result.stderr}`);
      }

      if (!result.success) {
        outputParts.push(`[exit code: ${result.exitCode}]`);
      }

      const fullOutput = outputParts.join("\n").trim() || "(no output)";

      // Check if output exceeds limit
      if (fullOutput.length > maxOutputChars) {
        // Generate unique log filename
        const timestamp = Date.now();
        const commandSlug = command.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "_");
        const logFile = `${logDir}/bash_${timestamp}_${commandSlug}.log`;

        // Ensure log directory exists and write the full output
        await backend.exec(`mkdir -p "${logDir}"`);
        await backend.write(logFile, fullOutput);

        // Return truncated output with pointer to log file
        const truncatedOutput = fullOutput.slice(0, maxOutputChars);
        const lineCount = fullOutput.split("\n").length;
        const truncatedLineCount = truncatedOutput.split("\n").length;

        return {
          success: result.success,
          output: truncatedOutput,
          exitCode: result.exitCode,
          truncated: true,
          logFile,
          message: `Output truncated (showing ${truncatedLineCount} of ${lineCount} lines, ${maxOutputChars} of ${fullOutput.length} chars). Full output saved to: ${logFile}. Use grep or read tools to explore the log file.`,
        };
      }

      return {
        success: result.success,
        output: fullOutput,
        exitCode: result.exitCode,
        truncated: false,
      };
    },
  });

  const lsTool = createTool({
    name: "ls",
    description: "List files and directories in a directory",
    parameters: z.object({
      path: z.string().default("/").describe("Directory path to list (default: /)"),
    }),
    execute: async ({ path }) => {
      return backend.lsInfo(path);
    },
  });

  const readFileTool = createTool({
    name: "read_file",
    description: "Read the contents of a file",
    parameters: z.object({
      file_path: z.string().describe("Absolute path to the file to read"),
      offset: z.number().default(0).describe("Line offset to start reading from (0-indexed)"),
      limit: z.number().default(2000).describe("Maximum number of lines to read"),
    }),
    execute: async ({ file_path, offset, limit }) => {
      return backend.read(file_path, offset, limit);
    },
  });

  const writeFileTool = createTool({
    name: "write_file",
    description: "Write content to a new file. Returns an error if the file already exists",
    parameters: z.object({
      file_path: z.string().describe("Absolute path to the file to write"),
      content: z.string().describe("Content to write to the file"),
    }),
    execute: async ({ file_path, content }) => {
      return backend.write(file_path, content);
    },
  });

  const editFileTool = createTool({
    name: "edit_file",
    description: "Edit a file by replacing a specific string with a new string",
    parameters: z.object({
      file_path: z.string().describe("Absolute path to the file to edit"),
      old_string: z.string().describe("String to be replaced (must match exactly)"),
      new_string: z.string().describe("String to replace with"),
      replace_all: z.boolean().default(false).describe("Whether to replace all occurrences"),
    }),
    execute: async ({ file_path, old_string, new_string, replace_all }) => {
      return backend.edit(file_path, old_string, new_string, replace_all);
    },
  });

  const globTool = createTool({
    name: "glob",
    description: "Find files matching a glob pattern (e.g., '**/*.ts' for all TypeScript files)",
    parameters: z.object({
      pattern: z.string().describe("Glob pattern (e.g., '*.ts', '**/*.ts')"),
      path: z.string().default("/").describe("Base path to search from (default: /)"),
    }),
    execute: async ({ pattern, path }) => {
      return backend.globInfo(pattern, path);
    },
  });

  // Use z.string().optional() instead of z.string().optional().nullable()
  // to avoid the {"not": {}} schema pattern that some providers don't support
  const grepTool = createTool({
    name: "grep",
    description: "Search for a regex pattern in files. Returns matching files and line numbers",
    parameters: z.object({
      pattern: z.string().describe("Regex pattern to search for"),
      path: z.string().default("/").describe("Base path to search from (default: /)"),
      glob: z.string().optional().describe("Optional glob pattern to filter files (e.g., '*.ts')"),
    }),
    execute: async ({ pattern, path, glob }) => {
      return backend.grepRaw(pattern, path, glob ?? null);
    },
  });

  return createToolkit({
    name: "sandbox",
    description: "Sandbox tools for executing commands and managing files in an isolated environment",
    instructions: SANDBOX_INSTRUCTIONS,
    tools: [bashTool, lsTool, readFileTool, writeFileTool, editFileTool, globTool, grepTool],
  });
}
