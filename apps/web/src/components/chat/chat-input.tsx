import { PaperclipIcon } from "lucide-react";
import type { OpenRouterModel } from "@/hooks/use-openrouter-models";
import type { FileUIPart } from "ai";
import type { useAgentChat } from "@cloudflare/ai-chat/react";
import { memo, useCallback } from "react";
import { useSetAtom } from "jotai";
import { defaultChatSettingsAtom } from "@/store/models";
import { useAttachments } from "@/hooks/use-attachments";

export type ChatSettings = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  inputModalities?: string[];
};
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentProgress,
  AttachmentRemove,
} from "@/components/ai-elements/attachments";
import { ChatModelSelector } from "./chat-model-selector";
import { ReasoningEffortSelector } from "./reasoning-effort-selector";

export type ChatInputProps = {
  onSubmit: (message: { text: string; files: FileUIPart[] }) => void;
  status: NonNullable<ReturnType<typeof useAgentChat>>["status"];
  onStop?: () => void;
  settings: ChatSettings;
  setSettings: (settings: ChatSettings | ((prev: ChatSettings) => ChatSettings)) => void;
  groupedModels: [string, OpenRouterModel[]][];
  models: OpenRouterModel[];
  selectedModel?: OpenRouterModel;
  hasMessages: boolean;
};

export const ChatInput = memo(function ChatInput({
  onSubmit,
  status,
  onStop,
  settings,
  setSettings,
  groupedModels,
  models,
  selectedModel,
  hasMessages,
}: ChatInputProps) {
  const supportsReasoning = selectedModel?.supports_reasoning ?? false;
  const setDefaultSettings = useSetAtom(defaultChatSettingsAtom);
  const { uploadAttachment, isUploading } = useAttachments();

  const handleReasoningChange = useCallback(
    (effort: ChatSettings["reasoningEffort"]) => {
      setSettings((prev) => ({ ...prev, reasoningEffort: effort }));
      if (!hasMessages) {
        setDefaultSettings((prev) => ({ ...prev, reasoningEffort: effort }));
      }
    },
    [setSettings, setDefaultSettings, hasMessages]
  );

  return (
    <div className="pb-1 mx-auto w-4xl">
      <PromptInput
        onSubmit={onSubmit}
        multiple
        uploadAttachment={uploadAttachment}
        isUploading={isUploading}
      >
        <PromptInputAttachmentsDisplay />
        <PromptInputTextarea placeholder="Type a message..." />
        <PromptInputFooter>
          <PromptInputTools>
            <AttachmentButton />
            <ChatModelSelector
              groupedModels={groupedModels}
              models={models}
              selectedModel={selectedModel}
              onSettingsChange={setSettings}
              hasMessages={hasMessages}
            />
            {supportsReasoning && (
              <ReasoningEffortSelector
                currentEffort={settings.reasoningEffort}
                onSelect={handleReasoningChange}
              />
            )}
          </PromptInputTools>
          <PromptInputSubmit status={status} onStop={onStop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
})

function AttachmentButton() {
  const attachments = usePromptInputAttachments();

  return (
    <PromptInputButton onClick={() => attachments.openFileDialog()} size="icon-xs">
      <PaperclipIcon className="size-4" />
    </PromptInputButton>
  );
}

function PromptInputAttachmentsDisplay() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="grid" className="w-full px-1 pt-1">
      {attachments.files.map((file) => (
        <Attachment key={file.id} data={file} onRemove={() => attachments.remove(file.id)}>
          <AttachmentPreview />
          <AttachmentProgress />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}
