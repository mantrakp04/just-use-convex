import type { UIMessage } from "@ai-sdk/react";
import { MessageResponse } from "@/components/ai-elements/message";
import { CitedMarkdown } from "@/components/ai-elements/cited-markdown";
import type { SourceReference } from "@/lib/citations";

export interface TextPartProps {
  part: Extract<UIMessage["parts"][number], { type: "text" }>;
  role: UIMessage["role"];
  partKey: string;
  sources?: SourceReference[];
}

export function TextPart({ part, role, partKey, sources }: TextPartProps) {
  if (role === "user") {
    return (
      <p key={partKey} className="whitespace-pre-wrap">
        {part.text}
      </p>
    );
  }

  // For assistant messages, use CitedMarkdown if sources exist
  if (sources && sources.length > 0) {
    return (
      <CitedMarkdown key={partKey} sources={sources}>
        {part.text}
      </CitedMarkdown>
    );
  }

  return <MessageResponse key={partKey}>{part.text}</MessageResponse>;
}
