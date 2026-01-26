import { atomWithStorage } from "jotai/utils";

// Persisted favorite model slugs
export const favoriteModelsAtom = atomWithStorage<string[]>(
  "favorite-models",
  [],
  undefined,
  { getOnInit: true }
);

// Persisted default model slug
export const defaultModelAtom = atomWithStorage<string | undefined>(
  "default-model",
  undefined,
  undefined,
  { getOnInit: true }
);
