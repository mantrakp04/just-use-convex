import { type InterpreterContext } from '@daytonaio/toolbox-api-client';
import { Daytona, type Sandbox } from '@daytonaio/sdk';
import { createTool, type Toolkit } from '@voltagent/core';
import { SandboxPtyService } from './pty';
import {
  editSchema,
  execSchema,
  generateDownloadUrlSchema,
  globSchema,
  grepSchema,
  listSchema,
  readLogsSchema,
  readSchema,
  statefulCodeExecSchema,
  writeSchema,
} from './types';

const codeInterpreterContexts = new Map<string, InterpreterContext>();

export async function createDaytonaToolkit(daytona: Daytona, sandbox: Sandbox): Promise<Toolkit> {
  const list = createTool({
    name: 'list',
    description:
      'List files and directories in the configured Daytona sandbox path. Returns entries with metadata.',
    parameters: listSchema,
    execute: async (input) => {
      return sandbox.fs.listFiles(input.path);
    },
  });

  const read = createTool({
    name: 'read',
    description: 'Read file contents from the configured Daytona sandbox with line offset and limit.',
    parameters: readSchema,
    execute: async (input) => {
      const fileBuffer = await sandbox.fs.downloadFile(input.path);
      const slice = sliceByOffsetLimit(fileBuffer.toString('utf8'), input.offset, input.limit);

      return {
        totalLines: slice.totalLines,
        returnedLines: slice.returnedLines,
        hasMore: slice.hasMore,
        content: slice.text,
      };
    },
  });

  const write = createTool({
    name: 'write',
    description: 'Write or overwrite a file in the configured Daytona sandbox.',
    parameters: writeSchema,
    execute: async (input) => {
      await sandbox.fs.uploadFile(input.content, input.path);
      return {
        bytes: Buffer.from(input.content).length,
        result: 'ok',
      };
    },
  });

  const edit = createTool({
    name: 'edit',
    description:
      'Perform text replacement in a file inside the configured Daytona sandbox with optional replaceAll.',
    parameters: editSchema,
    execute: async (input) => {
      const fileBuffer = await sandbox.fs.downloadFile(input.path);
      const current = fileBuffer.toString('utf8');
      const replaced = replaceInText(current, input.oldText, input.newText, input.replaceAll);

      await sandbox.fs.uploadFile(replaced.result, input.path);

      return {
        replaced: replaced.count,
        result: 'ok',
      };
    },
  });

  const glob = createTool({
    name: 'glob',
    description: 'Find files matching a glob pattern inside a directory.',
    parameters: globSchema,
    execute: async (input) => {
      const found = await sandbox.fs.searchFiles(input.path, input.pattern);

      return {
        files: found.files,
        count: found.files.length,
      };
    },
  });

  const grep = createTool({
    name: 'grep',
    description: 'Search for text pattern matches in files inside a directory.',
    parameters: grepSchema,
    execute: async (input) => {
      const matches = await sandbox.fs.findFiles(input.path, input.pattern);

      return {
        matches,
        count: matches.length,
      };
    },
  });

  const generate_download_url = createTool({
    name: 'generate_download_url',
    description: 'Generate a direct download URL for a sandbox file.',
    parameters: generateDownloadUrlSchema,
    execute: async (input) => {
      const baseUrl = await daytona.getProxyToolboxUrl(sandbox.id, sandbox.target);
      const url = new URL(`${baseUrl.replace(/\/$/, '')}/files/download`);
      url.searchParams.set('path', input.path);

      return { url: url.toString() };
    },
  });

  const exec = createTool({
    name: 'exec',
    description:
      'Execute shell commands in a Daytona sandbox terminal session. Set background=true for long-running sessions.',
    parameters: execSchema,
    execute: async (input) => {

      if (input.background) {
        const existingSession = await sandbox.process.getSession(input.terminalId).catch(() => null);
        if (!existingSession) {
          await sandbox.process.createSession(input.terminalId);
        }

        const result = await sandbox.process.executeSessionCommand(input.terminalId, {
          command: input.command,
          runAsync: true,
        });

        return {
          commandId: result.cmdId,
          status: 'running',
        };
      }

      const result = await sandbox.process.executeCommand(input.command);

      return {
        exitCode: result.exitCode,
        stdout: result.result,
      };
    },
  });

  const read_terminal_logs = createTool({
    name: 'read_terminal_logs',
    description:
      'Read combined output logs for the latest command in a terminal session with line offset/limit.',
    parameters: readLogsSchema,
    execute: async (input) => {
      const session = await sandbox.process.getSession(input.terminalId);
      const commandId = session.commands.at(-1)?.id;
      if (!commandId) {
        return {
          hasMore: false,
          output: '',
          commandId: null,
        };
      }

      const logs = await sandbox.process.getSessionCommandLogs(input.terminalId, commandId);
      const output = logs.output ?? '';
      const stdout = logs.stdout ?? '';
      const stderr = logs.stderr ?? '';
      const slicedStdout = sliceByOffsetLimit(stdout, input.offset, input.limit);
      const slicedStderr = sliceByOffsetLimit(stderr, input.offset, input.limit);
      const combined = output.length > 0 ? output : [stdout, stderr].join('\n');
      const combinedSlice = sliceByOffsetLimit(combined, input.offset, input.limit);

      return {
        commandId,
        output: combinedSlice.text,
        outputTotalLines: combinedSlice.totalLines,
        outputReturnedLines: combinedSlice.returnedLines,
        outputHasMore: combinedSlice.hasMore,
        stdout: slicedStdout.text,
        stderr: slicedStderr.text,
      };
    },
  });

  const stateful_code_exec = createTool({
    name: 'stateful_code_exec',
    description:
      'Run persistent Python code in an isolated notebook-like context. Reuse context by notebookId.',
    parameters: statefulCodeExecSchema,
    execute: async (input) => {
      const context = await getCodeInterpreterContext(sandbox, input.notebookId);

      const result = await sandbox.codeInterpreter.runCode(input.code, { context });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        error: result.error,
      };
    },
  });

  return {
    name: 'daytona-filesystem-agent',
    description:
      'Use Daytona sandbox filesystem and terminal tools for file operations, command execution, and stateful Python code execution.',
    instructions: 'Use these tools to read and edit files, run commands, inspect logs, and execute stateful Python snippets.',
    addInstructions: true,
    tools: [
      list,
      read,
      write,
      edit,
      glob,
      grep,
      generate_download_url,
      exec,
      read_terminal_logs,
      stateful_code_exec,
    ],
  };
}

async function getCodeInterpreterContext(sandbox: Sandbox, notebookId: string) {
  const existing = codeInterpreterContexts.get(notebookId);

  if (existing) {
    return existing;
  }

  const context = await sandbox.codeInterpreter.createContext();
  codeInterpreterContexts.set(notebookId, context);

  return context;
}

export function createSandboxPtyFunctions(sandbox: Sandbox) {
  return new SandboxPtyService(sandbox);
}

function sliceByOffsetLimit(text: string, offset = 0, limit?: number): {
  totalLines: number;
  returnedLines: number;
  hasMore: boolean;
  text: string;
} {
  const start = Math.max(0, Math.floor(offset));
  const safeLimit = limit === undefined ? undefined : Math.max(1, Math.floor(limit));
  const lines = text.split("\n");
  const from = Math.min(start, lines.length);
  const to = safeLimit === undefined ? lines.length : Math.min(lines.length, from + safeLimit);
  const sliced = lines.slice(from, to).join("\n");

  return {
    totalLines: lines.length,
    returnedLines: to - from,
    hasMore: safeLimit !== undefined && to < lines.length,
    text: sliced,
  };
}

function replaceInText(input: string, oldText: string, newText: string, replaceAll: boolean) {
  if (oldText.length === 0) {
    throw new Error("oldText cannot be empty");
  }

  if (replaceAll) {
    const occurrences = input.split(oldText).length - 1;
    return {
      result: input.split(oldText).join(newText),
      count: occurrences,
    };
  }

  const index = input.indexOf(oldText);
  if (index === -1) {
    throw new Error(`No matches for oldText in ${input.slice(0, 80)}`);
  }

  return {
    result: `${input.slice(0, index)}${newText}${input.slice(index + oldText.length)}`,
    count: 1,
  };
}
