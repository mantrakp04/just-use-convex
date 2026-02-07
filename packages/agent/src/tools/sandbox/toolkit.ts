import { createTool, createToolkit, type Toolkit } from "@voltagent/core";
import { z } from "zod";
import { type BackgroundTaskStore, type WrappedExecuteOptions, createWrappedTool } from "../utils/wrapper";
import { SandboxFilesystemBackend } from "./backend";
import { escapeShellArg } from "./shared";

export interface SandboxToolkitOptions {
  store: BackgroundTaskStore;
  maxOutputChars?: number;
  logDir?: string;
}

export function createSandboxToolkit(
  backend: SandboxFilesystemBackend,
  options: SandboxToolkitOptions
): Toolkit {
  const { store, maxOutputChars = 30000, logDir = "/workspace/.logs" } = options;

  const bashTool = createWrappedTool({
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
- Commands have a default timeout of 5 minutes, then auto-convert to background task
- For known long-running commands, use the background option to run asynchronously from the start
- Use absolute paths or paths relative to /workspace
- If output exceeds ${maxOutputChars} characters, it will be written to a log file that you can explore using grep or read tools`,
    parameters: z.object({
      command: z.string().describe("The bash command to execute"),
      cwd: z.string().optional().describe("Working directory for the command (default: /workspace)"),
    }),
    store,
    toolCallConfig: {
      maxDuration: 5 * 60 * 1000,
      allowAgentSetDuration: true,
      allowBackground: true,
    },
    execute: async (args, options?: WrappedExecuteOptions) => {
      const command = args.command as string;
      const cwd = args.cwd as string | undefined;
      const result = await backend.exec(command, {
        cwd,
        timeout: options?.timeout,
        abortSignal: options?.toolContext?.abortSignal ?? options?.abortController?.signal,
        streamLogs: options?.streamLogs ?? options?.log,
      });

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

      if (fullOutput.length > maxOutputChars) {
        const timestamp = Date.now();
        const commandSlug = command.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "_");
        const logFile = `${logDir}/bash_${timestamp}_${commandSlug}.log`;

        await backend.exec(`mkdir -p ${escapeShellArg(logDir)}`);
        await backend.write(logFile, fullOutput);

        const truncatedOutput = fullOutput.slice(0, maxOutputChars);
        const lineCount = fullOutput.split("\n").length;
        const truncatedLineCount = truncatedOutput.split("\n").length;

        return {
          success: result.success,
          output: truncatedOutput,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          truncated: true,
          logFile,
          message: `Output truncated (showing ${truncatedLineCount} of ${lineCount} lines, ${maxOutputChars} of ${fullOutput.length} chars). Full output saved to: ${logFile}. Use grep or read tools to explore the log file.`,
        };
      }

      return {
        success: result.success,
        output: fullOutput,
        stdout: result.stdout,
        stderr: result.stderr,
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
    instructions: SANDBOX_INSTRUCTIONS(backend.rootDir),
    tools: [bashTool, lsTool, readFileTool, writeFileTool, editFileTool, globTool, grepTool],
  });
}

export const SANDBOX_INSTRUCTIONS = (rootDir: string) => `You have access to an isolated sandbox environment with a virtual filesystem in ${rootDir}.

## Tool Usage

You have access to filesystem tools (read_file, write_file, edit_file, ls, glob, grep) and can delegate complex subtasks to specialized subagents via the task tool.

Guidelines:
- Read files before modifying them to understand existing code
- Use grep/glob to locate relevant files before diving in
- Prefer editing existing files over creating new ones
- Make minimal, focused changes that solve the specific problem

## Code Execution (Sandbox)

You can execute code in isolated Daytona sandboxes. This provides a secure environment for:
- Running shell commands and scripts
- Installing dependencies (npm, pip, etc.)
- Executing code in various languages (Python, Node.js, etc.)
- Testing code before committing changes

Sandbox guidelines:
- Use sandboxes for any code that needs to run, not just for viewing
- Prefer streaming output for long-running commands to provide real-time feedback
- Clean up resources when done (delete files, stop processes)
- Handle command failures gracefully and report errors clearly
- Never execute untrusted code without sandboxing it first

## Code Quality

When writing or modifying code:
- Follow existing patterns and conventions in the codebase
- Keep changes focused and avoid scope creep
- Don't add unnecessary abstractions, comments, or "improvements" beyond what's requested
- Consider edge cases and error handling where appropriate
`;
