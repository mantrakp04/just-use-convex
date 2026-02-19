
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { ComponentProps } from "react";
import { useMemo } from "react";
import { Streamdown } from "streamdown";
import { parseCitations, type SourceReference } from "@/lib/citations";
import { CitationBadge } from "./citation-badge";

export interface CitedMarkdownProps extends Omit<ComponentProps<typeof Streamdown>, "children"> {
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
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className
        )}
        plugins={{ code, mermaid, math, cjk }}
        shikiTheme={["github-light", "github-dark"]}
        {...props}
      >
        {children}
      </Streamdown>
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
      {segments.map((segment) => {
        const segmentKey =
          segment.type === "citation"
            ? `citation-${segment.indices?.join("-") ?? "index"}`
            : `text-${segment.content}`;

        if (segment.type === "citation") {
          return (
            <CitationBadge
              key={segmentKey}
              indices={segment.indices ?? []}
              sources={sources}
            />
          );
        }

        // For text segments, use Streamdown
        // Wrap in span to keep inline flow
        return (
          <Streamdown
            key={`${segmentKey}-${segment.content.length}`}
            className="inline [&>p]:inline [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
            plugins={{ code, mermaid, math, cjk }}
            shikiTheme={["github-light", "github-dark"]}
            {...props}
          >
            {segment.content}
          </Streamdown>
        );
      })}
    </div>
  );
};
