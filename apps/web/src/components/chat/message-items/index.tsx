
import { memo, useMemo } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatAddToolApproveResponseFunction, FileUIPart } from "ai";
import { Check, X, PaperclipIcon } from "lucide-react";
import {
  Message,
  MessageContent,
  MessageActions,
} from "@/components/ai-elements/message";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
} from "@/components/ai-elements/attachments";
import { SourcesList } from "@/components/ai-elements/sources";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TextPart } from "./text-part";
import { FilePart } from "./file-part";
import { CopyButton } from "./copy-button";
import { RegenerateButton } from "./regenerate-button";
import { EditMessageButton } from "./edit-message-button";
import { ChainOfThoughtPart, isChainOfThoughtPart } from "./chain-of-thought-part";
import { ToolPart, getToolName, isToolPart, type ToolPartType } from "./tool-part";
import {
  useMessageEditing,
  extractMessageText,
  extractMessageFiles,
} from "@/hooks/use-chat";
import { extractSourcesFromMessage } from "@/lib/citations";

export interface MessageItemProps {
  message: UIMessage;
  isStreaming: boolean;
  toolApprovalResponse: ChatAddToolApproveResponseFunction;
  onRegenerate?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newText: string, files: FileUIPart[]) => void;
  // isLastAssistantMessage?: boolean;
  userMessageId?: string;
}

// Tools completely hidden from message (rendered elsewhere or extracted)
const HIDDEN_TOOLS = ["write_todos", "ask_user"];
// Tools rendered outside chain of thought but still shown inline
const INLINE_TOOLS: string[] = [];

function isHiddenTool(part: UIMessage["parts"][number]): boolean {
  return HIDDEN_TOOLS.includes(getToolName(part.type));
}

function isInlineTool(part: UIMessage["parts"][number]): boolean {
  return INLINE_TOOLS.includes(getToolName(part.type));
}

const getPartBaseKey = (part: UIMessage["parts"][number]) =>
  `${part.type}-${JSON.stringify(part)}`;

const getPartRenderKey = (part: UIMessage["parts"][number], keyCounts: Map<string, number>) => {
  const baseKey = getPartBaseKey(part);
  const next = (keyCounts.get(baseKey) ?? 0) + 1;
  keyCounts.set(baseKey, next);

  return `${baseKey}:${next}`;
};

type MessagePartDescriptor = {
  part: UIMessage["parts"][number];
  key: string;
};

export const MessageItem = memo(function MessageItem({
  message,
  isStreaming,
  toolApprovalResponse,
  onRegenerate,
  onEditMessage,
  userMessageId,
}: MessageItemProps) {
  const messageText = extractMessageText(message);
  const messageFiles = extractMessageFiles(message);
  const sources = useMemo(() => extractSourcesFromMessage(message), [message]);
  const containerClassName = "w-full px-3 @xl/chat-column:mx-auto @xl/chat-column:w-4xl @xl/chat-column:px-4";

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const {
    isEditing,
    editedText,
    setEditedText,
    editedFiles,
    textareaRef,
    fileInputRef,
    hasChanges,
    handleStartEdit,
    handleCancelEdit,
    handleRemoveFile,
    handleAddFiles,
    handleConfirmEdit,
    handleKeyDown,
  } = useMessageEditing(message, onEditMessage);

  const renderParts = () => {
    const elements: React.ReactNode[] = [];
    const partKeyCounts = new Map<string, number>();
    let chainGroup: MessagePartDescriptor[] = [];

    const flushChainGroup = () => {
      if (chainGroup.length > 0) {
        elements.push(
          <ChainOfThoughtPart
            key={`${message.id}-chain-${chainGroup[0].key}`}
            isStreaming={isStreaming}
            chainGroup={chainGroup}
            toolApprovalResponse={toolApprovalResponse}
          />
        );
        chainGroup = [];
      }
    };

    message.parts.forEach((part) => {
      const partKey = getPartRenderKey(part, partKeyCounts);

      // Skip step-start and hidden tools (rendered elsewhere)
      if (part.type === "step-start" || isHiddenTool(part)) {
        return;
      }

      // Inline tools (like ask_user) - render directly, not in chain
      if (isInlineTool(part) && isToolPart(part)) {
        flushChainGroup();
        elements.push(
          <ToolPart
            key={`${message.id}-${partKey}`}
            part={part as ToolPartType}
            partKey={partKey}
            toolApprovalResponse={toolApprovalResponse}
          />
        );
        return;
      }

      // Chain of thought parts (reasoning, tool calls, etc.)
      if (isChainOfThoughtPart(part)) {
        chainGroup.push({ part, key: partKey });
      } else {
        flushChainGroup();

        if (part.type === "text") {
          elements.push(
            <TextPart
              key={`${message.id}-${partKey}`}
              part={part}
              role={message.role}
              partKey={partKey}
              sources={sources}
            />
          );
        } else if (part.type === "file") {
          elements.push(
            <FilePart
              key={`${message.id}-${partKey}`}
              part={part}
              partKey={partKey}
            />
          );
        }
      }
    });

    flushChainGroup();

    return elements;
  };

  const handleRegenerate = () => {
    if (onRegenerate) {
      const idToRegenerate = isAssistant && userMessageId ? userMessageId : message.id;
      if (idToRegenerate) {
        onRegenerate(idToRegenerate);
      }
    }
  };

  if (isEditing && isUser) {
    return (
      <Message from={message.role} className={containerClassName}>
        <div className="flex flex-col gap-3 max-w-[70%] ml-auto">
          {editedFiles.length > 0 && (
            <Attachments variant="grid">
              {editedFiles.map((file, fileIndex) => (
                <Attachment
                  key={file.url}
                  data={{ ...file, id: file.url }}
                  onRemove={() => handleRemoveFile(fileIndex)}
                >
                  <AttachmentPreview />
                  <AttachmentRemove />
                </Attachment>
              ))}
            </Attachments>
          )}

          <Textarea
            ref={textareaRef}
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[80px] resize-none bg-muted/50 border-muted-foreground/20"
            placeholder="Edit your message..."
          />

          <div className="flex items-center justify-between">
            {/* Add file button */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                onChange={handleAddFiles}
                className="hidden"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 px-2"
              >
                <PaperclipIcon size={14} className="mr-1.5" />
                Add files
              </Button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelEdit}
                className="h-8 px-3"
              >
                <X size={14} className="mr-1.5" />
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleConfirmEdit}
                disabled={(!editedText.trim() && editedFiles.length === 0) || !hasChanges}
                className="h-8 px-3"
              >
                <Check size={14} className="mr-1.5" />
                Save & Submit
              </Button>
            </div>
          </div>
        </div>
      </Message>
    );
  }

  return (
    <Message from={message.role} className={containerClassName}>
      <div className="group/message">
        <MessageContent className="group-[.is-user]:max-w-[70%]">
          {renderParts()}
        </MessageContent>
        {isAssistant && sources.length > 0 && (
          <SourcesList sources={sources} className="mt-4" />
        )}
        {!isStreaming && (
          <MessageActions className="mt-2 opacity-0 transition-opacity group-hover/message:opacity-100 justify-end">
            {isUser && (messageText || messageFiles.length > 0) && onEditMessage && (
              <EditMessageButton onStartEdit={handleStartEdit} />
            )}
            {onRegenerate && (
              <RegenerateButton onRegenerate={handleRegenerate} />
            )}
            {messageText && <CopyButton text={messageText} />}
          </MessageActions>
        )}
      </div>
    </Message>
  );
}, (prev, next) => {
  // For completed messages (not streaming), skip re-render if ID matches
  if (!prev.isStreaming && !next.isStreaming) {
    if (prev.message.id !== next.message.id) return false;
    // Same completed message, no need to re-render
    return true;
  }
  // Streaming message needs updates
  return false;
});
