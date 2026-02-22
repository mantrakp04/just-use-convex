import { Canvas } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { useTheme } from "next-themes";
import type { SceneType } from "./switcher";
import { WindowsPipes } from "./windows-pipes";

export interface HeroSceneProps {
  activeScene: SceneType;
}

export function HeroScene({ activeScene }: HeroSceneProps) {
  const { resolvedTheme } = useTheme();
  const lightColor = resolvedTheme === "dark" ? "#ffffff" : "#000000";

  return (
    <div className="absolute inset-0 -z-10 bg-background overflow-hidden">
      <Canvas camera={{ position: [0, 0, 35], fov: 50 }}>
        <ambientLight intensity={resolvedTheme === "dark" ? 0.3 : 0.8} />
        
        <spotLight position={[20, 30, 20]} angle={0.4} penumbra={1} intensity={2} color={lightColor} />
        <pointLight position={[-20, -20, -20]} intensity={1} color={lightColor} />
        
        {activeScene === "pipes" && <WindowsPipes />}
        
        <Environment preset={resolvedTheme === "dark" ? "night" : "city"} />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.8} />
      </Canvas>
    </div>
  );
}
