import type { ChatSettings } from "@/components/chat";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { env } from "@just-use-convex/env/web";
import { useAgent } from "agents/react";
type AgentConnection = ReturnType<typeof useAgent<ChatSettings>>;
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
  useSyncExternalStore,
  useRef,
  type ReactNode,
  createElement,
} from "react";
import { createRoot, type Root } from "react-dom/client";

type AgentChatInstance = ReturnType<typeof useAgentChat>;

type InstanceData = {
  chat: AgentChatInstance | null;
  agent: AgentConnection | null;
  settings: ChatSettings;
  setSettings: (settingsOrFn: ChatSettings | ((prev: ChatSettings) => ChatSettings)) => void;
};

type AgentsContextValue = {
  requestInstance: (chatId: string) => void;
  subscribe: (chatId: string, callback: () => void) => () => void;
  getSnapshot: (chatId: string) => InstanceData | undefined;
};

const AgentsContext = createContext<AgentsContextValue | null>(null);

const instanceDataStore = new Map<string, InstanceData>();
const subscribersStore = new Map<string, Set<() => void>>();

function notifySubscribers(chatId: string) {
  subscribersStore.get(chatId)?.forEach((cb) => cb());
}

function updateInstanceData(chatId: string, data: InstanceData) {
  instanceDataStore.set(chatId, data);
  notifySubscribers(chatId);
}

type IsolatedInstance = {
  root: Root;
  container: HTMLDivElement;
};

const isolatedInstances = new Map<string, IsolatedInstance>();

function AgentInstanceInner({ chatId, token }: { chatId: string, token: string | null | undefined }) {
  const [settings, setSettingsState] = useState<ChatSettings>({});

  const handleStateUpdate = useCallback(
    (state: ChatSettings | undefined, source: string) => {
      if (source === "server" && state) {
        setSettingsState(state);
      }
    },
    []
  );

  const handleError = useCallback((error: Error) => {
    console.error("Chat error:", error);
  }, []);

  const setSettings = useCallback(
    (settingsOrFn: ChatSettings | ((prev: ChatSettings) => ChatSettings)) => {
      setSettingsState((prev: ChatSettings) => {
        const next = typeof settingsOrFn === "function" ? settingsOrFn(prev) : settingsOrFn;
        // Sync to agent when user explicitly changes settings
        agentRef.current?.setState(next);
        return next;
      });
    },
    []
  );

  const chatRef = useRef<AgentChatInstance | null>(null);
  const agentRef = useRef<AgentConnection | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const handleMessage = useCallback(() => {
    updateInstanceData(chatId, {
      chat: chatRef.current,
      agent: agentRef.current,
      settings: settingsRef.current,
      setSettings,
    });
  }, [chatId, setSettings]);

  const agent = useAgent<ChatSettings>({
    agent: "agent-worker",
    name: chatId,
    host: env.VITE_AGENT_URL,
    onStateUpdate: handleStateUpdate,
    onMessage: handleMessage,
    query: {
      token: token ?? null,
    }
  });

  const chat = useAgentChat({
    agent,
    resume: true,
    onError: handleError,
    autoContinueAfterToolResult: true,
  });

  chatRef.current = chat;
  agentRef.current = agent;

  // Update instance data whenever chat/agent/settings change
  useEffect(() => {
    updateInstanceData(chatId, { chat, agent, settings, setSettings });
  }, [chatId, chat, agent, settings, setSettings]);

  return null;
}

function createIsolatedInstance(chatId: string, token: string | null | undefined): void {
  if (isolatedInstances.has(chatId)) return;

  // Create a hidden container for this instance
  const container = document.createElement("div");
  container.style.display = "none";
  container.dataset.agentInstance = chatId;
  document.body.appendChild(container);

  // Create a separate React root - this won't be affected by parent re-renders
  const root = createRoot(container);
  root.render(createElement(AgentInstanceInner, { chatId, token }));

  isolatedInstances.set(chatId, { root, container });
}

// function destroyIsolatedInstance(chatId: string): void {
//   const instance = isolatedInstances.get(chatId);
//   if (!instance) return;

//   instance.root.unmount();
//   instance.container.remove();
//   isolatedInstances.delete(chatId);
//   instanceDataStore.delete(chatId);
// }

export function AgentsProvider({ children, token }: { children: ReactNode, token: string | null | undefined }) {
  const requestInstance = useCallback((chatId: string) => {
    createIsolatedInstance(chatId, token);
  }, [token]);

  const subscribe = useCallback((chatId: string, callback: () => void) => {
    if (!subscribersStore.has(chatId)) {
      subscribersStore.set(chatId, new Set());
    }
    subscribersStore.get(chatId)!.add(callback);

    return () => {
      subscribersStore.get(chatId)?.delete(callback);
    };
  }, []);

  const getSnapshot = useCallback((chatId: string) => {
    return instanceDataStore.get(chatId);
  }, []);

  const value = useMemo<AgentsContextValue>(
    () => ({
      requestInstance,
      subscribe,
      getSnapshot,
    }),
    [requestInstance, subscribe, getSnapshot]
  );

  return (
    <AgentsContext.Provider value={value}>
      {children}
    </AgentsContext.Provider>
  );
}

export function useAgentsContext() {
  const context = useContext(AgentsContext);
  if (!context) {
    throw new Error("useAgentsContext must be used within an AgentsProvider");
  }
  return context;
}

export function useAgentInstance(chatId: string) {
  const { requestInstance, subscribe, getSnapshot } = useAgentsContext();

  // Request the instance on mount
  useEffect(() => {
    requestInstance(chatId);
  }, [chatId, requestInstance]);

  // Subscribe to updates using useSyncExternalStore
  const subscribeToChat = useCallback(
    (callback: () => void) => subscribe(chatId, callback),
    [chatId, subscribe]
  );

  const getSnapshotForChat = useCallback(
    () => getSnapshot(chatId),
    [chatId, getSnapshot]
  );

  const data = useSyncExternalStore(subscribeToChat, getSnapshotForChat, getSnapshotForChat);

  return {
    chat: data?.chat ?? null,
    agent: data?.agent ?? null,
    settings: data?.settings ?? {},
    setSettings: data?.setSettings ?? (() => {}),
    isReady: !!data?.chat,
  };
}
