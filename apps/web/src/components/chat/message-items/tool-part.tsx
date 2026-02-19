import { memo } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  WebSearch,
  WebSearchHeader,
  WebSearchContent,
  WebSearchResults,
  WebSearchError,
  type WebSearchOutput,
} from "@/components/ai-elements/web-search";
import type { AskUserInput } from "@/components/ai-elements/ask-user";
import { ToolApprovalConfirmation } from "../tool-approval-confirmation";
import { AskUserDisplay } from "../ask-user-display";

export type ToolPartType = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export interface ToolPartProps {
  part: ToolPartType;
  partKey: string;
  toolApprovalResponse: ChatAddToolApproveResponseFunction;
}

export function getToolName(type: string): string {
  return type.slice(5); // Remove "tool-" prefix
}

export function isToolPart(
  part: UIMessage["parts"][number]
): part is ToolPartType {
  return part.type.startsWith("tool-");
}

const AskUserPart = memo(function AskUserPart({
  part,
  toolApprovalResponse,
}: Omit<ToolPartProps, "partKey">) {
  const approval = "approval" in part ? part.approval : undefined;

  const input = part.input as AskUserInput | undefined;

  if (!input?.questions) return null;

  return (
    <AskUserDisplay
      input={input}
      approval={approval}
      state={part.state}
      toolApprovalResponse={toolApprovalResponse}
    />
  );
});

const WebSearchPart = memo(function WebSearchPart({
  part,
  partKey,
  toolApprovalResponse,
}: ToolPartProps) {
  const approval = 'approval' in part ? part.approval : undefined;
  const output = part.output as WebSearchOutput | undefined;
  const input = part.input as { query?: string } | undefined;

  return (
    <WebSearch key={partKey}>
      <WebSearchHeader
        query={output?.query ?? input?.query}
        numResults={output?.numResults}
        state={part.state}
      />
      <WebSearchContent>
        <WebSearchError errorText={part.errorText} />
        {output?.results && output.results.length > 0 && (
          <WebSearchResults results={output.results} />
        )}
      </WebSearchContent>
      <ToolApprovalConfirmation
        approval={approval}
        state={part.state}
        toolApprovalResponse={toolApprovalResponse}
        requestTitle="This tool requires your approval to run."
        acceptedTitle="Tool execution approved."
        rejectedTitle="Tool execution rejected"
      />
    </WebSearch>
  );
});

export const ToolPart = memo(function ToolPart({
  part,
  partKey,
  toolApprovalResponse,
}: ToolPartProps) {
  const toolName = getToolName(part.type);

  if (toolName === "ask_user") {
    return (
      <AskUserPart
        part={part}
        toolApprovalResponse={toolApprovalResponse}
      />
    );
  }

  if (toolName === "web_search") {
    return (
      <WebSearchPart
        part={part}
        partKey={partKey}
        toolApprovalResponse={toolApprovalResponse}
      />
    );
  }

  const approval = 'approval' in part ? part.approval : undefined;

  return (
    <Tool key={partKey}>
      <ToolHeader type={part.type} state={part.state} />
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput output={part.output} errorText={part.errorText} />
      </ToolContent>
      <ToolApprovalConfirmation
        approval={approval}
        state={part.state}
        toolApprovalResponse={toolApprovalResponse}
        requestTitle="This tool requires your approval to run."
        acceptedTitle="Tool execution approved."
        rejectedTitle="Tool execution rejected"
      />
    </Tool>
  );
});
