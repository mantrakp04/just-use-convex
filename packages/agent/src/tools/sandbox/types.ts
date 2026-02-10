import type {
  Match,
  PtyHandle,
  Sandbox,
} from "@daytonaio/sdk";
import { z } from "zod";

export type LspSessionState = {
  languageId: string;
  server: Awaited<ReturnType<Sandbox["createLspServer"]>>;
};

export type PtySessionState = {
  id: string;
  handle: PtyHandle;
  output: string;
  closed: boolean;
  closeReason: string | null;
  exitCode: number | null;
  commandQueue: Promise<void>;
};

export type SandboxSessionState = {
  id: string;
  sandbox: Sandbox;
  lspSession: LspSessionState | null;
  ptySessions: Map<string, PtySessionState>;
};

export const sandboxPathSchema = z
  .string()
  .min(1)
  .describe("Sandbox path. Relative paths resolve from sandbox workdir.");

export const lsParameters = z.object({
  path: sandboxPathSchema.default("."),
});

export const readParameters = z.object({
  path: sandboxPathSchema,
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
});

export const writeParameters = z.object({
  path: sandboxPathSchema,
  content: z.string().describe("Text content to write into the file."),
});

export const editParameters = z.object({
  path: sandboxPathSchema,
  oldText: z.string().min(1).describe("Exact text to replace."),
  newText: z.string().describe("Replacement text."),
  replaceAll: z.boolean().default(false),
});

export const globParameters = z.object({
  path: sandboxPathSchema.default("."),
  pattern: z
    .string()
    .min(1)
    .describe("Glob pattern supporting *, ?, [], and ** (for example: **/*.ts)."),
});

export const grepParameters = z.object({
  path: sandboxPathSchema.default("."),
  pattern: z.string().min(1).describe("Text pattern to search for."),
});

export const terminalIdSchema = z
  .string()
  .min(1)
  .describe("Terminal session ID for get-or-create semantics.");

export const ptySessionCreateParameters = z.object({
  terminalId: terminalIdSchema.optional(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  cwd: z.string().min(1).optional(),
  envs: z.record(z.string()).optional(),
});

export const execParameters = z.object({
  command: z.string().min(1).describe("Shell command to execute in PTY."),
  terminalId: terminalIdSchema.optional(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  cwd: z.string().min(1).optional(),
  envs: z.record(z.string()).optional(),
  closeAfter: z.boolean().default(false),
});

export const execOutputParameters = z.object({
  terminalId: z.string().min(1),
  command: z.string().min(1),
  output: z.string(),
  exitCode: z.number().int().nullable(),
  success: z.boolean(),
  timedOut: z.boolean(),
  error: z.string().optional(),
});

export const xtermReadParameters = z.object({
  terminalId: terminalIdSchema,
  offset: z.number().int().nonnegative().default(0),
});

export const xtermWriteParameters = z.object({
  terminalId: terminalIdSchema,
  data: z.string().describe("Raw xterm input data."),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  cwd: z.string().min(1).optional(),
  envs: z.record(z.string()).optional(),
});

export const xtermResizeParameters = z.object({
  terminalId: terminalIdSchema,
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export const xtermCloseParameters = z.object({
  terminalId: terminalIdSchema,
});

export const xtermListParameters = z.object({});

export const lspCompletionsParameters = z.object({
  languageId: z
    .string()
    .min(1)
    .describe("LSP language id (python/typescript/javascript)."),
  projectPath: sandboxPathSchema.describe("Project root for this LSP session."),
  filePath: sandboxPathSchema.describe("File path to request completions for."),
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});

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

export type LsInput = z.infer<typeof lsParameters>;
export type ReadInput = z.infer<typeof readParameters>;
export type WriteInput = z.infer<typeof writeParameters>;
export type EditInput = z.infer<typeof editParameters>;
export type GlobInput = z.infer<typeof globParameters>;
export type GrepInput = z.infer<typeof grepParameters>;
export type ExecInput = z.infer<typeof execParameters>;
export type ExecOutput = z.infer<typeof execOutputParameters>;
export type PtySessionCreateInput = z.infer<typeof ptySessionCreateParameters>;
export type XtermReadInput = z.infer<typeof xtermReadParameters>;
export type XtermWriteInput = z.infer<typeof xtermWriteParameters>;
export type XtermResizeInput = z.infer<typeof xtermResizeParameters>;
export type XtermCloseInput = z.infer<typeof xtermCloseParameters>;
export type XtermListInput = z.infer<typeof xtermListParameters>;
export type LspCompletionsInput = z.infer<typeof lspCompletionsParameters>;
export type ExposeServiceInput = z.infer<typeof exposeServiceParameters>;

export type GrepMatch = Pick<Match, "file" | "line" | "content">;
