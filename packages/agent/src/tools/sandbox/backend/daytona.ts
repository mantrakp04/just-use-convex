import { Daytona } from "@daytonaio/sdk";
import type { worker } from "../../../../alchemy.run";

export const LSP_IDLE_TTL_MS = 10 * 60 * 1000;
export const TERMINAL_IDLE_TTL_MS = 10 * 60 * 1000;

export type SandboxInstance = Awaited<ReturnType<Daytona["get"]>>;
export type LspServer = Awaited<ReturnType<SandboxInstance["createLspServer"]>>;
export type TerminalSessionState = {
  lastUsedAt: number;
  activeCommands: number;
  queue: Promise<void>;
};

const daytonaState = {
  daytonaClient: null as Daytona | null,
  sandboxByName: new Map<string, ReturnType<Daytona["get"]>>(),
  lspServerBySandbox: new Map<
    string,
    Map<
      string,
      {
        server: LspServer;
        lastUsedAt: number;
      }
    >
  >(),
  terminalBySandbox: new Map<string, Map<string, TerminalSessionState>>(),
};

export function getDaytonaClient(env: typeof worker.Env): Daytona {
  if (daytonaState.daytonaClient) {
    return daytonaState.daytonaClient;
  }

  daytonaState.daytonaClient = new Daytona({
    apiKey: env.DAYTONA_API_KEY,
    ...(env.DAYTONA_API_URL ? { apiUrl: env.DAYTONA_API_URL } : {}),
    ...(env.DAYTONA_TARGET ? { target: env.DAYTONA_TARGET } : {}),
  });

  return daytonaState.daytonaClient;
}

export async function getSandbox(env: typeof worker.Env, sandboxName: string): Promise<SandboxInstance> {
  const cached = daytonaState.sandboxByName.get(sandboxName);
  if (cached) {
    return cached;
  }

  const sandboxPromise = (async () => {
    const daytona = getDaytonaClient(env);
    return daytona.get(sandboxName);
  })();

  daytonaState.sandboxByName.set(sandboxName, sandboxPromise);

  try {
    return await sandboxPromise;
  } catch (error) {
    daytonaState.sandboxByName.delete(sandboxName);
    throw error;
  }
}

export function getLspCache(sandboxName: string) {
  const cached = daytonaState.lspServerBySandbox.get(sandboxName);
  if (cached) {
    return cached;
  }

  const created = new Map<
    string,
    {
      server: LspServer;
      lastUsedAt: number;
    }
  >();
  daytonaState.lspServerBySandbox.set(sandboxName, created);
  return created;
}

export function getTerminalCache(sandboxName: string) {
  const cached = daytonaState.terminalBySandbox.get(sandboxName);
  if (cached) {
    return cached;
  }

  const created = new Map<string, TerminalSessionState>();
  daytonaState.terminalBySandbox.set(sandboxName, created);
  return created;
}
