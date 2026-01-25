import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { env } from "@just-use-convex/env/web";

// Chat settings state that gets synced to the agent
export type ChatSettings = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
};

type AgentChatOptions = {
  agentType?: string;
  host?: string;
  credentials?: RequestCredentials;
  onError?: (error: Error) => void;
};

type AgentChatInstance = ReturnType<typeof useAgentChat>;

type AgentChatStore = {
  instances: Map<string, AgentChatInstance>;
  subscribe: (callback: () => void) => () => void;
  getSnapshot: () => Map<string, AgentChatInstance>;
  set: (key: string, instance: AgentChatInstance) => void;
  get: (key: string) => AgentChatInstance | undefined;
};

function createAgentChatStore(): AgentChatStore {
  const instances = new Map<string, AgentChatInstance>();
  const listeners = new Set<() => void>();

  return {
    instances,
    subscribe: (callback: () => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    getSnapshot: () => instances,
    set: (key: string, instance: AgentChatInstance) => {
      instances.set(key, instance);
      listeners.forEach((listener) => listener());
    },
    get: (key: string) => instances.get(key),
  };
}

const AgentChatStoreContext = createContext<AgentChatStore | null>(null);

export function AgentsProvider({ children }: { children: ReactNode }) {
  const store = createAgentChatStore();

  return (
    <AgentChatStoreContext.Provider value={store}>
      {children}
    </AgentChatStoreContext.Provider>
  );
}

function useAgentChatStore() {
  const store = useContext(AgentChatStoreContext);
  if (!store) {
    throw new Error("useAgentChat must be used within an AgentsProvider");
  }
  return store;
}

type UseAgentChatOptions = AgentChatOptions & {
  name: string;
};

export function useAgentChatInstance(options: UseAgentChatOptions) {
  const { name, agentType = "agent-worker", host = env.VITE_AGENT_URL, credentials = "include", onError } = options;

  const store = useAgentChatStore();

  const instances = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  // Local state for chat settings that syncs with the agent
  const [settings, setSettingsLocal] = useState<ChatSettings>({});

  const agent = useAgent<ChatSettings>({
    agent: agentType,
    name,
    host,
    onStateUpdate: (state, source) => {
      // Sync state from server to local
      if (source === "server" && state) {
        setSettingsLocal(state);
      }
    },
  });

  const chat = useAgentChat({
    agent,
    credentials,
    onError,
  });

  // Register instance if not already registered
  const existingInstance = instances.get(name);
  if (!existingInstance && agent) {
    store.set(name, chat);
  }

  const getInstance = useCallback(
    (instanceName: string) => store.get(instanceName),
    [store]
  );

  // Update settings both locally and on the agent
  const setSettings = useCallback(
    (newSettings: ChatSettings | ((prev: ChatSettings) => ChatSettings)) => {
      setSettingsLocal((prev) => {
        const updated = typeof newSettings === "function" ? newSettings(prev) : newSettings;
        // Sync to agent
        if (agent) {
          agent.setState(updated);
        }
        return updated;
      });
    },
    [agent]
  );

  return {
    ...chat,
    agent,
    getInstance,
    isConnected: !!agent,
    settings,
    setSettings,
  };
}

/**
 * Hook to access an existing agent chat instance by name.
 * Returns undefined if the instance doesn't exist.
 */
export function useExistingAgentChat(name: string) {
  const store = useAgentChatStore();

  const instances = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  return instances.get(name);
}

/**
 * Hook to get all active agent chat instance names.
 */
export function useAgentChatInstances() {
  const store = useAgentChatStore();

  const instances = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  return Array.from(instances.keys());
}
