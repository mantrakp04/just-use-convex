import { Output, generateText } from "ai";
import { z } from "zod";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { createAiClient } from "../client";
import type { ConvexAdapter } from "@just-use-convex/backend/convex/lib/convexAdapter";

export async function generateTitle(args: {
  convexAdapter: ConvexAdapter | null;
  chatId: Id<"chats"> | undefined;
  userMessage: string;
}): Promise<void> {
  const { convexAdapter, chatId, userMessage } = args;
  if (!convexAdapter || !chatId) return;

  try {
    const { output } = await generateText({
      model: createAiClient("openai/gpt-oss-20b"),
      output: Output.object({
        schema: z.object({
          title: z.string().describe("A short, concise title (max 6 words) for a chat conversation based on the user's first message.").max(64).min(1),
        }),
      }),
      prompt: userMessage,
    });

    const title = output.title;
    if (!title) return;

    const updateFn = convexAdapter.getTokenType() === "ext"
      ? api.chats.index.updateExt
      : api.chats.index.update;

    await convexAdapter.mutation(updateFn, {
      _id: chatId,
      patch: { title },
    });
  } catch {
    // silently ignore title generation failures
  }
}
