import { atomWithStorage } from "jotai/utils";
import type { InputModality } from "@convex/workflows/types";

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
  inputModalities?: InputModality[];
};

// Persisted default chat settings (model, reasoning)
export const defaultChatSettingsAtom = atomWithStorage<DefaultChatSettings>(
  "default-chat-settings",
  {
    model: "openai/gpt-5.2-chat",
    inputModalities: ["file", "image", "text"] satisfies InputModality[],
  },
  undefined,
  { getOnInit: true }
);
