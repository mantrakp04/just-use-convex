import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type SceneType = "pipes" | "dvd" | "matrix";

interface SwitcherProps {
  activeScene: SceneType;
  onSceneChange: (scene: SceneType) => void;
}

export function Switcher({ activeScene, onSceneChange }: SwitcherProps) {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto z-50">
      <Tabs value={activeScene} onValueChange={(v) => onSceneChange(v as SceneType)}>
        <TabsList>
          <TabsTrigger value="pipes">Pipes</TabsTrigger>
          <TabsTrigger value="dvd">DVD</TabsTrigger>
          <TabsTrigger value="matrix">Matrix</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
