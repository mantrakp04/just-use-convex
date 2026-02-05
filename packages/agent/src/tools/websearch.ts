import Exa from "exa-js";
import { createTool, createToolkit } from "@voltagent/core";
import { z } from "zod";

const exa = new Exa();

export function createWebSearchToolkit() {
  const webSearchTool = createTool({
    name: "web_search",
    description: `Search the web for information using Exa's neural search.

Use this tool when you need to:
- Find current information about topics, events, or entities
- Research documentation, tutorials, or technical information
- Look up news, articles, or publications
- Find company information, research papers, or people

The search returns relevant results with text content, URLs, titles, and publication dates.`,
    parameters: z.object({
      query: z.string().describe("The search query. Be specific and descriptive for better results."),
      numResults: z.number().min(1).max(20).optional().describe("Number of results to return (1-20). Default: 10"),
      type: z.enum(["auto", "neural", "keyword"]).optional().describe("Search type: 'auto' (default), 'neural' for semantic search, 'keyword' for exact matches"),
      category: z.enum(["company", "research paper", "news", "pdf", "tweet", "personal site", "financial report", "people"]).optional().describe("Focus search on a specific category of content"),
      includeDomains: z.array(z.string()).optional().describe("Only include results from these domains"),
      excludeDomains: z.array(z.string()).optional().describe("Exclude results from these domains"),
      startPublishedDate: z.string().optional().describe("Only include results published after this date (ISO format: YYYY-MM-DD)"),
      endPublishedDate: z.string().optional().describe("Only include results published before this date (ISO format: YYYY-MM-DD)"),
    }),
    execute: async ({
      query,
      numResults = 10,
      type = "auto",
      category,
      includeDomains,
      excludeDomains,
      startPublishedDate,
      endPublishedDate,
    }) => {
      // Validate query is not empty
      if (!query || query.trim() === "") {
        return {
          error: true,
          message: "Query is required and cannot be empty",
        };
      }

      const response = await exa.search(query.trim(), {
        numResults,
        type,
        contents: {
          text: { maxCharacters: 5000 },
        },
        // Only include optional params if they have actual values
        ...(category && { category }),
        ...(includeDomains?.length && { includeDomains }),
        ...(excludeDomains?.length && { excludeDomains }),
        ...(startPublishedDate?.trim() && { startPublishedDate }),
        ...(endPublishedDate?.trim() && { endPublishedDate }),
      });

      const results = response.results.map((result) => ({
        title: result.title,
        url: result.url,
        publishedDate: result.publishedDate,
        author: result.author,
        text: result.text,
        score: result.score,
      }));

      return {
        query,
        numResults: results.length,
        results,
        requestId: response.requestId,
      };
    },
  });

  return createToolkit({
    name: "web_search",
    description: `Search the web for information using Exa's neural search.

## Source Citations

When using information from web searches, you MUST cite sources inline using numbered references.

Format: Use \`[n]\` where n is the 1-based index of the source from your search results.

Examples:
- "React 19 introduces a new compiler for automatic memoization [1]."
- "The API supports both REST and GraphQL endpoints [2][3]."

Rules:
- Cite sources immediately after the relevant claim or information
- Use the same number when referencing the same source multiple times
- Numbers correspond to the order sources appear in search results
- Only cite sources you actually retrieved via web_search`,
    tools: [webSearchTool],
  });
}

export const webSearchToolkit = createWebSearchToolkit();
