import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvexMutation, useConvexPaginatedQuery, convexQuery } from "@convex-dev/react-query";
import { api } from "@better-convex/backend/convex/_generated/api";
import type { Id } from "@better-convex/backend/convex/_generated/dataModel";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "sonner";

const todoKeys = {
  all: ["todos"] as const,
  list: (filters?: TodoFilters) => [...todoKeys.all, "list", filters] as const,
  assigned: (userId?: string) => [...todoKeys.all, "assigned", userId] as const,
};

type ListArgs = FunctionArgs<typeof api.todos.index.list>;
export type TodoFilters = ListArgs["filters"];
export type Priority = "low" | "medium" | "high";
export type TodoStatus = "todo" | "in_progress" | "done";
export type Todo = FunctionReturnType<typeof api.todos.index.list>["page"][number];

const INITIAL_NUM_ITEMS = 20;
const EMPTY_FILTERS: TodoFilters = {};

export function useTodos() {
  const createMutation = useMutation({
    mutationFn: useConvexMutation(api.todos.index.create),
    onSuccess: () => {
      toast.success("Todo created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create todo");
    },
  });

  const updateMutation = useMutation({
    mutationFn: useConvexMutation(api.todos.index.update),
    onSuccess: () => {
      toast.success("Todo updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update todo");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: useConvexMutation(api.todos.index.deleteTodo),
    onSuccess: () => {
      toast.success("Todo deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete todo");
    },
  });

  const assignUserMutation = useMutation({
    mutationFn: useConvexMutation(api.todos.index.assignUser),
    onSuccess: () => {
      toast.success("User assigned");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to assign user");
    },
  });

  const unassignUserMutation = useMutation({
    mutationFn: useConvexMutation(api.todos.index.unassignUser),
    onSuccess: () => {
      toast.success("User unassigned");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to unassign user");
    },
  });

  const updateStatus = useCallback(
    async (id: Id<"todos">, status: TodoStatus) => {
      await updateMutation.mutateAsync({
        _id: id,
        patch: { status },
      });
    },
    [updateMutation]
  );

  const updatePriority = useCallback(
    async (id: Id<"todos">, priority: Priority) => {
      await updateMutation.mutateAsync({
        _id: id,
        patch: { priority },
      });
    },
    [updateMutation]
  );

  return {
    createTodo: createMutation.mutateAsync,
    updateTodo: updateMutation.mutateAsync,
    deleteTodo: deleteMutation.mutateAsync,
    updateStatus,
    updatePriority,
    assignUser: assignUserMutation.mutateAsync,
    unassignUser: unassignUserMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useTodosList(filters: TodoFilters = EMPTY_FILTERS) {
  return useConvexPaginatedQuery(
    api.todos.index.list,
    { filters },
    { initialNumItems: INITIAL_NUM_ITEMS }
  );
}

export function useAssignedTodosList(userId?: string) {
  return useConvexPaginatedQuery(
    api.todos.index.listAssigned,
    { userId },
    { initialNumItems: INITIAL_NUM_ITEMS }
  );
}

export type OrgStats = FunctionReturnType<typeof api.todos.index.getOrgStats>

export function useOrgStats() {
  return useQuery(convexQuery(api.todos.index.getOrgStats, {}));
}

export type TodoWithAssignees = FunctionReturnType<typeof api.todos.index.get>;

export function useTodo(todoId: Id<"todos"> | undefined) {
  return useQuery({
    ...convexQuery(api.todos.index.get, todoId ? { _id: todoId } : "skip"),
    enabled: !!todoId,
  });
}
