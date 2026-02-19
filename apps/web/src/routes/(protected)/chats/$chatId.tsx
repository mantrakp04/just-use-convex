import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
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
import { useAgentInstance } from "@/providers/agent";
import { TodosDisplay } from "@/components/chat/todos-display";
import {
  extractAskUserFromMessage,
  extractTodosFromMessage,
  findLastAssistantMessageIndex,
  useChat,
} from "@/hooks/use-chat";
import { useChat as useConvexChat } from "@/hooks/use-chats";
import { AskUserDisplay } from "@/components/chat/ask-user-display";
import { ChatSandboxWorkspace } from "@/components/chat/chat-sandbox-workspace";
import { useChatSandbox } from "@/hooks/use-sandbox";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useHeader } from "@/hooks/use-header";
import { cn } from "@/lib/utils";

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

const PANEL_TRANSITION = "flex-grow 300ms cubic-bezier(0.32, 0.72, 0, 1)";

function ChatPage() {
  const { chatId } = Route.useParams();
  const typedChatId = chatId as Id<"chats">;
  const { chat, agent, settings, setSettings, isReady } = useAgentInstance(chatId);
  const { data: convexChat } = useConvexChat(typedChatId);
  const { groupedModels, models } = useOpenRouterModels();
  const sandbox = useChatSandbox(typedChatId, agent);
  const chatContentRef = useRef<HTMLDivElement>(null);
  const sandboxPanelRef = useRef<PanelImperativeHandle>(null);
  const [isPanelResizing, setIsPanelResizing] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const isFirstRender = useRef(true);
  const { headerHeight } = useHeader();

  const selectedModel = useMemo(
    () => models.find((m: OpenRouterModel) => m.slug === settings.model),
    [models, settings.model]
  );

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

  const lastAssistantMessage = useMemo(() => {
    const assistantIndex = findLastAssistantMessageIndex(messages);
    return assistantIndex >= 0 ? messages[assistantIndex] : null;
  }, [messages]);

  const lastAssistantTodosState = useMemo(() => {
    const extractedState =
      lastAssistantMessage ? extractTodosFromMessage(lastAssistantMessage, true) : null;
    return extractedState ?? { todos: [] };
  }, [lastAssistantMessage]);

  const lastAssistantAskUserState = useMemo(() => {
    if (!lastAssistantMessage) {
      return null;
    }

    return extractAskUserFromMessage(lastAssistantMessage, true);
  }, [lastAssistantMessage]);

  const activeAskUserState =
    lastAssistantAskUserState?.state === "approval-requested" ? lastAssistantAskUserState : null;

  // Sync sandbox.isOpen with panel collapse/expand via imperative API
  useEffect(() => {
    const panel = sandboxPanelRef.current;
    if (!panel) return;

    // Skip animation on first render — defaultSize handles initial state
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    setIsAnimating(true);

    if (sandbox.isOpen) {
      panel.expand();
    } else {
      panel.collapse();
    }

    const timeout = setTimeout(() => setIsAnimating(false), 300);
    return () => clearTimeout(timeout);
  }, [sandbox.isOpen]);

  // Preserve scroll position during panel resize animation
  useEffect(() => {
    const scrollEl = chatContentRef.current
      ?.querySelector('[role="log"]')
      ?.firstElementChild as HTMLElement | null;

    let scrollRatio: number | null = null;
    if (scrollEl) {
      const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      if (maxScroll > 0 && scrollEl.scrollTop > 0) {
        scrollRatio = scrollEl.scrollTop / maxScroll;
      }
    }

    setIsPanelResizing(true);

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
        {activeAskUserState ? (
          <AskUserDisplay
            input={activeAskUserState.input}
            approval={activeAskUserState.approval}
            state={activeAskUserState.state}
            toolApprovalResponse={handleToolApprovalResponse}
          />
        ) : (
          <TodosDisplay
            todos={lastAssistantTodosState.todos}
            approval={lastAssistantTodosState.todosApproval}
            state={lastAssistantTodosState.todosState}
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
        {...(convexChat?.sandboxId && {
          onSandboxToggle: () => void sandbox.toggle(),
          isSandboxPanelOpen: sandbox.isOpen,
          isSandboxConnecting: sandbox.isConnectingSsh,
        })}
      />
    </div>
  );

  const panelTransitionStyle = isAnimating
    ? { transition: PANEL_TRANSITION }
    : undefined;

  return (
    <ResizablePanelGroup orientation="horizontal" className="fixed inset-0 z-0 h-svh w-full">
      <ResizablePanel
        defaultSize={sandbox.isOpen ? 65 : 100}
        minSize={20}
        style={panelTransitionStyle}
      >
        {chatContent}
      </ResizablePanel>
      <ResizableHandle
        withHandle
        className={cn(
          "z-10 transition-[opacity,width] duration-300",
          !sandbox.isOpen && "pointer-events-none opacity-0"
        )}
      />
      <ResizablePanel
        panelRef={sandboxPanelRef}
        defaultSize={sandbox.isOpen ? 35 : 0}
        minSize={25}
        collapsible
        collapsedSize={0}
        style={panelTransitionStyle}
      >
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
    </ResizablePanelGroup>
  );
}
