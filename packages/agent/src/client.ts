import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const apiKey = process.env.OPENROUTER_API_KEY;

const openrouter = createOpenRouter({
  apiKey,
});

export function createAiClient(model: string, reasoningEffort?: "low" | "medium" | "high") {
  return openrouter.chat(model, {
    reasoning: reasoningEffort ? { effort: reasoningEffort } : undefined,
  });
}
