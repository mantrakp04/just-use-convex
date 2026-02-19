
import { useEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import type { FileUIPart } from "ai";
import { MessageItem } from "./message-items";
import { findPrecedingUserMessageId } from "@/hooks/use-chat";
import { useHeader } from "@/hooks/use-header";

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  toolApprovalResponse: ChatAddToolApproveResponseFunction;
  onRegenerate?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newText: string, files: FileUIPart[]) => void;
}

export function MessageList({
  messages,
  isStreaming,
  toolApprovalResponse,
  onRegenerate,
  onEditMessage,
}: MessageListProps) {
  const { scrollToBottom } = useStickToBottomContext();
  const prevMessagesLength = useRef(messages.length);
  const { headerHeight } = useHeader();

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      scrollToBottom();
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, scrollToBottom]);

  const messageListPaddingTop = messages.length > 0 ? headerHeight : 0;

  return (
    <div className="flex flex-col gap-1" style={{ paddingTop: messageListPaddingTop }}>
      {messages.map((message, index) => {
        const userMessageId =
          message.role === "assistant"
            ? findPrecedingUserMessageId(messages, index)
            : undefined;

        return (
          <MessageItem
            key={message.id}
            message={message}
            isStreaming={isStreaming && index === messages.length - 1}
            toolApprovalResponse={toolApprovalResponse}
            onRegenerate={onRegenerate}
            onEditMessage={onEditMessage}
            userMessageId={userMessageId}
          />
        );
      })}
    </div>
  );
}
