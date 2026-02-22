import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvexMutation, useConvexPaginatedQuery, convexQuery } from "@convex-dev/react-query";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { WorkflowWithSandbox } from "@convex/workflows/types";
import { toast } from "sonner";

export type Workflow = WorkflowWithSandbox;
export type WorkflowExecution = FunctionReturnType<typeof api.workflows.index.listExecutions>["page"][number];
type RetryExecutionArgs = FunctionArgs<typeof api.workflows.index.retryExecution>;

const INITIAL_NUM_ITEMS = 20;

export function useWorkflows() {
  const createMutation = useMutation({
    mutationFn: useConvexMutation(api.workflows.index.create),
    onSuccess: () => {
      toast.success("Workflow created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create workflow");
    },
  });

  const updateMutation = useMutation({
    mutationFn: useConvexMutation(api.workflows.index.update),
    onSuccess: () => {
      toast.success("Workflow updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update workflow");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: useConvexMutation(api.workflows.index.deleteWorkflow),
    onSuccess: () => {
      toast.success("Workflow deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete workflow");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: useConvexMutation(api.workflows.index.toggle),
    onSuccess: () => {
      toast.success("Workflow toggled");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to toggle workflow");
    },
  });

  const retryExecutionMutation = useMutation({
    mutationFn: useConvexMutation(api.workflows.index.retryExecution),
    onSuccess: () => {
      toast.success("Execution retried");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to retry execution");
    },
  });

  const toggleEnabled = useCallback(
    async (id: Id<"workflows">, enabled: boolean) => {
      await toggleMutation.mutateAsync({ _id: id, enabled });
    },
    [toggleMutation]
  );

  const retryExecution = useCallback(
    async (args: RetryExecutionArgs) => {
      await retryExecutionMutation.mutateAsync(args);
    },
    [retryExecutionMutation]
  );

  return {
    createWorkflow: createMutation.mutateAsync,
    updateWorkflow: updateMutation.mutateAsync,
    deleteWorkflow: deleteMutation.mutateAsync,
    toggleEnabled,
    retryExecution,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
    isRetryingExecution: retryExecutionMutation.isPending,
  };
}

export function useWorkflowsList() {
  return useConvexPaginatedQuery(
    api.workflows.index.list,
    {},
    { initialNumItems: INITIAL_NUM_ITEMS }
  );
}

export function useWorkflow(workflowId: Id<"workflows"> | undefined) {
  return useQuery({
    ...convexQuery(api.workflows.index.get, workflowId ? { _id: workflowId } : "skip"),
    enabled: !!workflowId,
  });
}

export function useWorkflowExecutions(workflowId: Id<"workflows"> | undefined) {
  return useConvexPaginatedQuery(
    api.workflows.index.listExecutions,
    workflowId ? { workflowId } : "skip",
    { initialNumItems: INITIAL_NUM_ITEMS }
  );
}
