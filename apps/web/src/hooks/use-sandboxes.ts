import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvexMutation, useConvexPaginatedQuery, convexQuery } from "@convex-dev/react-query";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "sonner";

type ListArgs = FunctionArgs<typeof api.sandboxes.index.list>;
export type SandboxFilters = ListArgs["filters"];
export type Sandbox = FunctionReturnType<typeof api.sandboxes.index.list>["page"][number];

const INITIAL_NUM_ITEMS = 20;
const EMPTY_FILTERS: SandboxFilters = {};

export function useSandboxes() {
  const createMutation = useMutation({
    mutationFn: useConvexMutation(api.sandboxes.index.create),
    onSuccess: () => {
      toast.success("Sandbox created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create sandbox");
    },
  });

  const updateMutation = useMutation({
    mutationFn: useConvexMutation(api.sandboxes.index.update),
    onSuccess: () => {
      toast.success("Sandbox updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update sandbox");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: useConvexMutation(api.sandboxes.index.deleteSandbox),
    onSuccess: () => {
      toast.success("Sandbox deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete sandbox");
    },
  });

  const updateName = useCallback(
    async (id: Id<"sandboxes">, name: string) => {
      await updateMutation.mutateAsync({
        _id: id,
        patch: { name },
      });
    },
    [updateMutation]
  );

  return {
    createSandbox: createMutation.mutateAsync,
    updateSandbox: updateMutation.mutateAsync,
    deleteSandbox: deleteMutation.mutateAsync,
    updateName,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useSandboxesList(filters: SandboxFilters = EMPTY_FILTERS) {
  return useConvexPaginatedQuery(
    api.sandboxes.index.list,
    { filters },
    { initialNumItems: INITIAL_NUM_ITEMS }
  );
}

export type SandboxWithDetails = FunctionReturnType<typeof api.sandboxes.index.get>;

export function useSandbox(sandboxId: Id<"sandboxes"> | undefined) {
  return useQuery({
    ...convexQuery(api.sandboxes.index.get, sandboxId ? { _id: sandboxId } : "skip"),
    enabled: !!sandboxId,
  });
}

export type SandboxStats = FunctionReturnType<typeof api.sandboxes.index.getUserStats>;

export function useSandboxStats() {
  return useQuery(convexQuery(api.sandboxes.index.getUserStats, {}));
}
