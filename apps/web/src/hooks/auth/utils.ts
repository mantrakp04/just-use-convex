import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { authClient } from "@/lib/auth-client";

export function useRefreshAuth() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const refreshAuth = useCallback(async () => {
    await authClient.getSession();
    await queryClient.invalidateQueries();
    await router.invalidate();
  }, [queryClient, router]);

  return refreshAuth;
}
