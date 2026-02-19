
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { ExternalLinkIcon } from "lucide-react";
import type { SourceReference } from "@/lib/citations";

export interface CitationBadgeProps {
  indices: number[];
  sources: SourceReference[];
  className?: string;
}

export const CitationBadge = ({
  className,
  indices,
  sources,
}: CitationBadgeProps) => {
  // Get the sources for these indices
  const relevantSources = indices
    .map((i) => sources.find((s) => s.index === i))
    .filter((s): s is SourceReference => s !== undefined);

  if (relevantSources.length === 0) {
    // Fallback: just show the numbers if sources not found
    return (
      <span className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground align-super",
        className
      )}>
        {indices.map((citationIndex) => (
          <span key={`citation-${citationIndex}`} className="rounded bg-muted px-1">
            {citationIndex}
          </span>
        ))}
      </span>
    );
  }

  // Single source - simple hover card
  if (relevantSources.length === 1) {
    const source = relevantSources[0];
    return (
      <HoverCard>
        <HoverCardTrigger
          render={
            <a
              href={source.result.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex cursor-pointer items-center rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground align-super transition-colors hover:bg-primary/20 hover:text-primary",
                className
              )}
              onClick={(e) => e.stopPropagation()}
            />
          }
        >
          {source.index}
        </HoverCardTrigger>
        <HoverCardContent side="top" className="w-72 p-3" align="start">
          <SourcePreview source={source} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  // Multiple sources - show combined
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <span
            className={cn(
              "inline-flex cursor-pointer items-center gap-0.5 align-super",
              className
            )}
          />
        }
        >
          {relevantSources.map((source) => (
            <a
            key={source.result.url}
            href={source.result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            {source.index}
          </a>
        ))}
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-80 p-0" align="start">
        <div className="divide-y">
          {relevantSources.map((source) => (
            <div key={source.result.url} className="p-3">
              <SourcePreview source={source} />
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

function SourcePreview({ source }: { source: SourceReference }) {
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
      className="group block"
    >
      <div className="flex items-start gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
          {source.index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="line-clamp-2 font-medium text-sm leading-tight">
              {source.result.title}
            </span>
            <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <span className="text-muted-foreground text-xs">{hostname}</span>
          {source.result.text && (
            <p className="mt-1.5 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
              {source.result.text}
            </p>
          )}
        </div>
      </div>
    </a>
  );
}
