import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvexMutation, useConvexPaginatedQuery, convexQuery } from "@convex-dev/react-query";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "sonner";

import type { Priority, TodoStatus } from "@just-use-convex/backend/convex/todos/types";
export type { Priority, TodoStatus };

type ListArgs = FunctionArgs<typeof api.todos.index.list>;
export type TodoFilters = ListArgs["filters"];
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

  const assignMemberMutation = useMutation({
    mutationFn: useConvexMutation(api.todos.index.assignMember),
    onSuccess: () => {
      toast.success("Member assigned");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to assign member");
    },
  });

  const unassignMemberMutation = useMutation({
    mutationFn: useConvexMutation(api.todos.index.unassignMember),
    onSuccess: () => {
      toast.success("Member unassigned");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to unassign member");
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
    assignMember: assignMemberMutation.mutateAsync,
    unassignMember: unassignMemberMutation.mutateAsync,
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

export function useAssignedTodosList(memberId?: string) {
  return useConvexPaginatedQuery(
    api.todos.index.listAssigned,
    { memberId },
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
