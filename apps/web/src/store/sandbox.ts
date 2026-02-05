import { atomWithStorage } from "jotai/utils";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";

// Persisted selected sandbox ID
export const selectedSandboxIdAtom = atomWithStorage<Id<"sandboxes"> | null>(
  "selected-sandbox-id",
  null,
  undefined,
  { getOnInit: true }
);
