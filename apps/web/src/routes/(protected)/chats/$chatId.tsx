import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { useOpenRouterModels, type OpenRouterModel } from "@/hooks/use-openrouter-models";
import { ChatInput } from "@/components/chat";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageList } from "@/components/chat/message-list";
import type { AskUserState, TodosState } from "@/components/chat/types";
import { useAgentInstance } from "@/providers/agent";
import { TodosDisplay } from "@/components/chat/todos-display";
import { useChat } from "@/hooks/use-chat";
import { AskUserDisplay } from "@/components/chat/ask-user-display";
import { ChatSandboxWorkspace } from "@/components/chat/chat-sandbox-workspace";
import { useChatSandbox } from "@/hooks/use-sandbox";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

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
  const typedChatId = chatId as Id<"chats">;
  const { chat, agent, settings, setSettings, isReady } = useAgentInstance(chatId);
  const { groupedModels, models } = useOpenRouterModels();
  const sandbox = useChatSandbox(typedChatId);
  const [headerHeight, setHeaderHeight] = useState(0);

  const selectedModel = useMemo(
    () => models.find((m: OpenRouterModel) => m.slug === settings.model),
    [models, settings.model]
  );

  const [todosState, setTodosState] = useState<TodosState>({ todos: [] });
  const [askUserState, setAskUserState] = useState<AskUserState | null>(null);

  useEffect(() => {
    const header = document.getElementById("app-header");
    if (!header) {
      return;
    }

    const updateHeaderHeight = () => {
      setHeaderHeight(header.getBoundingClientRect().height);
    };

    updateHeaderHeight();
    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    resizeObserver.observe(header);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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
      <div className="flex h-svh flex-col">
        <div className="flex-1 flex">
          <ChatLoadingSkeleton />
        </div>
      </div>
    );
  }

  const chatContent = (
    <div className="flex h-full w-full flex-col @container/chat-column">
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
              headerHeight={headerHeight}
              onRegenerate={handleRegenerate}
              onEditMessage={handleEditMessage}
              onTodosChange={setTodosState}
              onAskUserChange={setAskUserState}
            />
          )}
          {error && (
            <div className="w-full rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive @xl/chat-column:mx-auto @xl/chat-column:w-4xl">
              {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="w-full px-3 @xl/chat-column:mx-auto @xl/chat-column:w-4xl @xl/chat-column:px-0">
        {askUserState?.state === "approval-requested" ? (
          <AskUserDisplay
            input={askUserState.input}
            approval={askUserState.approval}
            state={askUserState.state}
            toolApprovalResponse={handleToolApprovalResponse}
          />
        ) : (
          <TodosDisplay
            todos={todosState.todos}
            approval={todosState.todosApproval}
            state={todosState.todosState}
            toolApprovalResponse={handleToolApprovalResponse}
          />
        )}
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
        onSandboxToggle={() => void sandbox.toggle()}
        isSandboxPanelOpen={sandbox.isOpen}
        isSandboxConnecting={sandbox.isConnectingSsh}
      />
    </div>
  );

  if (!sandbox.isOpen) {
    return chatContent;
  }

  return (
    <div className="h-full w-full">
      <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
        <ResizablePanel defaultSize={25} minSize={20}>
          {chatContent}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75} minSize={25}>
          <ChatSandboxWorkspace
            sshSession={sandbox.sshSession}
            previewPort={sandbox.previewPort}
            previewUrl={sandbox.previewUrl}
            isConnectingPreview={sandbox.isConnectingPreview}
            onPreviewPortChange={sandbox.setPreviewPort}
            onCreatePreviewAccess={sandbox.createPreviewAccess}
            onCopySshCommand={sandbox.copySshCommand}
            onOpenInEditor={sandbox.openInEditor}
            agent={agent}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
