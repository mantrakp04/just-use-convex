import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, Grid2X2, Star, FileText, Eye, Sparkles } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";

export type ModelSelectorProps = ComponentProps<typeof Dialog>;

export const ModelSelector = (props: ModelSelectorProps) => (
  <Dialog {...props} />
);

export type ModelSelectorTriggerProps = ComponentProps<typeof DialogTrigger>;

export const ModelSelectorTrigger = (props: ModelSelectorTriggerProps) => (
  <DialogTrigger {...props} />
);

export type ModelSelectorContentProps = ComponentProps<typeof DialogContent> & {
  title?: ReactNode;
};

export const ModelSelectorContent = ({
  className,
  children,
  title = "Model Selector",
  ...props
}: ModelSelectorContentProps) => (
  <DialogContent
    className={cn(
      "outline! border-none! p-0 outline-border! outline-solid! rounded-lg",
      className
    )}
    {...props}
  >
    <DialogTitle className="sr-only">{title}</DialogTitle>
    <Command className="**:data-[slot=command-input-wrapper]:h-auto p-0 rounded-lg">
      {children}
    </Command>
  </DialogContent>
);

export type ModelSelectorDialogProps = ComponentProps<typeof CommandDialog>;

export const ModelSelectorDialog = (props: ModelSelectorDialogProps) => (
  <CommandDialog {...props} />
);

export type ModelSelectorInputProps = ComponentProps<typeof CommandInput>;

export const ModelSelectorInput = ({
  className,
  ...props
}: ModelSelectorInputProps) => (
  <CommandInput className={cn("h-auto py-3.5", className)} {...props} />
);

export type ModelSelectorListProps = ComponentProps<typeof CommandList>;

export const ModelSelectorList = (props: ModelSelectorListProps) => (
  <CommandList {...props} />
);

export type ModelSelectorEmptyProps = ComponentProps<typeof CommandEmpty>;

export const ModelSelectorEmpty = (props: ModelSelectorEmptyProps) => (
  <CommandEmpty {...props} />
);

export type ModelSelectorGroupProps = ComponentProps<typeof CommandGroup>;

export const ModelSelectorGroup = (props: ModelSelectorGroupProps) => (
  <CommandGroup {...props} />
);

export type ModelSelectorItemProps = ComponentProps<typeof CommandItem>;

export const ModelSelectorItem = (props: ModelSelectorItemProps) => (
  <CommandItem {...props} />
);

export type ModelSelectorShortcutProps = ComponentProps<typeof CommandShortcut>;

export const ModelSelectorShortcut = (props: ModelSelectorShortcutProps) => (
  <CommandShortcut {...props} />
);

export type ModelSelectorSeparatorProps = ComponentProps<
  typeof CommandSeparator
>;

export const ModelSelectorSeparator = (props: ModelSelectorSeparatorProps) => (
  <CommandSeparator {...props} />
);

export type ModelSelectorLogoProps = Omit<
  ComponentProps<"img">,
  "src" | "alt"
> & {
  provider:
    | "moonshotai-cn"
    | "lucidquery"
    | "moonshotai"
    | "zai-coding-plan"
    | "alibaba"
    | "xai"
    | "vultr"
    | "nvidia"
    | "upstage"
    | "groq"
    | "github-copilot"
    | "mistral"
    | "vercel"
    | "nebius"
    | "deepseek"
    | "alibaba-cn"
    | "google-vertex-anthropic"
    | "venice"
    | "chutes"
    | "cortecs"
    | "github-models"
    | "togetherai"
    | "azure"
    | "baseten"
    | "huggingface"
    | "opencode"
    | "fastrouter"
    | "google"
    | "google-vertex"
    | "cloudflare-workers-ai"
    | "inception"
    | "wandb"
    | "openai"
    | "zhipuai-coding-plan"
    | "perplexity"
    | "openrouter"
    | "zenmux"
    | "v0"
    | "iflowcn"
    | "synthetic"
    | "deepinfra"
    | "zhipuai"
    | "submodel"
    | "zai"
    | "inference"
    | "requesty"
    | "morph"
    | "lmstudio"
    | "anthropic"
    | "aihubmix"
    | "fireworks-ai"
    | "modelscope"
    | "llama"
    | "scaleway"
    | "amazon-bedrock"
    | "cerebras"
    | "black-forest-labs"
    | "minimax"
    | "zhipuai"
    | (string & {});
};

export const ModelSelectorLogo = ({
  provider,
  className,
  ...props
}: ModelSelectorLogoProps) => (
  <img
    {...props}
    alt={`${provider} logo`}
    className={cn("size-3 dark:invert", className)}
    height={12}
    src={`https://models.dev/logos/${provider}.svg`}
    width={12}
  />
);

export type ModelSelectorLogoGroupProps = ComponentProps<"div">;

export const ModelSelectorLogoGroup = ({
  className,
  ...props
}: ModelSelectorLogoGroupProps) => (
  <div
    className={cn(
      "-space-x-1 flex shrink-0 items-center [&>img]:rounded-full [&>img]:bg-background [&>img]:p-px [&>img]:ring-1 dark:[&>img]:bg-foreground",
      className
    )}
    {...props}
  />
);

export type ModelSelectorNameProps = ComponentProps<"span">;

export const ModelSelectorName = ({
  className,
  ...props
}: ModelSelectorNameProps) => (
  <span className={cn("flex-1 truncate text-left", className)} {...props} />
);

// Description text component
export type ModelSelectorDescriptionProps = ComponentProps<"p">;

export const ModelSelectorDescription = ({
  className,
  ...props
}: ModelSelectorDescriptionProps) => (
  <p
    className={cn("text-xs text-muted-foreground/70 truncate", className)}
    {...props}
  />
);

// Provider filter sidebar
export type ModelSelectorSidebarProps = ComponentProps<"div">;

export const ModelSelectorSidebar = ({
  className,
  children,
  ...props
}: ModelSelectorSidebarProps) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const ITEM_HEIGHT = 40; // Approximate height of icon buttons
  const ITEMS_TO_SCROLL = 3;
  const SCROLL_DISTANCE = ITEM_HEIGHT * ITEMS_TO_SCROLL;

  const handleScroll = (direction: "up" | "down", isCtrlClick: boolean) => {
    if (!scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const targetScroll = isCtrlClick
      ? direction === "up"
        ? 0
        : container.scrollHeight - container.clientHeight
      : container.scrollTop + (direction === "down" ? SCROLL_DISTANCE : -SCROLL_DISTANCE);

    container.scrollTo({
      top: targetScroll,
      behavior: "smooth",
    });
  };

  return (
    <div className="flex flex-col items-center shrink-0 min-h-0 border-r border-border py-2">
      <Button
        variant="outline"
        size="icon-sm"
        className="rounded-full"
        onClick={(e) => handleScroll("up", e.ctrlKey || e.metaKey)}
      >
        <ChevronUp className="size-4" />
      </Button>
      <div
        ref={scrollContainerRef}
        className={cn(
          "flex flex-col gap-1 p-1 overflow-y-auto scrollbar-none flex-1 min-h-0 max-h-[28rem]",
          className
        )}
        {...props}
      >
        {children}
      </div>
      <Button
        variant="outline"
        size="icon-sm"
        className="rounded-full"
        onClick={(e) => handleScroll("down", e.ctrlKey || e.metaKey)}
      >
        <ChevronDown className="size-4" />
      </Button>
    </div>
  );
};

// Individual provider button
export type ModelSelectorProviderButtonProps = {
  provider: string;
  displayName?: string;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
};

export const ModelSelectorProviderButton = ({
  provider,
  displayName,
  isSelected,
  onClick,
  className,
}: ModelSelectorProviderButtonProps) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button variant="ghost" size="icon-lg" className={cn(isSelected ? "bg-primary/20 ring-1 ring-primary/50" : "hover:bg-muted/80", "cursor-pointer", className)} onClick={onClick} />
      }
    >
      {provider === "all" ? (
        <Grid2X2 className="size-4 text-muted-foreground" />
      ) : provider === "favorites" ? (
        <Star className="size-4 text-amber-500" />
      ) : (
        <ModelSelectorLogo provider={provider} className="size-4" />
      )}
    </TooltipTrigger>
    <TooltipContent side="right">
      {provider === "all"
        ? "All providers"
        : provider === "favorites"
          ? "Favorites"
          : displayName ?? provider}
    </TooltipContent>
  </Tooltip>
);

// Capability badge
export type ModelSelectorBadgeProps = {
  type: "reasoning" | "vision" | "large-context";
  className?: string;
};

export const ModelSelectorBadge = ({
  type,
  className,
}: ModelSelectorBadgeProps) => {
  const icons = {
    reasoning: <Sparkles className="size-3" />,
    vision: <Eye className="size-3" />,
    "large-context": <FileText className="size-3" />,
  };
  const colors = {
    reasoning: "text-amber-500",
    vision: "text-blue-400",
    "large-context": "text-emerald-400",
  };
  return (
    <span className={cn("opacity-70", colors[type], className)}>
      {icons[type]}
    </span>
  );
};

// Main content wrapper (wraps Command)
export type ModelSelectorMainProps = ComponentProps<typeof Command>;

export const ModelSelectorMain = ({
  className,
  ...props
}: ModelSelectorMainProps) => (
  <div
    className={cn("flex-1 min-w-0 flex flex-col", className)}
    {...props}
  />
);
