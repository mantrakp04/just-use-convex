import type { UIMessage } from "@ai-sdk/react";
import type { WebSearchOutput, WebSearchResult } from "@/components/ai-elements/web-search";

export interface SourceReference {
  index: number;
  result: WebSearchResult;
  query: string;
}

/**
 * Extract all web search results from a message's parts as numbered sources
 */
export function extractSourcesFromMessage(message: UIMessage): SourceReference[] {
  const sources: SourceReference[] = [];

  for (const part of message.parts) {
    if (part.type.startsWith("tool-") && part.type === "tool-web_search") {
      const output = (part as { output?: WebSearchOutput }).output;
      if (output?.results) {
        for (const result of output.results) {
          sources.push({
            index: sources.length + 1,
            result,
            query: output.query,
          });
        }
      }
    }
  }

  return sources;
}

/**
 * Parse citation markers [n] from text and return segments
 */
export interface TextSegment {
  type: "text" | "citation";
  content: string;
  indices?: number[]; // For citations, the source indices
}

export function parseCitations(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  // Match [n] or [n][m] patterns (adjacent citations)
  const citationPattern = /(\[(\d+)\])+/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(text)) !== null) {
    // Add text before citation
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: text.slice(lastIndex, match.index),
      });
    }

    // Extract all indices from the citation group
    const indices: number[] = [];
    const indexPattern = /\[(\d+)\]/g;
    let indexMatch: RegExpExecArray | null;
    while ((indexMatch = indexPattern.exec(match[0])) !== null) {
      indices.push(parseInt(indexMatch[1], 10));
    }

    segments.push({
      type: "citation",
      content: match[0],
      indices,
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Check if text contains any citation markers
 */
export function hasCitations(text: string): boolean {
  return /\[\d+\]/.test(text);
}
