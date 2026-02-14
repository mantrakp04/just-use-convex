import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TASK_RETENTION_MS,
  OUTPUT_CHARS_PER_TOKEN,
} from "./types";
import type { PostExecuteHook, TruncatedOutputStoreApi, TruncatedOutput } from "./types";

// ── Store ──────────────────────────────────────────────────────────────

export class TruncatedOutputStore implements TruncatedOutputStoreApi {
  private outputs = new Map<string, TruncatedOutput>();
  private idCounter = 0;

  store(content: string, meta: { toolCallId: string; toolName: string }): string {
    const id = `out_${Date.now()}_${++this.idCounter}`;
    this.outputs.set(id, { id, content, ...meta, createdAt: Date.now() });
    return id;
  }

  get(id: string): TruncatedOutput | undefined {
    return this.outputs.get(id);
  }

  getAll(): TruncatedOutput[] {
    return Array.from(this.outputs.values());
  }

  cleanup(maxAgeMs = DEFAULT_TASK_RETENTION_MS): void {
    const now = Date.now();
    for (const [id, output] of this.outputs) {
      if (now - output.createdAt > maxAgeMs) {
        this.outputs.delete(id);
      }
    }
  }
}

// ── Hook ───────────────────────────────────────────────────────────────

export function createResultTruncationHook(store: TruncatedOutputStoreApi): PostExecuteHook {
  return ({ result, toolCallId, toolName, maxOutputTokens }) => {
    const maxChars =
      Math.max(1, Math.floor(maxOutputTokens || DEFAULT_MAX_OUTPUT_TOKENS)) *
      OUTPUT_CHARS_PER_TOKEN;
    const serialized = serializeResult(result);

    if (serialized.length <= maxChars) return result;

    const outputId = store.store(serialized, { toolCallId, toolName });

    return {
      outputId: outputId,
      truncated: true,
      totalLength: serialized.length,
      content: serialized.slice(0, maxChars),
      message: `Output truncated (${serialized.length} chars). Use read_output with outputId "${outputId}" to read the full content.`,
    };
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function serializeResult(result: unknown): string {
  if (typeof result === "string") return result;
  try {
    const stringified = JSON.stringify(result, null, 2);
    if (typeof stringified === "string") return stringified;
  } catch { /* fall through */ }
  return String(result);
}
