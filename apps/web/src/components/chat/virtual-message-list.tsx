"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStickToBottomContext } from "use-stick-to-bottom";
import type { UIMessage } from "@ai-sdk/react";
import { MessageItem } from "./message-item";

interface VirtualMessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
}

export function VirtualMessageList({ messages, isStreaming }: VirtualMessageListProps) {
  const { scrollRef, scrollToBottom } = useStickToBottomContext();
  const prevMessagesLength = useRef(messages.length);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    gap: 32,
    overscan: 5,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      // New message added, scroll to bottom
      scrollToBottom();
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, scrollToBottom]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  return (
    <div
      style={{
        height: `${totalSize}px`,
        width: "100%",
        position: "relative",
      }}
    >
      {virtualItems.map((virtualItem) => (
        <div
          key={virtualItem.key}
          data-index={virtualItem.index}
          ref={virtualizer.measureElement}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${virtualItem.start}px)`,
          }}
        >
          <MessageItem
            message={messages[virtualItem.index]!}
            isStreaming={isStreaming}
          />
        </div>
      ))}
    </div>
  );
}
