import { embedMany } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "@just-use-convex/env/agent";

const apiKey = env.OPENROUTER_API_KEY;

const openrouter = createOpenRouter({
  apiKey,
});

export function createAiClient(model: string, reasoningEffort?: "low" | "medium" | "high") {
  return openrouter.chat(model, {
    reasoning: reasoningEffort ? { effort: reasoningEffort } : undefined,
  });
}

export const embeddingClient = {
  model: openrouter.textEmbeddingModel("thenlper/gte-base"),
  size: 768,
}

export async function embedTexts(values: string[], abortSignal?: AbortSignal): Promise<number[][]> {
  if (values.length === 0) return [];
  const { embeddings } = await embedMany({
    model: embeddingClient.model,
    values,
    abortSignal,
  });
  return embeddings.map((embedding) => Array.from(embedding));
}
