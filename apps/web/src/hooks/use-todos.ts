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
export type SearchTodoItem = NonNullable<FunctionReturnType<typeof api.todos.index.search>[number]>;

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

export type SearchResult = FunctionReturnType<typeof api.todos.index.search>;

type SearchTimeFilters = FunctionArgs<typeof api.todos.index.search>["timeFilters"];

/**
 * Parses time filter expressions from a search query string.
 * Supported syntax:
 *   due:today, due:tomorrow, due:YYYY-MM-DD
 *   due:YYYY-MM-DD..YYYY-MM-DD (range)
 *   after:YYYY-MM-DD, before:YYYY-MM-DD
 *   updated:today, updated:YYYY-MM-DD..YYYY-MM-DD
 * Returns { cleanQuery, timeFilters }.
 */
function parseSearchTimeFilters(raw: string): { cleanQuery: string; timeFilters: SearchTimeFilters | undefined } {
  const timeFilters: NonNullable<SearchTimeFilters> = {};
  let cleanQuery = raw;

  const resolveDate = (token: string): { from: number; to: number } | null => {
    const now = new Date();
    if (token === "today") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return { from: start, to: start + 86_400_000 - 1 };
    }
    if (token === "tomorrow") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
      return { from: start, to: start + 86_400_000 - 1 };
    }
    if (token === "yesterday") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
      return { from: start, to: start + 86_400_000 - 1 };
    }
    // Range: YYYY-MM-DD..YYYY-MM-DD
    const rangeMatch = token.match(/^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/);
    if (rangeMatch) {
      const from = new Date(rangeMatch[1]!).getTime();
      const to = new Date(rangeMatch[2]!).getTime() + 86_400_000 - 1;
      if (!isNaN(from) && !isNaN(to)) return { from, to };
    }
    // Single date: YYYY-MM-DD
    const dateMatch = token.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (dateMatch) {
      const start = new Date(dateMatch[1]!).getTime();
      if (!isNaN(start)) return { from: start, to: start + 86_400_000 - 1 };
    }
    return null;
  };

  // due:<expr>
  cleanQuery = cleanQuery.replace(/\bdue:(\S+)/gi, (_, expr: string) => {
    const range = resolveDate(expr);
    if (range) {
      timeFilters.dueDateFrom = range.from;
      timeFilters.dueDateTo = range.to;
    }
    return "";
  });

  // after:<date>
  cleanQuery = cleanQuery.replace(/\bafter:(\S+)/gi, (_, expr: string) => {
    const range = resolveDate(expr);
    if (range) {
      timeFilters.dueDateFrom = range.from;
    }
    return "";
  });

  // before:<date>
  cleanQuery = cleanQuery.replace(/\bbefore:(\S+)/gi, (_, expr: string) => {
    const range = resolveDate(expr);
    if (range) {
      timeFilters.dueDateTo = range.to;
    }
    return "";
  });

  // updated:<expr>
  cleanQuery = cleanQuery.replace(/\bupdated:(\S+)/gi, (_, expr: string) => {
    const range = resolveDate(expr);
    if (range) {
      timeFilters.updatedAtFrom = range.from;
      timeFilters.updatedAtTo = range.to;
    }
    return "";
  });

  cleanQuery = cleanQuery.replace(/\s+/g, " ").trim();

  const hasFilters = Object.keys(timeFilters).length > 0;
  return { cleanQuery, timeFilters: hasFilters ? timeFilters : undefined };
}

export function useSearchTodos(query: string) {
  const { cleanQuery, timeFilters } = parseSearchTimeFilters(query);
  const hasQuery = cleanQuery.length > 0 || timeFilters !== undefined;
  return useQuery({
    ...convexQuery(api.todos.index.search, hasQuery ? { query: cleanQuery || "*", timeFilters } : "skip"),
    enabled: hasQuery,
  });
}

export type TodoWithAssignees = FunctionReturnType<typeof api.todos.index.get>;

export function useTodo(todoId: Id<"todos"> | undefined) {
  return useQuery({
    ...convexQuery(api.todos.index.get, todoId ? { _id: todoId } : "skip"),
    enabled: !!todoId,
  });
}
