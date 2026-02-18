import type { ComponentProps, ReactNode } from "react";
import { Suspense, lazy } from "react";

type StreamdownModule = typeof import("streamdown");
export type LazyStreamdownProps = ComponentProps<StreamdownModule["Streamdown"]> & {
  fallback?: ReactNode;
};

const Streamdown = lazy(async () => {
  const mod = await import("streamdown");
  return { default: mod.Streamdown };
});

export const LazyStreamdown = ({ fallback = null, ...props }: LazyStreamdownProps) => (
  <Suspense fallback={fallback}>
    <Streamdown {...props} />
  </Suspense>
);
