import { useState } from "react";
import { ChevronDownIcon, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpenRouterModel } from "@/hooks/use-openrouter-models";
import type { ChatSettings } from "./chat-input";
import { useModelFiltering, getProviderLabel, getProviderDisplayName, getProviderLogoSlug } from "@/hooks/use-model-filtering";
import {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorContent,
  ModelSelectorInput,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorItem,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorDescription,
  ModelSelectorSidebar,
  ModelSelectorProviderButton,
  ModelSelectorBadge,
  ModelSelectorMain,
} from "@/components/ai-elements/model-selector";
import { useAtom } from "jotai";
import { defaultChatSettingsAtom } from "@/store/models";

export type ChatModelSelectorProps = {
  groupedModels: [string, OpenRouterModel[]][];
  models: OpenRouterModel[];
  selectedModel?: OpenRouterModel;
  onSettingsChange: (settings: ChatSettings | ((prev: ChatSettings) => ChatSettings)) => void;
  hasMessages: boolean;
};

export function ChatModelSelector({
  groupedModels,
  models,
  selectedModel,
  onSettingsChange,
  hasMessages,
}: ChatModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [, setDefaultSettings] = useAtom(defaultChatSettingsAtom);
  const {
    selectedAuthor,
    setSelectedAuthor,
    authors,
    filteredModels,
    toggleFavorite,
    isFavorite,
    favorites,
  } = useModelFiltering({ groupedModels, models });

  const providerLabel = selectedModel?.author ? getProviderLabel(selectedModel.author) : null;
  const providerSlug = providerLabel ? getProviderLogoSlug(providerLabel) : "openrouter";

  const handleModelSelect = (model: OpenRouterModel) => {
    onSettingsChange((prev) => ({
      ...prev,
      model: model.slug,
      reasoningEffort: model.supports_reasoning ? prev.reasoningEffort : undefined,
      inputModalities: model.input_modalities,
    }));

    // Update default settings only if there are no messages yet
    if (!hasMessages) {
      setDefaultSettings((prev) => ({
        ...prev,
        model: model.slug,
        reasoningEffort: model.supports_reasoning ? prev.reasoningEffort : undefined,
      }));
    }

    setOpen(false);
  };

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger className="p-1.5 rounded-md hover:bg-muted/50 cursor-pointer flex items-center gap-2">
        <TriggerContent
          selectedModel={selectedModel}
          providerSlug={providerSlug}
        />
        <ChevronDownIcon className="size-3 text-muted-foreground/70" />
      </ModelSelectorTrigger>

      <ModelSelectorContent title="Select a model" className="max-h-[28rem] h-full">
        <ModelSelectorInput placeholder="Search models..." />
        <div className="flex flex-1 min-w-0 overflow-hidden">
            <ModelSelectorSidebar>
            {authors.map((author) => (
              <ModelSelectorProviderButton
                key={author}
                provider={getProviderLogoSlug(author)}
                displayName={getProviderDisplayName(author)}
                isSelected={selectedAuthor === author}
                onClick={() => setSelectedAuthor(author)}
              />
            ))}
          </ModelSelectorSidebar>
          <ModelSelectorMain>
            <ModelSelectorList className="max-h-full h-full">
              <ModelSelectorEmpty>
                {selectedAuthor === "favorites" && favorites.length === 0
                  ? "No favorites yet. Star a model to add it here."
                  : "No models found."}
              </ModelSelectorEmpty>
              {filteredModels.map(([author, authorModels]) => (
                <ModelSelectorGroup key={author} heading={author}>
                  {authorModels.map((model) => (
                    <ModelItem
                      key={model.slug}
                      model={model}
                      isFavorite={isFavorite(model.slug)}
                      onSelect={() => handleModelSelect(model)}
                      onToggleFavorite={() => toggleFavorite(model.slug)}
                      selectedAuthor={selectedAuthor}
                    />
                  ))}
                </ModelSelectorGroup>
              ))}
            </ModelSelectorList>
          </ModelSelectorMain>
        </div>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

type TriggerContentProps = {
  selectedModel?: OpenRouterModel;
  providerSlug: string;
};

function TriggerContent({
  selectedModel,
  providerSlug,
}: TriggerContentProps) {
  if (!selectedModel) {
    return <span className="text-muted-foreground">Select model</span>;
  }

  return (
    <>
      <ModelSelectorLogo provider={providerSlug} className="size-3.5" />
      <span className="max-w-24 truncate text-muted-foreground">
        {selectedModel.short_name || selectedModel.name}
      </span>
    </>
  );
}

type ModelItemProps = {
  model: OpenRouterModel;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  selectedAuthor: string;
};

function ModelItem({ model, isFavorite, onSelect, onToggleFavorite, selectedAuthor }: ModelItemProps) {
  const providerLabel = model.author ? getProviderLabel(model.author) : null;
  const providerSlug = providerLabel ? getProviderLogoSlug(providerLabel) : "openrouter";
  const showLogo = selectedAuthor !== providerLabel;

  return (
    <ModelSelectorItem
      value={model.slug}
      onSelect={onSelect}
      className="items-start"
    >
      {showLogo && (
        <ModelSelectorLogo
          provider={providerSlug}
          className="size-5 rounded-full bg-muted/50 mt-0.5"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <ModelSelectorName className="font-medium text-sm">
            {model.short_name || model.name}
          </ModelSelectorName>
          <FavoriteButton
            isFavorite={isFavorite}
            onToggle={onToggleFavorite}
          />
          <div className="flex items-center gap-1 ml-auto">
            {model.supports_reasoning && <ModelSelectorBadge type="reasoning" />}
            {model.input_modalities?.includes("image") && <ModelSelectorBadge type="vision" />}
            {model.context_length > 100000 && <ModelSelectorBadge type="large-context" />}
          </div>
        </div>
        <ModelSelectorDescription>
          {model.description || `${model.author} language model`}
        </ModelSelectorDescription>
      </div>
    </ModelSelectorItem>
  );
}

type FavoriteButtonProps = {
  isFavorite: boolean;
  onToggle: () => void;
};

function FavoriteButton({ isFavorite, onToggle }: FavoriteButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      className={cn(
        "transition-opacity",
        isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}
    >
      <Star
        className={cn(
          "size-3.5",
          isFavorite
            ? "fill-amber-400 text-amber-400"
            : "text-muted-foreground hover:text-amber-400"
        )}
      />
    </button>
  );
}
