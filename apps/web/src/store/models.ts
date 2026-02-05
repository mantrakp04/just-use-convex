import { atomWithStorage } from "jotai/utils";

// Persisted favorite model slugs
export const favoriteModelsAtom = atomWithStorage<string[]>(
  "favorite-models",
  [],
  undefined,
  { getOnInit: true }
);

export type DefaultChatSettings = {
  model: string;
  reasoningEffort?: "low" | "medium" | "high";
};

// Persisted default chat settings (model, reasoning)
export const defaultChatSettingsAtom = atomWithStorage<DefaultChatSettings>(
  "default-chat-settings",
  { model: "openai/gpt-5.2-chat" },
  undefined,
  { getOnInit: true }
);
