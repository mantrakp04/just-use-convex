import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/(protected)/workflows")({
  component: RouteComponent,
  gcTime: Infinity,
  staleTime: Infinity,
});

function RouteComponent() {
  return (
    <div className="mx-auto w-4xl py-2 h-full">
      <Outlet />
    </div>
  );
}
