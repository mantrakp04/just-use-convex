import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(protected)/settings/org/")({
  component: () => <Navigate to="/settings/org/attachments" />,
});
