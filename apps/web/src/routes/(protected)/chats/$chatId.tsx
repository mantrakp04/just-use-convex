import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { useHeader } from "@/hooks/use-header";

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
  const sandbox = useChatSandbox(typedChatId, agent);
  const chatContentRef = useRef<HTMLDivElement>(null);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const { headerHeight } = useHeader();
  
  const selectedModel = useMemo(
    () => models.find((m: OpenRouterModel) => m.slug === settings.model),
    [models, settings.model]
  );

  const [todosState, setTodosState] = useState<TodosState>({ todos: [] });
  const [askUserState, setAskUserState] = useState<AskUserState | null>(null);

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

  useEffect(() => {
    // Find StickToBottom's internal scroll container via the role="log" element
    const scrollEl = chatContentRef.current
      ?.querySelector('[role="log"]')
      ?.firstElementChild as HTMLElement | null;

    // Save scroll ratio before the width change causes content reflow
    let scrollRatio: number | null = null;
    if (scrollEl) {
      const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (maxScroll > 0 && scrollEl.scrollTop > 0) {
        scrollRatio = scrollEl.scrollTop / maxScroll;
      }
    }

    // Disable StickToBottom's resize handling so it doesn't fight our restoration
    setIsPanelResizing(true);

    // Restore scroll position proportionally as content reflows from the width change
    if (scrollRatio !== null && scrollEl) {
      const restoreScroll = () => {
        const newMaxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
        if (newMaxScroll > 0) {
          scrollEl.scrollTop = scrollRatio! * newMaxScroll;
        }
      };

      const observer = new ResizeObserver(restoreScroll);
      observer.observe(scrollEl);

      const timeout = setTimeout(() => {
        restoreScroll();
        observer.disconnect();
        setIsPanelResizing(false);
      }, 300);

      return () => {
        observer.disconnect();
        clearTimeout(timeout);
        setIsPanelResizing(false);
      };
    }

    const timeout = setTimeout(() => setIsPanelResizing(false), 300);
    return () => {
      clearTimeout(timeout);
      setIsPanelResizing(false);
    };
  }, [sandbox.isOpen]);

  if (!isReady || !chat) {
    return (
      <div className="h-full w-full">
        <ChatLoadingSkeleton />
      </div>
    );
  }

  const chatContent = (
    <div ref={chatContentRef} className="flex h-full w-full flex-col @container/chat-column">
      <Conversation className="flex-1" resize={isPanelResizing ? undefined : "smooth"}>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<Bot className="size-12 opacity-50" />}
              style={{ marginTop: headerHeight }}
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

  return (
    <ResizablePanelGroup orientation="horizontal" className="fixed inset-0 z-0 h-svh w-full">
      <ResizablePanel defaultSize={sandbox.isOpen ? 65 : 100} minSize={20}>
        {chatContent}
      </ResizablePanel>
      {sandbox.isOpen && (
        <>
          <ResizableHandle withHandle className="z-10" />
          <ResizablePanel defaultSize={35} minSize={25}>
          <ChatSandboxWorkspace
            sshSession={sandbox.sshSession}
            explorer={sandbox.explorer}
            terminalSessions={sandbox.terminalSessions}
            activeTerminalId={sandbox.activeTerminalId}
            onRefreshExplorer={() => void sandbox.refreshExplorer()}
            onNavigateExplorer={(path) => void sandbox.navigateExplorer(path)}
            onDownloadFile={(path, name) => void sandbox.downloadFile(path, name)}
            onDownloadFolder={(path, name) => void sandbox.downloadFolder(path, name)}
            onDeleteEntry={(path) => void sandbox.deleteEntry(path)}
            onRefreshTerminalSessions={() => void sandbox.refreshTerminalSessions()}
            onSwitchTerminalSession={sandbox.switchTerminalSession}
            onCreateTerminalSession={sandbox.createTerminalSession}
            onCloseTerminalSession={sandbox.closeTerminalSession}
            previewPort={sandbox.previewPort}
            previewUrl={sandbox.previewUrl}
            isConnectingPreview={sandbox.isConnectingPreview}
            onPreviewPortChange={sandbox.setPreviewPort}
            onCreatePreviewAccess={sandbox.createPreviewAccess}
            onOpenInEditor={sandbox.openInEditor}
            onReconnectTerminal={sandbox.reconnectTerminal}
            onFocusTerminal={sandbox.focusTerminal}
            terminalContainerRef={sandbox.terminalContainerRef}
            terminalBackground={sandbox.terminalBackground}
          />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
