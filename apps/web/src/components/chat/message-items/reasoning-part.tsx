import { memo } from "react";
import type { UIMessage } from "@ai-sdk/react";
import { MessageResponse } from "@/components/ai-elements/message";
import { ChainOfThoughtStep } from "@/components/ai-elements/chain-of-thought";

export interface ReasoningPartProps {
  part: Extract<UIMessage["parts"][number], { type: "reasoning" }>;
  isStreaming: boolean;
}

export const ReasoningPart = memo(function ReasoningPart({
  part,
  isStreaming,
}: ReasoningPartProps) {
  return (
    <ChainOfThoughtStep
      label="Reasoning"
      status={isStreaming ? "active" : "complete"}
    >
      <MessageResponse>{part.text}</MessageResponse>
    </ChainOfThoughtStep>
  );
});
