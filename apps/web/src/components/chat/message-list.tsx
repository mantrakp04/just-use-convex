"use client";

import { useEffect, useRef } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import type { FileUIPart } from "ai";
import { MessageItem } from "./message-items";
import type { QueueTodo } from "@/components/ai-elements/queue";
import type { ConfirmationProps } from "@/components/ai-elements/confirmation";
import {
  useTodosState,
  findLastAssistantMessageIndex,
  findPrecedingUserMessageId,
} from "@/hooks/use-chat";

type TodosArray = Array<{ content: string; status: string; id?: string }>;

export type TodosState = {
  todos: QueueTodo[];
  todosApproval?: ConfirmationProps['approval'];
  todosState?: ConfirmationProps['state'];
  todosToolCallId?: string;
  todosInput?: { todos?: TodosArray };
};


interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  toolApprovalResponse: ChatAddToolApproveResponseFunction;
  onRegenerate?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newText: string, files: FileUIPart[]) => void;
  onTodosChange?: (todosState: TodosState) => void;
}

export function MessageList({
  messages,
  isStreaming,
  toolApprovalResponse,
  onRegenerate,
  onEditMessage,
  onTodosChange,
}: MessageListProps) {
  const { scrollToBottom } = useStickToBottomContext();
  const prevMessagesLength = useRef(messages.length);
  const { handleTodosChange, syncTodosToParent } = useTodosState();

  const lastAssistantMessageIndex = findLastAssistantMessageIndex(messages);

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      scrollToBottom();
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    syncTodosToParent(onTodosChange);
  });

  return (
    <div className="flex flex-col gap-1">
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
            isLastAssistantMessage={index === lastAssistantMessageIndex}
            userMessageId={userMessageId}
            onTodosChange={index === lastAssistantMessageIndex ? handleTodosChange : undefined}
          />
        );
      })}
    </div>
  );
}
