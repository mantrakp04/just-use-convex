import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { AuthBoundary } from "@convex-dev/better-auth/react";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import { isAuthError } from "@/lib/utils";
import { toast } from "sonner";
import { convexQuery } from "@convex-dev/react-query";

export const Route = createFileRoute("/(protected)")({
  component: ProtectedLayout,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(
        convexQuery(api.auth.getCurrentUser, {})
      ),
    ]);
  },
});

function ProtectedLayout() {
  const navigate = useNavigate();

  return (
    <AuthBoundary
      authClient={authClient}
      // This can do anything you like, a redirect is typical.
      onUnauth={async () => {
        await navigate({ to: "/auth" });
        toast.error("You are not authorized to access this page");
      }}
      getAuthUserFn={api.auth.getAuthUser}
      isAuthError={isAuthError}
    >
      <div className="flex-1 overflow-hidden bg-background h-full w-full">
        <Outlet />
      </div>
    </AuthBoundary>
  );
}
