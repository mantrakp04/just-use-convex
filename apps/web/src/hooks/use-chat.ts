import { useCallback, useState, useRef, useEffect } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatAddToolApproveResponseFunction, FileUIPart } from "ai";
import type { useAgentChat } from "@cloudflare/ai-chat/react";
import type { TodosState } from "@/components/chat/message-list";
import { isToolPart } from "@/components/chat/message-items/tool-part";

type AgentChatInstance = ReturnType<typeof useAgentChat>;
type AgentConnection = {
  call: (method: string, args?: unknown[]) => Promise<unknown>;
} | null;

type TodosArray = Array<{ content: string; status: string; id?: string }>;

const mapTodoStatus = (status: string): "pending" | "in_progress" | "done" =>
  status as "pending" | "in_progress" | "done";

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

export function extractTodosFromMessage(
  message: UIMessage,
  isLastAssistantMessage: boolean
): TodosState | null {
  if (!isLastAssistantMessage || message.role !== "assistant") {
    return null;
  }

  for (const part of message.parts) {
    if (isToolPart(part) && part.type === "tool-write_todos") {
      const input = part.input as { todos?: TodosArray } | undefined;
      const output = part.output as { todos?: TodosArray } | undefined;
      const todosData = output?.todos ?? input?.todos;
      return {
        todos: todosData
          ? todosData.map((t: { content: string; status: string; id?: string }) => ({
              id: t.id!,
              title: t.content,
              status: mapTodoStatus(t.status),
            }))
          : [],
        todosApproval: "approval" in part ? part.approval : undefined,
        todosState: part.state,
        todosToolCallId: part.toolCallId,
        todosInput: input,
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
      files: Array<{ url: string; mediaType: string; filename?: string }>;
    }) => {
      if (!sendMessage) return;
      if (!text.trim() && files.length === 0) return;

      const parts: UIMessage["parts"] = [];

      if (text.trim()) {
        parts.push({ type: "text", text });
      }

      for (const file of files) {
        parts.push({
          type: "file",
          url: file.url,
          mediaType: file.mediaType,
          filename: file.filename,
        });
      }

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
