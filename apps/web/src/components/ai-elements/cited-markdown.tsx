
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { useMemo } from "react";
import { parseCitations, type SourceReference } from "@/lib/citations";
import { CitationBadge } from "./citation-badge";
import { LazyStreamdown, type LazyStreamdownProps } from "./lazy-streamdown";

export interface CitedMarkdownProps extends Omit<LazyStreamdownProps, "children"> {
  children: string;
  sources: SourceReference[];
}

/**
 * Renders markdown with interactive citation badges.
 * Citations like [1] or [2][3] become hoverable badges with source previews.
 */
export const CitedMarkdown = ({
  className,
  children,
  sources,
  ...props
}: CitedMarkdownProps) => {
  // Parse text into segments
  const segments = useMemo(() => parseCitations(children), [children]);

  // If no citations, just render normally
  const hasCitations = segments.some((s) => s.type === "citation");
  if (!hasCitations) {
    return (
      <LazyStreamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className
        )}
        plugins={{ code, mermaid, math, cjk }}
        shikiTheme={["github-light", "github-dark"]}
        {...props}
      >
        {children}
      </LazyStreamdown>
    );
  }

  // Render with citations as inline components
  // Strategy: render each text segment with Streamdown, citations as badges
  // This preserves markdown rendering while injecting React components
  return (
    <div
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        // Streamdown-like styling
        "prose prose-sm dark:prose-invert max-w-none",
        className
      )}
    >
      {segments.map((segment, index) => {
        if (segment.type === "citation") {
          return (
            <CitationBadge
              key={index}
              indices={segment.indices ?? []}
              sources={sources}
            />
          );
        }

        // For text segments, use Streamdown
        // Wrap in span to keep inline flow
        return (
          <LazyStreamdown
            key={index}
            className="inline [&>p]:inline [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            plugins={{ code, mermaid, math, cjk }}
            shikiTheme={["github-light", "github-dark"]}
            {...props}
          >
            {segment.content}
          </LazyStreamdown>
        );
      })}
    </div>
  );
};
