import { resolveSandboxPath } from "./utils";
import { getLspSessions, LSP_SESSION_IDLE_MS } from "./runtime";
import type { SandboxContext } from "./context";

export class SandboxLspService {
  constructor(private readonly context: SandboxContext) {}

  private toCacheKey(languageId: string, projectPath: string): string {
    return `${languageId.trim().toLowerCase()}::${projectPath}`;
  }

  private async cleanupIdleSessions(): Promise<void> {
    const now = Date.now();
    const sessions = getLspSessions(this.context.sandboxId);

    for (const [key, session] of sessions) {
      if (now - session.lastTouchedAt < LSP_SESSION_IDLE_MS) {
        continue;
      }

      await session.server.stop();
      sessions.delete(key);
    }
  }

  private async getOrCreateSession(languageId: string, projectPath: string) {
    await this.cleanupIdleSessions();

    const sessions = getLspSessions(this.context.sandboxId);
    const cacheKey = this.toCacheKey(languageId, projectPath);
    const existing = sessions.get(cacheKey);

    if (existing) {
      existing.lastTouchedAt = Date.now();
      return existing.server;
    }

    const sandbox = await this.context.getSandbox();
    const server = await sandbox.createLspServer(languageId, projectPath);
    await server.start();

    sessions.set(cacheKey, {
      server,
      lastTouchedAt: Date.now(),
    });

    return server;
  }

  async start(languageId: string, projectPathInput: string) {
    const rootPath = await this.context.getRootPath();
    const projectPath = resolveSandboxPath(projectPathInput, rootPath);

    await this.getOrCreateSession(languageId, projectPath);

    return {
      languageId,
      projectPath,
      started: true,
    };
  }

  async stop(languageId: string, projectPathInput: string) {
    const rootPath = await this.context.getRootPath();
    const projectPath = resolveSandboxPath(projectPathInput, rootPath);

    const sessions = getLspSessions(this.context.sandboxId);
    const cacheKey = this.toCacheKey(languageId, projectPath);
    const current = sessions.get(cacheKey);

    if (!current) {
      return {
        languageId,
        projectPath,
        stopped: false,
        running: false,
      };
    }

    await current.server.stop();
    sessions.delete(cacheKey);

    return {
      languageId,
      projectPath,
      stopped: true,
      running: false,
    };
  }

  async completions(params: {
    languageId: string;
    projectPath: string;
    filePath: string;
    line: number;
    character: number;
  }) {
    const rootPath = await this.context.getRootPath();
    const projectPath = resolveSandboxPath(params.projectPath, rootPath);
    const filePath = resolveSandboxPath(params.filePath, rootPath);

    const server = await this.getOrCreateSession(params.languageId, projectPath);
    await server.didOpen(filePath);

    return server.completions(filePath, {
      line: params.line,
      character: params.character,
    });
  }

  async documentSymbols(languageId: string, projectPathInput: string, filePathInput: string) {
    const rootPath = await this.context.getRootPath();
    const projectPath = resolveSandboxPath(projectPathInput, rootPath);
    const filePath = resolveSandboxPath(filePathInput, rootPath);

    const server = await this.getOrCreateSession(languageId, projectPath);
    await server.didOpen(filePath);

    return server.documentSymbols(filePath);
  }

  async sandboxSymbols(languageId: string, projectPathInput: string, query: string) {
    const rootPath = await this.context.getRootPath();
    const projectPath = resolveSandboxPath(projectPathInput, rootPath);

    const server = await this.getOrCreateSession(languageId, projectPath);
    return server.sandboxSymbols(query);
  }
}
