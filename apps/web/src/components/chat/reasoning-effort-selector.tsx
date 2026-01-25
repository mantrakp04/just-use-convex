import { cn } from "@/lib/utils";
import type { ChatSettings } from "./chat-input";

export type ReasoningEffortSelectorProps = {
  efforts: string[];
  currentEffort: ChatSettings["reasoningEffort"];
  onSelect: (effort: ChatSettings["reasoningEffort"]) => void;
};

export function ReasoningEffortSelector({
  efforts,
  currentEffort,
  onSelect,
}: ReasoningEffortSelectorProps) {
  if (efforts.length === 0) return null;

  return (
    <div className="border-t border-border/50 p-3 bg-muted/20">
      <div className="text-xs text-muted-foreground mb-1.5 px-1">
        Reasoning effort
      </div>
      <div className="flex gap-1">
        {efforts.map((effort) => (
          <button
            key={effort}
            type="button"
            onClick={() => onSelect(effort as ChatSettings["reasoningEffort"])}
            className={cn(
              "flex-1 px-2 py-1 text-xs rounded-md transition-colors",
              currentEffort === effort
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                : "bg-muted/50 hover:bg-muted text-muted-foreground"
            )}
          >
            {effort.charAt(0).toUpperCase() + effort.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
