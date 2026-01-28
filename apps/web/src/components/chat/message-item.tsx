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
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
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
import { cn } from "@/lib/utils";

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
  key: number;
  part: Extract<UIMessage["parts"][number], { type: "reasoning" }>;
  isStreaming: boolean;
}

const ReasoningPart = memo(function ReasoningPart({ key, part, isStreaming }: ReasoningPartProps) {
  return (
    <ChainOfThoughtStep
      key={key}
      label="Reasoning"
      status={isStreaming ? "active" : "complete"}
    >
      <MessageResponse>{part.text}</MessageResponse>
    </ChainOfThoughtStep>
  );
});

interface ToolPartProps {
  part:  Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;
  partKey: number;
}

// Extract tool name from type: "tool-write_todos" -> "write_todos"
function getToolName(type: string): string {
  return type.slice(5); // Remove "tool-" prefix
}
function isToolPart(
  part: UIMessage["parts"][number]
): part is Extract<UIMessage["parts"][number], { type: `tool-${string}` }> {
  return part.type.startsWith("tool-");
}

const ToolPart = memo(function ToolPart({ part, partKey }: ToolPartProps) {
  const toolPart = part
  const toolName = getToolName(toolPart.type);

  return (
    <Tool key={partKey}>
      <ToolHeader type={toolPart.type} state={toolPart.state} toolName={toolName} />
      <ToolContent>
        <ToolInput input={toolPart.input} />
        <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
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

interface ChainOfThoughtPartProps {
  isStreaming: boolean;
  chainGroup: { part: UIMessage["parts"][number]; index: number }[];
}

const isChainOfThoughtPart = (part: UIMessage["parts"][number]): boolean => {
  return part.type === "reasoning" || isToolPart(part);
};

const ChainOfThoughtPart = memo(function ChainOfThoughtPart(props: ChainOfThoughtPartProps) {
  return (
    <ChainOfThought defaultOpen={false}>
      <ChainOfThoughtHeader className={cn(props.isStreaming ? "animate-pulse" : "", "w-fit")}>
        {props.isStreaming ? "Exploring..." : "Explored"}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {props.chainGroup.map(({ part: p, index }) => {
          if (p.type === "reasoning") {
            return (
              <ReasoningPart
                key={index}
                part={p}
                isStreaming={props.isStreaming}
              />
            );
          }
          if (isToolPart(p)) {
            return <ToolPart key={index} part={p} partKey={index} />;
          }
          return null;
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
});

export const MessageItem = memo(function MessageItem({ message, isStreaming }: MessageItemProps) {
  const messageText = message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as Extract<UIMessage["parts"][number], { type: "text" }>).text)
    .join("\n");

  const excludedTools = ["write_todos"];
  const isExcludedTool = (part: UIMessage["parts"][number]): boolean => {
    return excludedTools.includes(getToolName(part.type));
  };

  const renderParts = () => {
    const elements: React.ReactNode[] = [];
    let chainGroup: { part: UIMessage["parts"][number]; index: number }[] = [];

    message.parts.forEach((part, i) => {
      if (part.type === "step-start" || isExcludedTool(part)) {
        return;
      }
      if (isChainOfThoughtPart(part)) {
        chainGroup.push({ part, index: i });
      } else {
        if (chainGroup.length > 0) {
          elements.push(
            <ChainOfThoughtPart key={`chain-${chainGroup[0].index}`} isStreaming={isStreaming} chainGroup={chainGroup} />
          );
          chainGroup = [];
        }

        // Render the non-chain part
        if (part.type === "text") {
          elements.push(
            <TextPart key={i} part={part} role={message.role} partKey={i} />
          );
        } else if (part.type === "file") {
          elements.push(<FilePart key={i} part={part} partKey={i} />);
        }
      }
    });

    // Flush remaining chain group
    if (chainGroup.length > 0) {
      elements.push(
        <ChainOfThoughtPart key={`chain-${chainGroup[0].index}`} isStreaming={isStreaming} chainGroup={chainGroup} />
      );
    }

    return elements;
  };

  return (
    <Message from={message.role} className="mx-auto w-4xl px-4">
      <div className="group/message">
        <MessageContent className="group-[.is-user]:max-w-[70%]">
          {renderParts()}
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
