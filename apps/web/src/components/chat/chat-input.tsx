import { PaperclipIcon } from "lucide-react";
import type { OpenRouterModel } from "@/hooks/use-openrouter-models";
import type { useAgentChat } from "@cloudflare/ai-chat/react";

export type ChatSettings = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high" | undefined;
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
  AttachmentRemove,
} from "@/components/ai-elements/attachments";
import { ChatModelSelector } from "./chat-model-selector";
import { ReasoningEffortSelector } from "./reasoning-effort-selector";
import { TodosDisplay } from "./todos-display";
import type { QueueTodo } from "@/components/ai-elements/queue";

export type ChatInputProps = {
  onSubmit: (message: { text: string; files: Array<{ url: string; mediaType: string; filename?: string }> }) => void;
  status: NonNullable<ReturnType<typeof useAgentChat>>["status"];
  onStop?: () => void;
  settings: ChatSettings;
  setSettings: (settings: ChatSettings | ((prev: ChatSettings) => ChatSettings)) => void;
  groupedModels: [string, OpenRouterModel[]][];
  models: OpenRouterModel[];
  selectedModel?: OpenRouterModel;
  todos?: QueueTodo[];
  hasMessages: boolean;
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
  todos = [],
  hasMessages,
}: ChatInputProps) {
  const supportsReasoning = selectedModel?.supports_reasoning ?? false;

  return (
    <div className="pb-1 mx-auto w-4xl">
      <TodosDisplay todos={todos} />
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
              hasMessages={hasMessages}
            />
            {supportsReasoning && (
              <ReasoningEffortSelector
                currentEffort={settings.reasoningEffort}
                onSelect={(effort) => setSettings((prev) => ({ ...prev, reasoningEffort: effort }))}
              />
            )}
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
