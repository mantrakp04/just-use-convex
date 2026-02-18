import { memo } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from "@/components/ai-elements/chain-of-thought";
import { cn } from "@/lib/utils";
import { ReasoningPart } from "./reasoning-part";
import { ToolPart, isToolPart } from "./tool-part";

export interface ChainOfThoughtPartProps {
  isStreaming: boolean;
  chainGroup: { part: UIMessage["parts"][number]; partIndex: number }[];
  toolApprovalResponse: ChatAddToolApproveResponseFunction;
}

export function isChainOfThoughtPart(part: UIMessage["parts"][number]): boolean {
  return part.type === "reasoning" || isToolPart(part);
}

export const ChainOfThoughtPart = memo(function ChainOfThoughtPart({
  isStreaming,
  chainGroup,
  toolApprovalResponse,
}: ChainOfThoughtPartProps) {
  return (
    <ChainOfThought defaultOpen={false}>
      <ChainOfThoughtHeader className={cn(isStreaming ? "animate-pulse" : "", "w-fit")}>
        {isStreaming ? "Exploring..." : "Explored"}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {chainGroup.map(({ part: p, partIndex }) => {
          if (p.type === "reasoning") {
            return (
              <ReasoningPart
                key={`reasoning-${partIndex}`}
                part={p}
                isStreaming={isStreaming}
              />
            );
          }
          if (isToolPart(p)) {
            return (
              <ToolPart
                key={`tool-${partIndex}`}
                part={p}
                partKey={partIndex}
                toolApprovalResponse={toolApprovalResponse}
              />
            );
          }
          return null;
        })}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
});
