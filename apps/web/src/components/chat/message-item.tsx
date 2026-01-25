import type { UIMessage } from "@ai-sdk/react";
import { memo } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
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

const TextPart = memo(function TextPart({ part, role, partKey }: TextPartProps) {
  return role === "user" ? (
    <p key={partKey} className="whitespace-pre-wrap">
      {part.text}
    </p>
  ) : (
    <MessageResponse key={partKey}>{part.text}</MessageResponse>
  );
});

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

export const MessageItem = memo(function MessageItem({ message, isStreaming }: MessageItemProps) {
  return (
    <Message from={message.role} className="mx-auto w-4xl px-4">
      <MessageContent>
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
    </Message>
  );
});
