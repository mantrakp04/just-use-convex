
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BookIcon, ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import type { ComponentProps } from "react";
import type { SourceReference } from "@/lib/citations";

export type SourcesProps = ComponentProps<typeof Collapsible>;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible
    className={cn("not-prose text-primary text-xs", className)}
    {...props}
  />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({
  className,
  count,
  children,
  ...props
}: SourcesTriggerProps) => (
  <CollapsibleTrigger
    className={cn("flex items-center gap-2", className)}
    {...props}
  >
    {children ?? (
      <>
        <p className="font-medium">Used {count} sources</p>
        <ChevronDownIcon className="h-4 w-4" />
      </>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({
  className,
  ...props
}: SourcesContentProps) => (
  <CollapsibleContent
    className={cn(
      "mt-3 flex w-fit flex-col gap-2",
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type SourceProps = ComponentProps<"a">;

export const Source = ({ href, title, children, ...props }: SourceProps) => (
  <a
    className="flex items-center gap-2"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="h-4 w-4" />
        <span className="block font-medium">{title}</span>
      </>
    )}
  </a>
);

// Numbered source item for web search results
export type NumberedSourceProps = ComponentProps<"a"> & {
  index: number;
  source: SourceReference;
};

export const NumberedSource = ({
  className,
  index,
  source,
  ...props
}: NumberedSourceProps) => {
  const hostname = (() => {
    try {
      return new URL(source.result.url).hostname.replace(/^www\./, "");
    } catch {
      return source.result.url;
    }
  })();

  return (
    <a
      href={source.result.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/50",
        className
      )}
      {...props}
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-sm">{source.result.title}</span>
          <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        <span className="text-muted-foreground text-xs">{hostname}</span>
      </div>
    </a>
  );
};

// Full sources list component
export interface SourcesListProps {
  sources: SourceReference[];
  className?: string;
}

export const SourcesList = ({ sources, className }: SourcesListProps) => {
  if (sources.length === 0) return null;

  return (
    <Sources className={className} defaultOpen={false}>
      <SourcesTrigger count={sources.length} />
      <SourcesContent className="max-w-full">
        {sources.map((source) => (
          <NumberedSource key={source.result.url} index={source.index} source={source} />
        ))}
      </SourcesContent>
    </Sources>
  );
};
