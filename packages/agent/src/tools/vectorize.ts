import { createTool, createToolkit } from "@voltagent/core";
import { z } from "zod";

export function createVectorizeToolkit({
  queryVectorize,
}: {
  queryVectorize: (query: string, topK?: number) => Promise<VectorizeMatches | null>;
}) {
  const vectorizeSearchTool = createTool({
    name: "vectorize_search",
    description: `Search the Vectorize chat memory for relevant past messages.

Use this tool when you need to:
- Recall prior messages in the current chat context
- Find similar content based on a query
- Surface relevant history for better answers

Results return matching message snippets with scores and metadata.`,
    parameters: z.object({
      query: z.string().describe("Query text to search against stored chat messages."),
      topK: z.number().min(1).max(20).optional().describe("Number of matches to return (1-20). Default: 6"),
    }),
    execute: async ({ query, topK = 6 }) => {
      const normalizedQuery = query.trim();
      if (!normalizedQuery) {
        return { error: true, message: "Query is required and cannot be empty." };
      }

      const results = await queryVectorize(normalizedQuery, topK);
      if (!results) {
        return {
          query: normalizedQuery,
          topK,
          numMatches: 0,
          matches: [],
          message: "Vectorize is not configured or no embedding could be created.",
        };
      }

      const matches = results.matches.map((match) => ({
        score: match.score,
        role: typeof match.metadata?.role === "string" ? match.metadata.role : null,
        text: typeof match.metadata?.text === "string" ? match.metadata.text : null,
        messageId: typeof match.metadata?.messageId === "string" ? match.metadata.messageId : null,
        chatId: typeof match.metadata?.chatId === "string" ? match.metadata.chatId : null,
      }));

      return {
        query: normalizedQuery,
        topK,
        numMatches: matches.length,
        matches,
      };
    },
  });

  return createToolkit({
    name: "vectorize_search",
    description: "Tools for searching Vectorize chat memory.",
    tools: [vectorizeSearchTool],
  });
}
