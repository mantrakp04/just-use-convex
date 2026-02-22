import { atomWithStorage } from "jotai/utils";
import type { SceneType } from "@/components/hero-scene/switcher";

export const heroSceneAtom = atomWithStorage<SceneType>(
  "hero-scene",
  "pipes",
  undefined,
  { getOnInit: true }
);
