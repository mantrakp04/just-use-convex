import { atomWithStorage } from "jotai/utils";

// Persisted favorite model slugs
export const favoriteModelsAtom = atomWithStorage<string[]>(
  "favorite-models",
  [],
  undefined,
  { getOnInit: true }
);

// Persisted default model slug
export const defaultModelAtom = atomWithStorage<{ model: string; reasoningEffort?: "low" | "medium" | "high" }>(
  "default-model",
  { model: "openai/gpt-5.2-chat" },
  undefined,
  { getOnInit: true }
);

// YOLO mode - when enabled, skips confirmations and goes full send
export const yoloModeAtom = atomWithStorage<boolean>(
  "yolo-mode",
  false,
  undefined,
  { getOnInit: true }
);
