import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatAddToolApproveResponseFunction, FileUIPart } from "ai";
import type { useAgentChat } from "@cloudflare/ai-chat/react";
import type { AskUserState, SteerQueueInput, SteerQueueItem, SteerQueueState, TodosState } from "@/components/chat/types";
import type { QueueMessagePart, QueueTodo } from "@/components/ai-elements/queue";
import type { AskUserInput } from "@/components/ai-elements/ask-user";
import { isToolPart } from "@/components/chat/message-items/tool-part";

type AgentChatInstance = ReturnType<typeof useAgentChat>;
type AgentConnection = {
  call: (method: string, args?: unknown[]) => Promise<unknown>;
} | null;

export function extractMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as Extract<UIMessage["parts"][number], { type: "text" }>).text)
    .join("\n");
}

export function extractMessageFiles(
  message: UIMessage
): Extract<UIMessage["parts"][number], { type: "file" }>[] {
  return message.parts
    .filter((part) => part.type === "file")
    .map((part) => part as Extract<UIMessage["parts"][number], { type: "file" }>);
}

// AI SDK todo structure (from tool input)
interface AITodo {
  id?: string;
  content: string;
  status: "pending" | "in_progress" | "done";
}

function mapAITodoToQueueTodo(todo: AITodo, index: number): QueueTodo {
  return {
    id: todo.id ?? `todo-${index}`,
    title: todo.content,
    status: todo.status,
  };
}

export function extractTodosFromMessage(
  message: UIMessage,
  isLastAssistantMessage: boolean
): TodosState | null {
  if (!isLastAssistantMessage || message.role !== "assistant") {
    return null;
  }

  for (const part of message.parts) {
    if (isToolPart(part) && part.type === "tool-write_todos") {
      const input = part.input as { todos?: AITodo[] } | undefined;
      const output = part.output as { todos?: AITodo[] } | undefined;
      const rawTodos = output?.todos ?? input?.todos ?? [];
      const todos = rawTodos.map(mapAITodoToQueueTodo);
      return {
        todos,
        todosApproval: "approval" in part ? part.approval : undefined,
        todosState: part.state,
        todosToolCallId: part.toolCallId,
        todosInput: { todos },
      };
    }
  }

  return null;
}

export function extractAskUserFromMessage(
  message: UIMessage,
  isLastAssistantMessage: boolean
): AskUserState | null {
  if (!isLastAssistantMessage || message.role !== "assistant") {
    return null;
  }

  for (const part of message.parts) {
    if (isToolPart(part) && part.type === "tool-ask_user") {
      const input = part.input as AskUserInput | undefined;
      if (!input?.questions) return null;
      return {
        input,
        approval: "approval" in part ? part.approval : undefined,
        state: part.state,
      };
    }
  }

  return null;
}

export function useChat(chat: AgentChatInstance | null, agent: AgentConnection = null) {
  const status = chat?.status || "ready";
  const error = chat?.error;
  const stop = chat?.stop;
  const messages = chat?.messages ?? [];
  const sendMessage = chat?.sendMessage;
  const addToolApprovalResponse = chat?.addToolApprovalResponse;
  const regenerate = chat?.regenerate;
  const setMessages = chat?.setMessages;

  const isStreaming = status === "streaming";

  const findMessageIndex = useCallback(
    (messageId: string): number => messages.findIndex((m) => m.id === messageId),
    [messages]
  );

  const saveMessages = useCallback(
    async (msgs: UIMessage[]) => {
      if (!agent) return;
      await agent.call("updateMessages", [msgs]);
    },
    [agent]
  );

  const handleSubmit = useCallback(
    async ({
      text,
      files,
    }: {
      text: string;
      files: FileUIPart[];
    }) => {
      if (!sendMessage) return;
      if (!text.trim() && files.length === 0) return;

      const parts: UIMessage["parts"] = [];

      if (text.trim()) {
        parts.push({ type: "text", text });
      }

      parts.push(...files);

      await sendMessage({
        role: "user",
        parts,
      });
    },
    [sendMessage]
  );

  const handleToolApprovalResponse: ChatAddToolApproveResponseFunction = useCallback(
    (response) => {
      if (!addToolApprovalResponse || !sendMessage) return;
      addToolApprovalResponse(response);
      sendMessage();
    },
    [addToolApprovalResponse, sendMessage]
  );

  const handleRegenerate = useCallback(
    async (messageId: string) => {
      if (!setMessages || !regenerate) return;

      const messageIndex = findMessageIndex(messageId);
      if (messageIndex === -1) return;

      const truncatedMessages = messages.slice(0, messageIndex + 1);
      setMessages(truncatedMessages);
      await saveMessages(truncatedMessages);
      await regenerate({ messageId });
    },
    [messages, setMessages, regenerate, findMessageIndex, saveMessages]
  );

  const handleEditMessage = useCallback(
    async (messageId: string, newText: string, files: FileUIPart[]) => {
      if (!setMessages || !sendMessage) return;

      const messageIndex = findMessageIndex(messageId);
      if (messageIndex === -1) return;

      const newParts: UIMessage["parts"] = [
        ...files,
        ...(newText ? [{ type: "text" as const, text: newText }] : []),
      ];

      const updatedMessages = messages.slice(0, messageIndex + 1).map((msg: UIMessage, idx: number) =>
        idx === messageIndex ? { ...msg, parts: newParts } : msg
      );

      setMessages(updatedMessages);
      await saveMessages(updatedMessages);
      await sendMessage();
    },
    [messages, setMessages, sendMessage, findMessageIndex, saveMessages]
  );

  return {
    status,
    error,
    stop,
    messages,
    isStreaming,
    handleSubmit,
    handleToolApprovalResponse,
    handleRegenerate,
    handleEditMessage,
  };
}

export function useMessageEditing(
  message: UIMessage,
  onEditMessage?: (messageId: string, newText: string, files: FileUIPart[]) => void
) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [editedFiles, setEditedFiles] = useState<FileUIPart[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messageText = extractMessageText(message);
  const messageFiles = extractMessageFiles(message);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    setEditedText(messageText);
    setEditedFiles(
      messageFiles.map((f) => ({
        type: "file" as const,
        url: f.url,
        mediaType: f.mediaType,
        filename: f.filename,
      }))
    );
    setIsEditing(true);
  }, [messageText, messageFiles]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedText("");
    setEditedFiles([]);
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setEditedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAddFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setEditedFiles((prev) => [
          ...prev,
          {
            type: "file" as const,
            url,
            mediaType: file.type,
            filename: file.name,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  const hasChanges =
    editedText !== messageText ||
    editedFiles.length !== messageFiles.length ||
    editedFiles.some((f, i) => f.url !== messageFiles[i]?.url);

  const handleConfirmEdit = useCallback(() => {
    if (
      (editedText.trim() || editedFiles.length > 0) &&
      hasChanges &&
      onEditMessage &&
      message.id
    ) {
      onEditMessage(message.id, editedText.trim(), editedFiles);
    }
    setIsEditing(false);
  }, [editedText, editedFiles, hasChanges, onEditMessage, message.id]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancelEdit();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleConfirmEdit();
      }
    },
    [handleCancelEdit, handleConfirmEdit]
  );

  return {
    isEditing,
    editedText,
    setEditedText,
    editedFiles,
    textareaRef,
    fileInputRef,
    hasChanges,
    handleStartEdit,
    handleCancelEdit,
    handleRemoveFile,
    handleAddFiles,
    handleConfirmEdit,
    handleKeyDown,
  };
}

export function useCopyToClipboard(text: string) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [text]);

  return {
    copied,
    handleCopy,
  };
}

export function useTodosState() {
  const todosStateRef = useRef<TodosState>({ todos: [] });
  const prevTodosJsonRef = useRef<string>("");

  const handleTodosChange = useCallback((todosState: TodosState) => {
    todosStateRef.current = todosState;
  }, []);

  const syncTodosToParent = useCallback(
    (onTodosChange?: (todosState: TodosState) => void) => {
      const json = JSON.stringify(todosStateRef.current);
      if (json !== prevTodosJsonRef.current) {
        prevTodosJsonRef.current = json;
        onTodosChange?.(todosStateRef.current);
      }
    },
    []
  );

  return {
    todosStateRef,
    handleTodosChange,
    syncTodosToParent,
  };
}

export function useAskUserState() {
  const askUserStateRef = useRef<AskUserState | null>(null);
  const prevAskUserJsonRef = useRef<string>("");

  const handleAskUserChange = useCallback((askUserState: AskUserState | null) => {
    askUserStateRef.current = askUserState;
  }, []);

  const syncAskUserToParent = useCallback(
    (onAskUserChange?: (askUserState: AskUserState | null) => void) => {
      const json = JSON.stringify(askUserStateRef.current);
      if (json !== prevAskUserJsonRef.current) {
        prevAskUserJsonRef.current = json;
        onAskUserChange?.(askUserStateRef.current);
      }
    },
    []
  );

  return {
    askUserStateRef,
    handleAskUserChange,
    syncAskUserToParent,
  };
}

export function useSteerQueue(
  messages: UIMessage[],
  agent: AgentConnection = null
): SteerQueueState {
  const parsedItems = useMemo(() => extractSteerQueueFromMessages(messages), [messages]);
  const [items, setItems] = useState<SteerQueueItem[]>(parsedItems);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSteering, setIsSteering] = useState(false);
  const itemsRef = useRef(items);
  const pendingMutationsRef = useRef(0);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (pendingMutationsRef.current > 0) return;
    setItems(parsedItems);
  }, [parsedItems]);

  const refreshSteerQueueState = useCallback(async () => {
    if (!agent) return;

    setIsRefreshing(true);
    try {
      const response = await agent.call("getSteerQueueState");
      setItems(extractSteerQueueItems(response));
    } finally {
      setIsRefreshing(false);
    }
  }, [agent]);

  useEffect(() => {
    if (!agent) return;
    void refreshSteerQueueState();
  }, [agent, refreshSteerQueueState]);

  const steerQueue = useCallback(
    async (input: SteerQueueInput) => {
      if (!agent) return;

      const previousItems = itemsRef.current;
      pendingMutationsRef.current += 1;
      setIsSteering(true);
      setItems((prev) => [...prev, createOptimisticSteerQueueItem(input)]);

      try {
        await agent.call("steerQueue", [input]);
        await refreshSteerQueueState();
      } catch (error) {
        setItems(previousItems);
        throw error;
      } finally {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
        setIsSteering(false);
      }
    },
    [agent, refreshSteerQueueState]
  );

  const removeSteerQueueItem = useCallback(
    async (itemId: string) => {
      if (!agent || !itemId) return;

      const previousItems = itemsRef.current;
      pendingMutationsRef.current += 1;
      setPendingRemovalIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
      setItems((prev) => prev.filter((item) => item.id !== itemId));

      try {
        await callRemoveSteerQueueItem(agent, itemId);
        await refreshSteerQueueState();
      } catch (error) {
        setItems(previousItems);
        throw error;
      } finally {
        pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
        setPendingRemovalIds((prev) => prev.filter((id) => id !== itemId));
      }
    },
    [agent, refreshSteerQueueState]
  );

  return {
    items,
    pendingRemovalIds,
    isRefreshing,
    isSteering,
    steerQueue,
    refreshSteerQueueState,
    removeSteerQueueItem,
  };
}

export function extractSteerQueueFromMessages(messages: UIMessage[]): SteerQueueItem[] {
  let lastQueue: SteerQueueItem[] = [];

  for (const message of messages) {
    for (const part of message.parts) {
      if (!isSteerQueueDataPart(part)) continue;
      if (!hasSteerQueueData(part.data)) continue;

      lastQueue = extractSteerQueueItems(part.data);
    }
  }

  return lastQueue;
}

export function findLastAssistantMessageIndex(messages: UIMessage[]): number {
  return messages.reduceRight(
    (acc: number, msg: UIMessage, idx: number) => (acc === -1 && msg.role === "assistant" ? idx : acc),
    -1
  );
}

export function findPrecedingUserMessageId(
  messages: UIMessage[],
  assistantIndex: number
): string | undefined {
  for (let i = assistantIndex - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      return messages[i]?.id;
    }
  }
  return undefined;
}

function isSteerQueueDataPart(
  part: UIMessage["parts"][number]
): part is UIMessage["parts"][number] & { type: "data-steer-queue"; data?: unknown } {
  return part.type === "data-steer-queue";
}

function hasSteerQueueData(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (!isRecord(value)) return false;
  if (Array.isArray(value.items)) return true;
  if (Array.isArray(value.queue)) return true;
  if (Array.isArray(value.steerQueue)) return true;
  if (Array.isArray(value.live) || Array.isArray(value.postFinish)) return true;
  if (Array.isArray(value.liveSteerQueue) || Array.isArray(value.postFinishQueue)) return true;
  if (isRecord(value.state) && Array.isArray(value.state.items)) return true;
  if (isRecord(value.state) && (Array.isArray(value.state.live) || Array.isArray(value.state.postFinish))) return true;
  if (isRecord(value.state) && (Array.isArray(value.state.liveSteerQueue) || Array.isArray(value.state.postFinishQueue))) return true;
  if (isRecord(value.snapshot) && (Array.isArray(value.snapshot.liveSteerQueue) || Array.isArray(value.snapshot.postFinishQueue))) return true;
  return false;
}

function extractSteerQueueItems(value: unknown): SteerQueueItem[] {
  const rawItems = readSteerQueueItems(value);
  return rawItems
    .map((item, index) => normalizeSteerQueueItem(item, index))
    .filter((item): item is SteerQueueItem => item !== null);
}

function readSteerQueueItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];

  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.queue)) return value.queue;
  if (Array.isArray(value.steerQueue)) return value.steerQueue;
  if (Array.isArray(value.live) || Array.isArray(value.postFinish)) {
    return [...(Array.isArray(value.live) ? value.live : []), ...(Array.isArray(value.postFinish) ? value.postFinish : [])];
  }
  if (Array.isArray(value.liveSteerQueue) || Array.isArray(value.postFinishQueue)) {
    return [
      ...(Array.isArray(value.liveSteerQueue) ? value.liveSteerQueue : []),
      ...(Array.isArray(value.postFinishQueue) ? value.postFinishQueue : []),
    ];
  }

  if (isRecord(value.state)) {
    if (Array.isArray(value.state.items)) return value.state.items;
    if (Array.isArray(value.state.queue)) return value.state.queue;
    if (Array.isArray(value.state.steerQueue)) return value.state.steerQueue;
    if (Array.isArray(value.state.live) || Array.isArray(value.state.postFinish)) {
      return [
        ...(Array.isArray(value.state.live) ? value.state.live : []),
        ...(Array.isArray(value.state.postFinish) ? value.state.postFinish : []),
      ];
    }
    if (Array.isArray(value.state.liveSteerQueue) || Array.isArray(value.state.postFinishQueue)) {
      return [
        ...(Array.isArray(value.state.liveSteerQueue) ? value.state.liveSteerQueue : []),
        ...(Array.isArray(value.state.postFinishQueue) ? value.state.postFinishQueue : []),
      ];
    }
  }

  if (isRecord(value.snapshot)) {
    if (Array.isArray(value.snapshot.liveSteerQueue) || Array.isArray(value.snapshot.postFinishQueue)) {
      return [
        ...(Array.isArray(value.snapshot.liveSteerQueue) ? value.snapshot.liveSteerQueue : []),
        ...(Array.isArray(value.snapshot.postFinishQueue) ? value.snapshot.postFinishQueue : []),
      ];
    }
  }

  return [];
}

function normalizeSteerQueueItem(item: unknown, index: number): SteerQueueItem | null {
  if (!isRecord(item)) return null;

  const parts = readSteerQueueItemParts(item);
  if (parts.length === 0) return null;

  const id =
    toStringValue(item.id) ??
    toStringValue(item.itemId) ??
    toStringValue(item.queueItemId) ??
    toStringValue(item.messageId) ??
    buildFallbackSteerQueueItemId(parts, index);

  return {
    id,
    parts,
    source:
      toStringValue(item.source) === "live" || toStringValue(item.source) === "post_finish"
        ? (toStringValue(item.source) as "live" | "post_finish")
        : undefined,
    status:
      toStringValue(item.status) === "queued" ||
      toStringValue(item.status) === "injecting" ||
      toStringValue(item.status) === "done" ||
      toStringValue(item.status) === "failed"
        ? (toStringValue(item.status) as "queued" | "injecting" | "done" | "failed")
        : undefined,
    createdAt: typeof item.createdAt === "number" ? item.createdAt : undefined,
    error: toStringValue(item.error),
  };
}

function readSteerQueueItemParts(item: Record<string, unknown>): QueueMessagePart[] {
  if (Array.isArray(item.parts)) {
    const normalizedParts = item.parts
      .map((part) => normalizeSteerQueuePart(part))
      .filter((part): part is QueueMessagePart => part !== null);

    if (normalizedParts.length > 0) {
      return normalizedParts;
    }
  }

  const text =
    toStringValue(item.directive) ??
    toStringValue(item.text) ??
    toStringValue(item.content) ??
    toStringValue(item.prompt) ??
    toStringValue(item.title);

  if (!text) return [];

  return [{ type: "text", text }];
}

function normalizeSteerQueuePart(part: unknown): QueueMessagePart | null {
  if (typeof part === "string") {
    const text = part.trim();
    return text ? { type: "text", text } : null;
  }

  if (!isRecord(part)) return null;

  const type = toStringValue(part.type) ?? "text";
  const text = toStringValue(part.text) ?? toStringValue(part.content);
  const url = toStringValue(part.url);
  const filename = toStringValue(part.filename);
  const mediaType = toStringValue(part.mediaType);

  if (!text && !url && !filename && !mediaType) {
    return null;
  }

  return {
    type,
    ...(text && { text }),
    ...(url && { url }),
    ...(filename && { filename }),
    ...(mediaType && { mediaType }),
  };
}

function createOptimisticSteerQueueItem(input: SteerQueueInput): SteerQueueItem {
  const parts = Array.isArray(input.parts)
    ? input.parts
    : input.text
      ? [{ type: "text", text: input.text }]
      : [{ type: "text", text: "Steer queue item" }];

  return {
    id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parts,
    status: "queued",
    source: input.mode === "post_finish" ? "post_finish" : input.mode === "live" ? "live" : undefined,
  };
}

async function callRemoveSteerQueueItem(agent: NonNullable<AgentConnection>, itemId: string) {
  const attempts: unknown[][] = [[{ itemId }], [{ id: itemId }], [itemId]];
  let lastError: unknown;

  for (const args of attempts) {
    try {
      await agent.call("removeSteerQueueItem", args);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

function buildFallbackSteerQueueItemId(parts: QueueMessagePart[], index: number): string {
  const seed = parts
    .map((part) => part.text ?? part.filename ?? part.url ?? part.type)
    .join("-");
  const slug = seed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `steer-queue-${index}-${slug || "item"}`;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
