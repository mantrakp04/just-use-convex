import { z } from "zod";

export const DEFAULT_LIST_OFFSET = 0;
export const DEFAULT_LIST_LIMIT = 1000;
export const DEFAULT_TERMINAL_ID = "default";

export const ptyTerminalIdSchema = z
  .string()
  .min(1)
  .default(DEFAULT_TERMINAL_ID)
  .describe("Terminal session ID for get-or-create semantics.");

export const exposeServiceParameters = z.object({
  port: z
    .number()
    .int()
    .min(3000)
    .max(9999)
    .default(3000)
    .describe("Sandbox HTTP port to expose (Daytona preview supports 3000-9999)."),
  previewType: z
    .enum(["standard", "signed", "both"])
    .default("both")
    .describe("Preview link type: standard (header token), signed (token in URL), or both."),
  expiresInSeconds: z
    .number()
    .int()
    .positive()
    .max(24 * 60 * 60)
    .optional()
    .describe("Signed preview URL TTL in seconds. Defaults to Daytona's default (60s)."),
  revokeSignedToken: z
    .string()
    .min(1)
    .optional()
    .describe("Optional signed token to revoke before returning preview links."),
  checkConnectivity: z
    .boolean()
    .default(false)
    .describe("Optionally check whether the sandbox service is currently listening on this port."),
});

export const listSchema = z.object({
  path: z.string().default('.').describe('Directory path to list'),
});

export const readSchema = z.object({
  path: z.string().describe('Path of file to read'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(DEFAULT_LIST_OFFSET)
    .describe('Line offset from which to start reading (0-based)'),
  limit: z
    .number()
    .int()
    .min(1)
    .default(DEFAULT_LIST_LIMIT)
    .describe('Maximum number of lines to return'),
});

export const writeSchema = z.object({
  path: z.string().describe('Path where content should be written'),
  content: z.string().describe('Raw file content'),
});

export const editSchema = z.object({
  path: z.string().describe('Path of file to edit'),
  oldText: z.string().describe('Exact text to match'),
  newText: z.string().describe('Replacement text'),
  replaceAll: z
    .boolean()
    .default(false)
    .describe('Whether all occurrences should be replaced (default: false)'),
});

export const globSchema = z.object({
  path: z.string().default('.').describe('Directory path to search inside'),
  pattern: z.string().describe('Glob pattern (for example: **/*.ts)'),
});

export const grepSchema = z.object({
  path: z.string().default('.').describe('Directory path to search inside'),
  pattern: z.string().describe('Text pattern to match'),
});

export const generateDownloadUrlSchema = z.object({
  path: z.string().describe('Path of file to generate download URL for'),
});

export const execSchema = z.object({
  terminalId: ptyTerminalIdSchema,
  command: z.string().describe('Shell command to execute'),
  background: z
    .boolean()
    .default(false)
    .describe('Run asynchronously in a long-running session'),
});

export const readLogsSchema = z.object({
  terminalId: z.string().describe('Terminal session ID to read logs from'),
  offset: z
    .number()
    .int()
    .min(0)
    .default(DEFAULT_LIST_OFFSET)
    .describe('Line offset to start reading logs from'),
  limit: z
    .number()
    .int()
    .min(1)
    .default(DEFAULT_LIST_LIMIT)
    .describe('Maximum number of log lines to return'),
});

export const statefulCodeExecSchema = z.object({
  notebookId: z.string().describe('Notebook context ID for persistent state'),
  code: z.string().describe('Python code to execute'),
});

export type ExposeServiceInput = z.infer<typeof exposeServiceParameters>;
