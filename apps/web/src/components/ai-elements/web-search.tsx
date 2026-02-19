
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { ToolUIPart } from "ai";
import { ChevronDownIcon, ExternalLinkIcon, GlobeIcon, SearchIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { getStatusBadge } from "./tool";

export interface WebSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  score?: number;
}

export interface WebSearchOutput {
  query: string;
  numResults: number;
  results: WebSearchResult[];
  requestId?: string;
}

export type WebSearchRootProps = ComponentProps<typeof Collapsible>;

export const WebSearch = ({ className, ...props }: WebSearchRootProps) => (
  <Collapsible
    className={cn(
      "not-prose group w-full overflow-hidden rounded-md border",
      className
    )}
    defaultOpen
    {...props}
  />
);

export interface WebSearchHeaderProps {
  query?: string;
  numResults?: number;
  state: ToolUIPart["state"];
  className?: string;
}

export const WebSearchHeader = ({
  className,
  query,
  numResults,
  state,
}: WebSearchHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex w-full items-center justify-between gap-4 p-3",
      className
    )}
  >
    <div className="flex items-center gap-2">
      <SearchIcon className="size-4 text-muted-foreground" />
      <span className="font-medium text-sm">
        {query ? `Searched: "${query}"` : "Web Search"}
      </span>
      {numResults !== undefined && (
        <span className="text-muted-foreground text-xs">
          ({numResults} result{numResults !== 1 ? "s" : ""})
        </span>
      )}
      {getStatusBadge(state)}
    </div>
    <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
  </CollapsibleTrigger>
);

export type WebSearchContentProps = ComponentProps<typeof CollapsibleContent>;

export const WebSearchContent = ({
  className,
  ...props
}: WebSearchContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type WebSearchResultsProps = Omit<ComponentProps<"div">, "results"> & {
  results: WebSearchResult[];
};

export const WebSearchResults = ({
  className,
  results,
  ...props
}: WebSearchResultsProps) => (
  <div className={cn("divide-y divide-border", className)} {...props}>
    {results.map((result) => (
      <WebSearchResultItem key={result.url} result={result} />
    ))}
  </div>
);

export type WebSearchResultItemProps = ComponentProps<"a"> & {
  result: WebSearchResult;
};

export const WebSearchResultItem = ({
  className,
  result,
  ...props
}: WebSearchResultItemProps) => {
  const hostname = (() => {
    try {
      return new URL(result.url).hostname.replace(/^www\./, "");
    } catch {
      return result.url;
    }
  })();

  return (
    <a
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "block p-3 transition-colors hover:bg-muted/50",
        className
      )}
      {...props}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <GlobeIcon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate font-medium text-sm">{result.title}</h4>
            <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-xs">{hostname}</p>
          {result.text && (
            <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
              {result.text}
            </p>
          )}
          {(result.author || result.publishedDate) && (
            <p className="mt-1 text-muted-foreground/70 text-xs">
              {result.author && <span>{result.author}</span>}
              {result.author && result.publishedDate && <span> · </span>}
              {result.publishedDate && (
                <span>{new Date(result.publishedDate).toLocaleDateString()}</span>
              )}
            </p>
          )}
        </div>
      </div>
    </a>
  );
};

export type WebSearchErrorProps = ComponentProps<"div"> & {
  errorText?: string;
};

export const WebSearchError = ({
  className,
  errorText,
  ...props
}: WebSearchErrorProps) => {
  if (!errorText) return null;

  return (
    <div
      className={cn(
        "p-3 text-destructive text-sm bg-destructive/10 rounded-md m-3",
        className
      )}
      {...props}
    >
      {errorText}
    </div>
  );
};
