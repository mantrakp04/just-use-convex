import { Loader2Icon, PaperclipIcon, SquareTerminalIcon } from "lucide-react";
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
  onSandboxToggle?: () => void;
  isSandboxPanelOpen?: boolean;
  isSandboxConnecting?: boolean;
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
  onSandboxToggle,
  isSandboxPanelOpen = false,
  isSandboxConnecting = false,
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
    <div className="w-full px-3 pb-1 @xl/chat-column:mx-auto @xl/chat-column:w-4xl @xl/chat-column:px-0">
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
          <div className="flex items-center gap-1">
            {onSandboxToggle && (
              <PromptInputButton
                variant={isSandboxPanelOpen ? "outline" : "ghost"}
                onClick={onSandboxToggle}
                disabled={isSandboxConnecting}
                aria-label={isSandboxPanelOpen ? "Close sandbox panel" : "Open sandbox panel"}
              >
                {isSandboxConnecting ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <SquareTerminalIcon className="size-4" />
                )}
              </PromptInputButton>
            )}
            <PromptInputSubmit status={status} onStop={onStop} />
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
})

function AttachmentButton() {
  const attachments = usePromptInputAttachments();

  return (
    <PromptInputButton onClick={() => attachments.openFileDialog()}>
      <PaperclipIcon />
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
