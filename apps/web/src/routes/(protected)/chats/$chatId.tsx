import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { useMemo, useState } from "react";
import { useOpenRouterModels, type OpenRouterModel } from "@/hooks/use-openrouter-models";
import { ChatInput } from "@/components/chat";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageList, type TodosState } from "@/components/chat/message-list";
import { useAgentInstance } from "@/providers/agent";
import { TodosDisplay } from "@/components/chat/todos-display";
import { useChat } from "@/hooks/use-chat";

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
  const { chat, agent, settings, setSettings, isReady } = useAgentInstance(chatId);
  const { groupedModels, models } = useOpenRouterModels();

  const selectedModel = useMemo(
    () => models.find((m: OpenRouterModel) => m.slug === settings.model),
    [models, settings.model]
  );

  const [todosState, setTodosState] = useState<TodosState>({ todos: [] });

  const {
    status,
    error,
    stop,
    messages,
    isStreaming,
    handleSubmit,
    handleToolApprovalResponse,
    handleRegenerate,
    handleEditMessage,
  } = useChat(chat, agent);

  if (!isReady || !chat) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex">
          <ChatLoadingSkeleton />
        </div>
      </div>
    );
  }

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
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              toolApprovalResponse={handleToolApprovalResponse}
              onRegenerate={handleRegenerate}
              onEditMessage={handleEditMessage}
              onTodosChange={setTodosState}
            />
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
        <TodosDisplay
          todos={todosState.todos}
          approval={todosState.todosApproval}
          state={todosState.todosState}
          toolApprovalResponse={handleToolApprovalResponse}
        />
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
