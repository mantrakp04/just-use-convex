import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { useRefreshAuth } from "../utils";

export const organizationsKeys = {
  all: ["organizations"] as const,
  list: () => [...organizationsKeys.all, "list"] as const,
};

export function useOrganizations() {
  const { data: organizations, isPending, error, refetch } = authClient.useListOrganizations();

  return {
    organizations: organizations ?? [],
    isPending,
    error,
    refetch,
  };
}

export function useActiveOrganization() {
  const activeOrganization = authClient.useActiveOrganization();
  const refreshAuth = useRefreshAuth();

  const setActiveOrganizationMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      const result = await authClient.organization.setActive({ organizationId });
      return result.data;
    },
    onSuccess: () => {
      toast.success("Organization switched successfully");
      refreshAuth();
    },
    onError: (error: { error?: { message?: string } }) => {
      toast.error(error.error?.message || "Failed to switch organization");
    },
  });

  return {
    activeOrganization,
    setActiveOrganization: setActiveOrganizationMutation
  };
}


export function useCreateOrganization() {
  const refreshAuth = useRefreshAuth();

  const mutation = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      const result = await authClient.organization.create(data);

      if (result.data?.id) {
        await authClient.organization.setActive({ organizationId: result.data.id });
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Organization created successfully");
      refreshAuth();
    },
    onError: (error: { error?: { message?: string } }) => {
      toast.error(error.error?.message || "Failed to create organization");
    },
  });

  return {
    createOrganization: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}
