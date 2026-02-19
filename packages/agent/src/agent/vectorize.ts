import type { UIMessage } from "ai";
import type { worker } from "../../alchemy.run.ts";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { embedTexts } from "./client.js";
import { extractMessageText } from "./messages";

export async function buildVectorId(agentName: string, messageId: string): Promise<string> {
  const baseId = `${agentName}:${messageId}`;
  const baseBytes = new TextEncoder().encode(baseId);
  if (baseBytes.length <= 64) return baseId;

  const digest = await crypto.subtle.digest("SHA-256", baseBytes);
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `m_${hash}`;
}

export async function indexMessagesInVectorStore(args: {
  env: typeof worker.Env;
  memberId: string;
  agentName: string;
  chatId: Id<"chats"> | undefined;
  messages: UIMessage[];
}): Promise<void> {
  const { env, memberId, agentName, chatId, messages } = args;
  const vectorize = env.vectorizeChatMessages;
  if (!vectorize || !chatId) return;

  const texts: string[] = [];
  const metadata: Array<{ role: string; chatId: Id<"chats">; messageId: string; text: string }> = [];

  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = extractMessageText(message);
    if (!text) continue;
    texts.push(text);
    metadata.push({
      role: message.role,
      chatId,
      messageId: message.id,
      text,
    });
  }

  if (texts.length === 0) return;

  const embeddings = await embedTexts(texts);
  const vectorIds = await Promise.all(
    metadata.map((meta) => buildVectorId(agentName, meta.messageId))
  );

  const vectors = [];
  for (let index = 0; index < embeddings.length; index += 1) {
    const values = embeddings[index];
    const meta = metadata[index];
    const id = vectorIds[index];
    if (!values || !meta || !id) continue;
    vectors.push({
      id,
      values,
      metadata: meta,
      namespace: memberId,
    });
  }

  if (vectors.length > 0) {
    await vectorize.upsert(vectors);
  }
}

export async function deleteMessageVectors(args: {
  env: typeof worker.Env;
  agentName: string;
  messageIds: string[];
}): Promise<void> {
  const { env, agentName, messageIds } = args;
  const vectorize = env.vectorizeChatMessages;
  if (!vectorize || messageIds.length === 0) return;

  const ids = await Promise.all(
    messageIds.map((messageId) => buildVectorId(agentName, messageId))
  );
  await vectorize.deleteByIds(ids);
}

export async function buildRetrievalMessage(args: {
  env: typeof worker.Env;
  memberId: string | undefined;
  queryText: string;
}): Promise<string[] | null> {
  const results = await queryVectorizedMessages({
    ...args,
    topK: 6,
  });

  if (!results || !results.matches.length) return null;

  const contextLines = results.matches.map((match, index) => {
    const role = typeof match.metadata?.role === "string" ? match.metadata.role : "unknown";
    const text = typeof match.metadata?.text === "string" ? match.metadata.text : "";
    const score = Number.isFinite(match.score) ? match.score.toFixed(4) : "n/a";
    return `#${index + 1} (${role}, score ${score})\n${text}`;
  });

  return contextLines
}

export async function queryVectorizedMessages(args: {
  env: typeof worker.Env;
  memberId: string | undefined;
  queryText: string;
  topK?: number;
}): Promise<VectorizeMatches | null> {
  const { env, memberId, queryText, topK = 6 } = args;
  const vectorize = env.vectorizeChatMessages;
  if (!vectorize) return null;

  const normalizedQuery = queryText.trim();
  if (!normalizedQuery) return null;

  const [embedding] = await embedTexts([normalizedQuery]);
  if (!embedding) return null;

  return vectorize.query(embedding, {
    topK,
    namespace: memberId,
    returnMetadata: "all",
  });
}
