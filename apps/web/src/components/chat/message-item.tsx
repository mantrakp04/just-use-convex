"use client";

import type { UIMessage } from "@ai-sdk/react";
import { memo, useCallback, useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
} from "@/components/ai-elements/message";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
} from "@/components/ai-elements/attachments";

export interface MessageItemProps {
  message: UIMessage;
  isStreaming: boolean;
}

interface TextPartProps {
  part: Extract<UIMessage["parts"][number], { type: "text" }>;
  role: UIMessage["role"];
  partKey: number;
}

function TextPart({ part, role, partKey }: TextPartProps) {
  return role === "user" ? (
    <p key={partKey} className="whitespace-pre-wrap">
      {part.text}
    </p>
  ) : (
    <MessageResponse key={partKey}>{part.text}</MessageResponse>
  );
}

interface ReasoningPartProps {
  part: Extract<UIMessage["parts"][number], { type: "reasoning" }>;
  isStreaming: boolean;
  partKey: number;
}

const ReasoningPart = memo(function ReasoningPart({ part, isStreaming, partKey }: ReasoningPartProps) {
  return (
    <Reasoning key={partKey} isStreaming={isStreaming}>
      <ReasoningTrigger />
      <ReasoningContent>{part.text}</ReasoningContent>
    </Reasoning>
  );
});

interface ToolPartProps {
  part: Extract<UIMessage["parts"][number], { type: "dynamic-tool" }>;
  partKey: number;
}

const ToolPart = memo(function ToolPart({ part, partKey }: ToolPartProps) {
  return (
    <Tool key={partKey}>
      <ToolHeader type="dynamic-tool" state={part.state} toolName={part.toolName} />
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  );
});

interface FilePartProps {
  part: Extract<UIMessage["parts"][number], { type: "file" }>;
  partKey: number;
}

const FilePart = memo(function FilePart({ part, partKey }: FilePartProps) {
  return (
    <Attachments key={partKey} variant="grid">
      <Attachment data={{ ...part, id: String(partKey) }}>
        <AttachmentPreview />
      </Attachment>
    </Attachments>
  );
});

const CopyButton = memo(function CopyButton({ text }: { text: string }) {
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

  return (
    <Tooltip>
      <TooltipTrigger
        onClick={handleCopy}
        className="inline-flex items-center justify-center rounded-md p-1 hover:bg-accent hover:text-accent-foreground transition-colors"
        aria-label={copied ? "Copied" : "Copy message"}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </TooltipTrigger>
      <TooltipContent>
        <p>{copied ? "Copied!" : "Copy message"}</p>
      </TooltipContent>
    </Tooltip>
  );
});

export const MessageItem = memo(function MessageItem({ message, isStreaming }: MessageItemProps) {
  const messageText = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as Extract<UIMessage["parts"][number], { type: "text" }>).text)
    .join("\n");

  return (
    <Message from={message.role} className="mx-auto w-4xl px-4">
      <div className="group/message">
        <MessageContent className="group-[.is-user]:max-w-[70%]">
          {message.parts.map((part, i) => {
            if (part.type === "text") {
              return <TextPart key={i} part={part} role={message.role} partKey={i} />;
            }

            if (part.type === "reasoning") {
              return (
                <ReasoningPart key={i} part={part} isStreaming={isStreaming} partKey={i} />
              );
            }

            if (part.type === "dynamic-tool") {
              return <ToolPart key={i} part={part} partKey={i} />;
            }

            if (part.type === "file") {
              return <FilePart key={i} part={part} partKey={i} />;
            }

            return null;
          })}
        </MessageContent>
        {messageText && !isStreaming && (
          <MessageActions className="mt-2 opacity-0 transition-opacity group-hover/message:opacity-100 justify-end">
            <CopyButton text={messageText} />
          </MessageActions>
        )}
      </div>
    </Message>
  );
});
