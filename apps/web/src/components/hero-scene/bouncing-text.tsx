import { useEffect, useRef, useState } from "react";

const COLORS = [
  "#ff3333", "#33ff33", "#3333ff", "#ffff33", "#ff33ff", "#33ffff", "#ffffff", "#ff9933"
];

export function BouncingText({ text }: { text: string }) {
  const [colorIndex, setColorIndex] = useState(0);
  const posRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const textRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const w = window.innerWidth;
      const h = window.innerHeight;
      const maxX = Math.max(0, w - rect.width);
      const maxY = Math.max(0, h - rect.height);
      const vx = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);
      const vy = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 2);
      posRef.current = {
        x: Math.random() * maxX,
        y: Math.random() * maxY,
        vx,
        vy,
      };
    } else {
      posRef.current = { x: 100, y: 100, vx: 3, vy: 2.5 };
    }

    let animationFrame: number;
    const update = () => {
      const el = textRef.current;
      if (!el || !posRef.current) return;

      const rect = el.getBoundingClientRect();
      const parentWidth = window.innerWidth;
      const parentHeight = window.innerHeight;

      const state = posRef.current;
      state.x += state.vx;
      state.y += state.vy;

      let bounced = false;

      if (state.x + rect.width >= parentWidth || state.x <= 0) {
        state.vx *= -1;
        state.x = Math.max(0, Math.min(state.x, parentWidth - rect.width));
        bounced = true;
      }

      if (state.y + rect.height >= parentHeight || state.y <= 0) {
        state.vy *= -1;
        state.y = Math.max(0, Math.min(state.y, parentHeight - rect.height));
        bounced = true;
      }

      if (bounced) {
        setColorIndex((prev) => (prev + 1) % COLORS.length);
      }

      el.style.transform = `translate(${state.x}px, ${state.y}px)`;
      animationFrame = requestAnimationFrame(update);
    };

    animationFrame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-[5] overflow-hidden">
      <pre 
        ref={textRef} 
        className="absolute top-0 left-0 m-0 p-0 font-mono text-xs" 
        style={{ color: COLORS[colorIndex] }}
      >
        {text}
      </pre>
    </div>
  );
}
