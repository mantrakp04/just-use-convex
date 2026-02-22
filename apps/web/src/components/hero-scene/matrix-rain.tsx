import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

const CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFZ";
const FONT_SIZE = 14;
const DROP_SPEED = 0.6;

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame: number;
    let drops: number[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const columns = Math.floor(canvas.width / FONT_SIZE);
      // Preserve existing drops, extend or shrink array
      const newDrops = new Array(columns).fill(0);
      for (let i = 0; i < Math.min(drops.length, columns); i++) {
        newDrops[i] = drops[i];
      }
      // Stagger initial drops randomly
      for (let i = drops.length; i < columns; i++) {
        newDrops[i] = Math.random() * -100;
      }
      drops = newDrops;
    };

    resize();
    window.addEventListener("resize", resize);

    const isDark = resolvedTheme === "dark";
    const headColor = isDark ? "#ffffff" : "#000000";
    const trailColor = isDark ? "#00ff41" : "#006b1a";
    const fadeColor = isDark ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.05)";

    const draw = () => {
      ctx.fillStyle = fadeColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${FONT_SIZE}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
        const x = i * FONT_SIZE;
        const y = drops[i]! * FONT_SIZE;

        // Head character — brighter
        ctx.fillStyle = headColor;
        ctx.fillText(char, x, y);

        // Trail character just behind — green
        if (drops[i]! > 1) {
          const trailChar = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
          ctx.fillStyle = trailColor;
          ctx.globalAlpha = 0.8;
          ctx.fillText(trailChar, x, y - FONT_SIZE);
          ctx.globalAlpha = 1;
        }

        drops[i]! += DROP_SPEED;

        // Reset drop to top with random delay
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = Math.random() * -20;
        }
      }

      animationFrame = requestAnimationFrame(draw);
    };

    animationFrame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, [resolvedTheme]);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
