import { createFileRoute } from "@tanstack/react-router";
import { useAgentChatInstance } from "@/providers/agents";
import { Bot } from "lucide-react";
import type { UIMessage } from "@ai-sdk/react";
import { useMemo } from "react";
import { useOpenRouterModels } from "@/hooks/use-openrouter-models";
import { ChatInput, type ChatInputProps } from "@/components/chat";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation";
import { Skeleton } from "@/components/ui/skeleton";
import { VirtualMessageList } from "@/components/chat/virtual-message-list";

export const Route = createFileRoute("/(protected)/chat")({
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
  const { messages, sendMessage, status, error, isConnected, settings, setSettings, stop } = useAgentChatInstance({
    name: "chat",
    onError: (err: Error) => {
      console.error("Chat error:", err);
    },
  });

  const { groupedModels, models } = useOpenRouterModels();

  const isStreaming = status === "streaming" && messages[messages.length - 1]?.role === "assistant";

  const selectedModel = useMemo(
    () => models.find((m) => m.slug === settings.model),
    [models, settings.model]
  );

  const handleSubmit: ChatInputProps["onSubmit"] = async ({ text, files }) => {
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
  };

  if (!isConnected) {
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
            <VirtualMessageList messages={messages} isStreaming={isStreaming} />
          )}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">
              {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <ChatInput
        onSubmit={handleSubmit}
        status={status}
        onStop={stop}
        settings={settings}
        setSettings={setSettings}
        groupedModels={groupedModels}
        models={models}
        selectedModel={selectedModel}
      />
    </div>
  );
}
