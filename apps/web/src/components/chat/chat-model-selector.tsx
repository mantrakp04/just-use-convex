import { useState, useEffect } from "react";
import { ChevronDownIcon, Sparkles, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpenRouterModel } from "@/hooks/use-openrouter-models";
import type { ChatSettings } from "@/providers/agents";
import { useModelFiltering, getProviderLabel, getProviderDisplayName, getProviderLogoSlug } from "@/hooks/use-model-filtering";
import { ReasoningEffortSelector } from "./reasoning-effort-selector";
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
import { env } from "@just-use-convex/env/web";

export type ChatModelSelectorProps = {
  groupedModels: [string, OpenRouterModel[]][];
  models: OpenRouterModel[];
  selectedModel?: OpenRouterModel;
  settings: ChatSettings;
  onSettingsChange: (settings: ChatSettings | ((prev: ChatSettings) => ChatSettings)) => void;
};

export function ChatModelSelector({
  groupedModels,
  models,
  selectedModel,
  settings,
  onSettingsChange,
}: ChatModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const defaultModel = env.VITE_DEFAULT_MODEL;
  const {
    selectedAuthor,
    setSelectedAuthor,
    authors,
    filteredModels,
    toggleFavorite,
    isFavorite,
    favorites,
  } = useModelFiltering({ groupedModels, models });

  const supportsReasoning = selectedModel?.supports_reasoning ?? false;
  const reasoningEfforts = selectedModel?.reasoning_config?.supported_reasoning_efforts ?? [];
  const providerLabel = selectedModel?.author ? getProviderLabel(selectedModel.author) : null;
  const providerSlug = providerLabel ? getProviderLogoSlug(providerLabel) : "openrouter";

  useEffect(() => {
    if (!selectedModel) {
      onSettingsChange((prev) => ({
        ...prev,
        model: defaultModel,
        reasoningEffort: defaultModel.includes("reasoning") ? prev.reasoningEffort : undefined,
      }));
    }
  }, [selectedModel]);

  const handleModelSelect = (model: OpenRouterModel) => {
    onSettingsChange((prev) => ({
      ...prev,
      model: model.slug,
      reasoningEffort: model.supports_reasoning ? prev.reasoningEffort : undefined,
    }));
    setOpen(false);
  };

  return (
    <ModelSelector open={open} onOpenChange={setOpen}>
      <ModelSelectorTrigger className="p-1.5 rounded-md hover:bg-muted/50 cursor-pointer flex items-center gap-2">
        <TriggerContent
          selectedModel={selectedModel}
          providerSlug={providerSlug}
          supportsReasoning={supportsReasoning}
          reasoningEffort={settings.reasoningEffort}
        />
        <ChevronDownIcon className="size-3 text-muted-foreground/70" />
      </ModelSelectorTrigger>

      <ModelSelectorContent title="Select a model" className="max-h-[28rem] h-full">
        <ModelSelectorInput placeholder="Search models..." />
        <div className="flex flex-1 min-w-0 overflow-hidden">
          <ModelSelectorSidebar>
            {authors.map((author, index) => (
              <ModelSelectorProviderButton
                key={author + index}
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
            {supportsReasoning && reasoningEfforts.length > 0 && (
              <ReasoningEffortSelector
                efforts={reasoningEfforts}
                currentEffort={settings.reasoningEffort}
                onSelect={(effort) => onSettingsChange((prev) => ({ ...prev, reasoningEffort: effort }))}
              />
            )}
          </ModelSelectorMain>
        </div>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

type TriggerContentProps = {
  selectedModel?: OpenRouterModel;
  providerSlug: string;
  supportsReasoning: boolean;
  reasoningEffort?: ChatSettings["reasoningEffort"];
};

function TriggerContent({
  selectedModel,
  providerSlug,
  supportsReasoning,
  reasoningEffort,
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
      {supportsReasoning && reasoningEffort && (
        <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
          <Sparkles className="size-2.5" />
          <span className="text-[10px] uppercase">{reasoningEffort}</span>
        </span>
      )}
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
