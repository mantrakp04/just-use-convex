import { api } from "@better-convex/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import UserMenu from "@/components/auth/user-menu";
import { convexQuery } from "@convex-dev/react-query";

export const Route = createFileRoute("/(protected)/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const privateData = useSuspenseQuery(convexQuery(api.privateData.get, {}));

  return (
    <div className="container mx-auto max-w-3xl px-4 py-2">
      <h1>Dashboard</h1>
      <p>privateData: {privateData.data?.message}</p>
      <UserMenu />
    </div>
  );
}
