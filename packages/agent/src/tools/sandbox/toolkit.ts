import { createTool, createToolkit, type Toolkit } from "@voltagent/core";
import { z } from "zod";
import { type BackgroundTaskStoreApi, type WrappedExecuteOptions, createWrappedTool } from "../utils/wrapper";
import { SandboxFilesystemBackend } from "./backend";
import { escapeShellArg } from "./shared";

export interface SandboxToolkitOptions {
  store: BackgroundTaskStoreApi;
  maxOutputChars?: number;
}

export function createSandboxToolkit(
  backend: SandboxFilesystemBackend,
  options: SandboxToolkitOptions
): Toolkit {
  const { store, maxOutputChars = 30000 } = options;

  const bashTool = createWrappedTool({
    name: "bash",
    description: `Execute bash commands in the sandbox environment.

Use this tool for:
- Running build commands (npm, yarn, bun, cargo, etc.)
- Installing dependencies
- Running tests
- Any shell command that needs to be executed

The working directory defaults to the sandbox workdir. Commands run in an isolated sandbox environment.

Important:
- Commands have a default timeout of 5 minutes, then auto-convert to background task
- For known long-running commands, use the background option to run asynchronously from the start
- Use absolute paths or paths relative to the sandbox workdir
- Reuse terminal_id when you need persistent shell state across multiple commands
- If output exceeds ${maxOutputChars} characters, it will be written to a log file that you can explore using grep or read tools`,
    parameters: z.object({
      command: z.string().describe("The bash command to execute"),
      cwd: z.string().optional().describe("Working directory for the command (default: sandbox workdir)"),
      terminal_id: z.string().optional().describe("Optional terminal ID to reuse the same PTY session across multiple bash calls"),
    }),
    store,
    toolCallConfig: {
      maxDuration: 5 * 60 * 1000,
      allowAgentSetDuration: true,
      allowBackground: true,
    },
    execute: async (args, wrappedOptions?: WrappedExecuteOptions) => {
      const command = args.command as string;
      const cwd = args.cwd as string | undefined;
      const terminalId = args.terminal_id as string | undefined;
      const result = await backend.exec(command, {
        cwd,
        terminalId,
        timeout: wrappedOptions?.timeout,
        abortSignal: wrappedOptions?.toolContext?.abortSignal ?? wrappedOptions?.abortController?.signal,
        streamLogs: wrappedOptions?.streamLogs ?? wrappedOptions?.log,
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
        const effectiveLogDir = "/tmp/.output";
        const timestamp = Date.now();
        const commandSlug = command.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "_");
        const logFile = `${effectiveLogDir}/bash_${timestamp}_${commandSlug}.log`;

        await backend.exec(`mkdir -p ${escapeShellArg(effectiveLogDir)}`);
        await backend.write(logFile, fullOutput);

        const truncatedOutput = fullOutput.slice(0, maxOutputChars);
        const lineCount = fullOutput.split("\n").length;
        const truncatedLineCount = truncatedOutput.split("\n").length;

        const truncatedResult = {
          success: result.success,
          output: truncatedOutput,
          exitCode: result.exitCode,
          truncated: true,
          ...(result.terminalId ? { terminal_id: result.terminalId } : {}),
          logFile,
          message: `Output truncated (showing ${truncatedLineCount} of ${lineCount} lines, ${maxOutputChars} of ${fullOutput.length} chars). Full output saved to: ${logFile}. Use grep or read tools to explore the log file.`,
        };

        if (!result.success) {
          throw new Error(
            `Command failed with exit code ${result.exitCode}\n${truncatedResult.output}\n${truncatedResult.message}`
          );
        }

        return truncatedResult;
      }

      const commandResult = {
        success: result.success,
        output: fullOutput,
        exitCode: result.exitCode,
        truncated: false,
        ...(result.terminalId ? { terminal_id: result.terminalId } : {}),
      };

      if (!result.success) {
        throw new Error(`Command failed with exit code ${result.exitCode}\n${commandResult.output}`);
      }

      return commandResult;
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
      file_path: z.string().describe("Path to the file to read (absolute or relative to sandbox workdir)"),
      offset: z.number().default(0).describe("Line offset to start reading from (0-indexed)"),
      limit: z.number().default(2000).describe("Maximum number of lines to read"),
    }),
    execute: async ({ file_path, offset, limit }) => {
      return backend.read(file_path, offset, limit);
    },
  });

  const writeFileTool = createTool({
    name: "write_file",
    description: "Write content to a new file. Returns an error if the file already exists. Can optionally run LSP symbols for the written file.",
    parameters: z.object({
      file_path: z.string().describe("Path to the file to write (absolute or relative to sandbox workdir)"),
      content: z.string().describe("Content to write to the file"),
      run_lsp: z.boolean().default(false).describe("Run LSP symbol extraction for the file after writing"),
      project_path: z.string().optional().describe("Project root path for LSP (defaults to sandbox workdir)"),
    }),
    execute: async ({ file_path, content, run_lsp, project_path }) => {
      const result = await backend.write(file_path, content);
      if ("error" in result && result.error) {
        throw new Error(result.error);
      }

      const payload = {
        path: result.path,
      };

      if (!run_lsp) {
        return payload;
      }

      const lowerFilePath = file_path.toLowerCase();
      const languageId = lowerFilePath.endsWith(".py")
        ? "python"
        : lowerFilePath.endsWith(".js") || lowerFilePath.endsWith(".jsx") || lowerFilePath.endsWith(".mjs")
          ? "javascript"
          : "typescript";
      const lspProjectPath = (project_path?.trim() || ".");

      try {
        const symbols = await backend.lspDocumentSymbols(
          languageId,
          lspProjectPath,
          file_path
        );
        return {
          ...payload,
          lsp: {
            language_id: languageId,
            project_path: lspProjectPath,
            symbols,
          },
        };
      } catch (error) {
        return {
          ...payload,
          lsp: {
            language_id: languageId,
            project_path: lspProjectPath,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  });

  const editFileTool = createTool({
    name: "edit_file",
    description: "Edit a file by replacing a specific string with a new string",
    parameters: z.object({
      file_path: z.string().describe("Path to the file to edit (absolute or relative to sandbox workdir)"),
      old_string: z.string().describe("String to be replaced (must match exactly)"),
      new_string: z.string().describe("String to replace with"),
      replace_all: z.boolean().default(false).describe("Whether to replace all occurrences"),
    }),
    execute: async ({ file_path, old_string, new_string, replace_all }) => {
      const result = await backend.edit(file_path, old_string, new_string, replace_all);
      if ("error" in result && result.error) {
        throw new Error(result.error);
      }
      return result;
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

  const lspTool = createTool({
    name: "lsp",
    description: "Run Language Server Protocol operations. Server startup is automatic based on language_id and project_path.",
    parameters: z.object({
      operation: z
        .enum(["completions", "document_symbols", "sandbox_symbols", "start", "stop"])
        .describe("LSP operation to run"),
      language_id: z.enum(["typescript", "javascript", "python"]).describe("LSP language id"),
      project_path: z.string().describe("Project root path for the LSP server"),
      file_path: z.string().optional().describe("File path (required for completions and document_symbols)"),
      line: z.number().int().min(0).optional().describe("Zero-based line number (required for completions)"),
      character: z.number().int().min(0).optional().describe("Zero-based character index (required for completions)"),
      query: z.string().optional().describe("Symbol query (required for sandbox_symbols)"),
    }),
    execute: async (args) => {
      const { operation, language_id, project_path, file_path, line, character, query } = args;

      switch (operation) {
        case "start":
          return backend.lspStart(language_id, project_path);
        case "stop":
          return backend.lspStop(language_id, project_path);
        case "completions":
          if (!file_path || line === undefined || character === undefined) {
            throw new Error("completions requires file_path, line, and character");
          }
          return backend.lspCompletions({
            languageId: language_id,
            projectPath: project_path,
            filePath: file_path,
            line,
            character,
          });
        case "document_symbols":
          if (!file_path) {
            throw new Error("document_symbols requires file_path");
          }
          return backend.lspDocumentSymbols(language_id, project_path, file_path);
        case "sandbox_symbols":
          if (!query) {
            throw new Error("sandbox_symbols requires query");
          }
          return backend.lspSandboxSymbols(language_id, project_path, query);
      }
    },
  });

  return createToolkit({
    name: "sandbox",
    description: "Sandbox tools for executing commands and managing files in an isolated environment",
    instructions: SANDBOX_INSTRUCTIONS,
    tools: [
      bashTool,
      lsTool,
      readFileTool,
      writeFileTool,
      editFileTool,
      globTool,
      grepTool,
      lspTool,
    ],
  });
}

export const SANDBOX_INSTRUCTIONS = `You have access to an isolated sandbox environment with a virtual filesystem in the sandbox workdir.
The workdir is resolved dynamically from the sandbox filesystem (Daytona).

## Tool Usage

You have access to filesystem tools (read_file, write_file, edit_file, ls, glob, grep) and a single LSP tool (lsp).

Guidelines:
- Read files before modifying them to understand existing code
- Use grep/glob to locate relevant files before diving in
- Prefer editing existing files over creating new ones
- Make minimal, focused changes that solve the specific problem
- Prefer the lsp tool for symbol search and completions in TypeScript/JavaScript/Python projects

## Code Execution (Sandbox)

You can execute code in isolated Daytona sandboxes. This provides a secure environment for:
- Running shell commands and scripts
- Installing dependencies (npm, pip, etc.)
- Executing code in various languages (Python, Node.js, etc.)
- Testing code before committing changes

Sandbox guidelines:
- Use sandboxes for any code that needs to run, not just for viewing
- Prefer streaming output for long-running commands to provide real-time feedback
- Reuse terminal_id for stateful terminal workflows that span multiple commands
- Use bash when an operation is not covered by dedicated filesystem/LSP tools
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
