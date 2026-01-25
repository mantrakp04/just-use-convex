import { PaperclipIcon } from "lucide-react";
import type { OpenRouterModel } from "@/hooks/use-openrouter-models";
import type { ChatSettings } from "@/providers/agents";
import type { useAgentChatInstance } from "@/providers/agents";
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
  AttachmentRemove,
} from "@/components/ai-elements/attachments";
import { ChatModelSelector } from "./chat-model-selector";

export type ChatInputProps = {
  onSubmit: (message: { text: string; files: Array<{ url: string; mediaType: string; filename?: string }> }) => void;
  status: ReturnType<typeof useAgentChatInstance>["status"];
  onStop?: () => void;
  settings: ChatSettings;
  setSettings: (settings: ChatSettings | ((prev: ChatSettings) => ChatSettings)) => void;
  groupedModels: [string, OpenRouterModel[]][];
  models: OpenRouterModel[];
  selectedModel?: OpenRouterModel;
};

export function ChatInput({
  onSubmit,
  status,
  onStop,
  settings,
  setSettings,
  groupedModels,
  models,
  selectedModel,
}: ChatInputProps) {
  return (
    <div className="pb-1 mx-auto w-4xl">
      <PromptInput
        onSubmit={({ text, files }) => onSubmit({ text, files })}
        accept="image/*,application/pdf"
        multiple
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
              settings={settings}
              onSettingsChange={setSettings}
            />
          </PromptInputTools>
          <PromptInputSubmit status={status} onStop={onStop} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}

function AttachmentButton() {
  const attachments = usePromptInputAttachments();

  return (
    <PromptInputButton onClick={() => attachments.openFileDialog()}>
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
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}
