import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import type { UIMessage } from "@ai-sdk/react";
import { useCallback, useMemo } from "react";
import { useOpenRouterModels, type OpenRouterModel } from "@/hooks/use-openrouter-models";
import { ChatInput, type ChatInputProps } from "@/components/chat";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import { Skeleton } from "@/components/ui/skeleton";
import { VirtualMessageList } from "@/components/chat/virtual-message-list";
import type { QueueTodo } from "@/components/ai-elements/queue";
import { useAgentInstance } from "@/providers/agent";
import { TodosDisplay } from "@/components/chat/todos-display";

export const Route = createFileRoute("/(protected)/chats/$chatId")({
  component: ChatPage,
});

function ChatLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto w-full">
      <Skeleton className="h-16 w-3/4 rounded-lg" />
      <Skeleton className="h-16 w-2/3 rounded-lg self-end" />
      <Skeleton className="h-16 w-3/4 rounded-lg" />
      <Skeleton className="h-16 w-1/2 rounded-lg self-end" />
    </div>
  );
}

function ChatPage() {
  const { chatId } = Route.useParams();
  const { chat, settings, setSettings, isReady } = useAgentInstance(chatId);
  const { groupedModels, models } = useOpenRouterModels();

  const selectedModel = useMemo(
    () => models.find((m: OpenRouterModel) => m.slug === settings.model),
    [models, settings.model]
  );

  // Extract values safely before any conditional returns to maintain hook order
  const messages = chat?.messages ?? [];
  const sendMessage = chat?.sendMessage;

  const handleSubmit: ChatInputProps["onSubmit"] = useCallback(
    async ({ text, files }: { text: string; files: Array<{ url: string; mediaType: string; filename?: string }> }) => {
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

  const derivedState = useMemo(() => {
    const state = {
      todos: [] as QueueTodo[],
    };

    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== "assistant") return state;

    for (const part of lastMsg.parts) {
      if (part.type === "tool-write_todos") {
        const toolPart = part as { input?: { todos?: Array<{ content: string; status: string; id?: string }> }; output?: { todos?: Array<{ content: string; status: string; id?: string }> } };
        const todosData = toolPart.output?.todos ?? toolPart.input?.todos;
        if (todosData) {
          state.todos = todosData.map((t) => ({
            id: t.id!,
            title: t.content,
            status: t.status as "pending" | "in_progress" | "done",
          }));
        }
      }
    }

    return state;
  }, [messages]);

  if (!isReady || !chat) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex">
          <ChatLoadingSkeleton />
        </div>
      </div>
    );
  }

  const { status, error, stop } = chat;
  const isStreaming = status === "streaming";

  return (
    <div className="flex flex-col h-full w-full">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<Bot className="size-12 opacity-50" />}
              title="Start a conversation"
              description="Ask me anything or share files to get started"
            />
          ) : (
            <VirtualMessageList messages={messages} isStreaming={isStreaming} />
          )}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3 mx-auto w-4xl">
              {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-4xl">
        <TodosDisplay todos={derivedState.todos} />
      </div>
      <ChatInput
        onSubmit={handleSubmit}
        status={status}
        onStop={stop}
        settings={settings}
        setSettings={setSettings}
        groupedModels={groupedModels}
        models={models}
        selectedModel={selectedModel}
        hasMessages={messages.length > 0}
      />
    </div>
  );
}
