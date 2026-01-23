import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { AuthBoundary } from "@convex-dev/better-auth/react";
import { api } from "@better-convex/backend/convex/_generated/api";
import { isAuthError } from "@/lib/utils";
import { toast } from "sonner";
import { useActiveOrganization } from "@/hooks/auth/organization";
import { Spinner } from "@/components/ui/spinner";
import OrganizationListDropdown from "@/components/auth/organization/organization-list-dropdown";
import { BuildingIcon } from "lucide-react";

export const Route = createFileRoute("/(protected)")({
  component: ProtectedLayout,
});

function OrganizationBoundary({ children }: { children: React.ReactNode }) {
  const { activeOrganization } = useActiveOrganization();

  if (activeOrganization.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!activeOrganization.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-6 max-w-md text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-muted">
            <BuildingIcon className="size-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">No Organization Selected</h2>
            <p className="text-muted-foreground">
              Select an existing organization or create a new one to continue.
            </p>
          </div>
          <OrganizationListDropdown />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

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
      <OrganizationBoundary>
        <div className="flex-1 overflow-y-auto bg-background h-full container mx-auto w-4xl py-2">
          <Outlet />
        </div>
      </OrganizationBoundary>
    </AuthBoundary>
  );
}
