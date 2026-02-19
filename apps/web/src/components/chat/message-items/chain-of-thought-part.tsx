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
  chainGroup: { part: UIMessage["parts"][number]; key: string }[];
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
        {chainGroup.map(({ part: p, key }) => {
          if (p.type === "reasoning") {
            return (
              <ReasoningPart
                key={key}
                part={p}
                isStreaming={isStreaming}
              />
            );
          }
          if (isToolPart(p)) {
            return (
              <ToolPart
                key={key}
                part={p}
                partKey={key}
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
