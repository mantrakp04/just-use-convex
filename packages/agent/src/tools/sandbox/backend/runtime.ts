import { Daytona } from "@daytonaio/sdk";
import {
  type LspSession,
  type SandboxEnv,
  type SandboxInstance,
  type SandboxPtySessions,
} from "./types";

export const LSP_SESSION_IDLE_MS = 10 * 60 * 1000;
export const EXEC_SESSION_IDLE_MS = 10 * 60 * 1000;

const runtimeState = {
  client: null as Daytona | null,
  sandboxById: new Map<string, Promise<SandboxInstance>>(),
  lspSessionsBySandbox: new Map<string, Map<string, LspSession>>(),
  ptySessionsBySandbox: new Map<string, SandboxPtySessions>(),
};

export function assertDaytonaConfigured(env: SandboxEnv): void {
  if (!env.DAYTONA_API_KEY) {
    throw new Error("DAYTONA_API_KEY is not configured");
  }
}

export function getDaytonaClient(env: SandboxEnv): Daytona {
  assertDaytonaConfigured(env);

  if (runtimeState.client) {
    return runtimeState.client;
  }

  runtimeState.client = new Daytona({
    apiKey: env.DAYTONA_API_KEY,
    ...(env.DAYTONA_API_URL ? { apiUrl: env.DAYTONA_API_URL } : {}),
    ...(env.DAYTONA_TARGET ? { target: env.DAYTONA_TARGET } : {}),
  });

  return runtimeState.client;
}

export async function getSandboxInstance(env: SandboxEnv, sandboxId: string): Promise<SandboxInstance> {
  const existing = runtimeState.sandboxById.get(sandboxId);
  if (existing) {
    return existing;
  }

  const sandboxPromise = getDaytonaClient(env).get(sandboxId);
  runtimeState.sandboxById.set(sandboxId, sandboxPromise);

  try {
    return await sandboxPromise;
  } catch (error) {
    runtimeState.sandboxById.delete(sandboxId);
    throw error;
  }
}

export function getLspSessions(sandboxId: string): Map<string, LspSession> {
  const existing = runtimeState.lspSessionsBySandbox.get(sandboxId);
  if (existing) {
    return existing;
  }

  const created = new Map<string, LspSession>();
  runtimeState.lspSessionsBySandbox.set(sandboxId, created);
  return created;
}

export function getSandboxPtySessions(sandboxId: string): SandboxPtySessions {
  const existing = runtimeState.ptySessionsBySandbox.get(sandboxId);
  if (existing) {
    return existing;
  }

  const created: SandboxPtySessions = {
    sessions: new Map(),
  };

  runtimeState.ptySessionsBySandbox.set(sandboxId, created);
  return created;
}

export function findInteractivePtySession(terminalId: string) {
  for (const [sandboxId, sessions] of runtimeState.ptySessionsBySandbox) {
    const session = sessions.sessions.get(terminalId);
    if (session?.mode === "interactive") {
      return { sandboxId, sessions, session };
    }
  }

  return null;
}
