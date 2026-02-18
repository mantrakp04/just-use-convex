import { cn } from "@/lib/utils";
import type { ChatSettings } from "./chat-input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDownIcon } from "lucide-react";

export type ReasoningEffortSelectorProps = {
  currentEffort: ChatSettings["reasoningEffort"];
  onSelect: (effort: ChatSettings["reasoningEffort"]) => void;
};

export function ReasoningEffortSelector({
  currentEffort,
  onSelect,
}: ReasoningEffortSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="p-1.5 rounded-md hover:bg-muted/50 cursor-pointer flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {currentEffort ? currentEffort.charAt(0).toUpperCase() + currentEffort.slice(1) : "None"}
        </span>
        <ChevronDownIcon className="size-3 text-muted-foreground/70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={() => onSelect(undefined)}
          className={cn(
            !currentEffort && "bg-accent text-accent-foreground"
          )}
        >
          <span className="text-sm">None</span>
        </DropdownMenuItem>
        {["low", "medium", "high"].map((effort) => (
          <DropdownMenuItem
            key={effort}
            onClick={() => onSelect(effort as ChatSettings["reasoningEffort"])}
            className={cn(
              currentEffort === effort && "bg-accent text-accent-foreground"
            )}
          >
            {effort ? effort.charAt(0).toUpperCase() + effort.slice(1) : "None"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
