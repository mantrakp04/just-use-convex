import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { useRefreshAuth } from "../utils";
import { useNavigate } from "@tanstack/react-router";

export function useUser() {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user ?? null;
  const queryClient = useQueryClient();
  const refreshAuth = useRefreshAuth();
  const navigate = useNavigate();

  const updateMutation = useMutation({
    mutationFn: async (data: { name?: string; image?: string }) => {
      const result = await authClient.updateUser(data);
      if (result.error) {
        throw result.error;
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Profile updated successfully");
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to update profile");
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: {
      currentPassword: string;
      newPassword: string;
      revokeOtherSessions?: boolean;
    }) => {
      const result = await authClient.changePassword(data);
      if (result.error) {
        throw result.error;
      }
      return result.data;
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to change password");
    },
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      const result = await authClient.signOut();
      if (result.error) {
        throw result.error;
      }
      return result.data;
    },
    onSuccess: async () => {
      await refreshAuth();
      navigate({
        to: "/auth",
      });
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Failed to sign out");
    },
  });

  return {
    user,
    isPending,
    updateUser: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    changePassword: changePasswordMutation.mutateAsync,
    isChangingPassword: changePasswordMutation.isPending,
    signOut: signOutMutation.mutateAsync,
    isSigningOut: signOutMutation.isPending,
  };
}
