import { Tabs, TabsTrigger, TabsList } from "@/components/ui/tabs";
import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import OrganizationListDropdown from "@/components/auth/organization/organization-list-dropdown";

export const Route = createFileRoute("/(protected)/settings/org")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleChange = useCallback(
    (value: string) => {
      navigate({ to: `/settings/org/${value}` });
    },
    [navigate]
  );

  const paths = [{ value: "attachments", label: "Attachments" }];
  const activeTab = location.pathname.split("/settings/org/")[1] || "attachments";

  return (
    <Tabs value={activeTab}>
      <TabsList className="w-full justify-between bg-transparent px-0">
        <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
          {paths.map(({ value, label }) => (
            <TabsTrigger key={value} value={value} onClick={() => handleChange(value)}>
              {label}
            </TabsTrigger>
          ))}
        </div>
        <OrganizationListDropdown />
      </TabsList>
      <Outlet />
    </Tabs>
  );
}
