"use client";

import { memo } from "react";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TextPart } from "./text-part";
import { FilePart } from "./file-part";
import { CopyButton } from "./copy-button";
import { RegenerateButton } from "./regenerate-button";
import { EditMessageButton } from "./edit-message-button";
import { ChainOfThoughtPart, isChainOfThoughtPart } from "./chain-of-thought-part";
import { getToolName } from "./tool-part";
import type { TodosState } from "../message-list";
import {
  useMessageEditing,
  extractMessageText,
  extractMessageFiles,
  extractTodosFromMessage,
} from "@/hooks/use-chat";

export interface MessageItemProps {
  message: UIMessage;
  isStreaming: boolean;
  toolApprovalResponse: ChatAddToolApproveResponseFunction;
  onRegenerate?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newText: string, files: FileUIPart[]) => void;
  isLastAssistantMessage?: boolean;
  userMessageId?: string;
  onTodosChange?: (todosState: TodosState) => void;
}

const EXCLUDED_TOOLS = ["write_todos"];

function isExcludedTool(part: UIMessage["parts"][number]): boolean {
  return EXCLUDED_TOOLS.includes(getToolName(part.type));
}

export const MessageItem = memo(function MessageItem({
  message,
  isStreaming,
  toolApprovalResponse,
  onRegenerate,
  onEditMessage,
  isLastAssistantMessage,
  userMessageId,
  onTodosChange,
}: MessageItemProps) {
  const messageText = extractMessageText(message);
  const messageFiles = extractMessageFiles(message);

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
            <ChainOfThoughtPart
              key={`${message.id}-chain-${chainGroup[0].index}`}
              isStreaming={isStreaming}
              chainGroup={chainGroup}
              toolApprovalResponse={toolApprovalResponse}
            />
          );
          chainGroup = [];
        }

        if (part.type === "text") {
          elements.push(
            <TextPart key={`${message.id}-text-${i}`} part={part} role={message.role} partKey={i} />
          );
        } else if (part.type === "file") {
          elements.push(<FilePart key={`${message.id}-file-${i}`} part={part} partKey={i} />);
        }
      }
    });

    if (chainGroup.length > 0) {
      elements.push(
        <ChainOfThoughtPart
          key={`${message.id}-chain-${chainGroup[0].index}`}
          isStreaming={isStreaming}
          chainGroup={chainGroup}
          toolApprovalResponse={toolApprovalResponse}
        />
      );
    }

    if (isLastAssistantMessage && onTodosChange) {
      const todosState = extractTodosFromMessage(message, isLastAssistantMessage);
      if (todosState) {
        onTodosChange(todosState);
      }
    }

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
      <Message from={message.role} className="mx-auto w-4xl px-4">
        <div className="flex flex-col gap-3 max-w-[70%] ml-auto">
          {editedFiles.length > 0 && (
            <Attachments variant="grid">
              {editedFiles.map((file, index) => (
                <Attachment
                  key={`${file.url}-${index}`}
                  data={{ ...file, id: String(index) }}
                  onRemove={() => handleRemoveFile(index)}
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
    <Message from={message.role} className="mx-auto w-4xl px-4">
      <div className="group/message">
        <MessageContent className="group-[.is-user]:max-w-[70%]">
          {renderParts()}
        </MessageContent>
        {!isStreaming && (
          <MessageActions className="mt-2 opacity-0 transition-opacity group-hover/message:opacity-100 justify-end">
            {isUser && (messageText || messageFiles.length > 0) && onEditMessage && (
              <EditMessageButton onStartEdit={handleStartEdit} />
            )}
            {isAssistant && isLastAssistantMessage && onRegenerate && (
              <RegenerateButton onRegenerate={handleRegenerate} />
            )}
            {messageText && <CopyButton text={messageText} />}
          </MessageActions>
        )}
      </div>
    </Message>
  );
});
