import { useCallback, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { VirtualList } from "@/components/ui/virtual-list";
import type { Todo, TodoStatus } from "@/hooks/use-todos";
import { TodoListItem } from "./todo-list-item";
import { statusOrder, priorityOrder } from "./constants";

interface TodoListViewProps {
  todos: Todo[];
  loadMore: (count: number) => void;
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  onOpenTodo: (todo: Todo) => void;
  onStatusChange: (todoId: Todo["_id"], status: TodoStatus) => void;
}

export function TodoListView({
  todos,
  loadMore,
  status,
  onOpenTodo,
  onStatusChange,
}: TodoListViewProps) {
  const sortedTodos = useMemo(() => {
    return [...todos].sort((a, b) => {
      const aStatus = a.status ?? "todo";
      const bStatus = b.status ?? "todo";
      const statusDiff = statusOrder.indexOf(aStatus) - statusOrder.indexOf(bStatus);
      if (statusDiff !== 0) return statusDiff;
      const priorityDiff =
        priorityOrder.indexOf(a.priority ?? "medium") - priorityOrder.indexOf(b.priority ?? "medium");
      if (priorityDiff !== 0) return priorityDiff;
      return b._creationTime - a._creationTime;
    });
  }, [todos]);

  const getItemKey = useCallback((_index: number, item: Todo) => item._id, []);

  const renderListItem = useCallback(
    (todo: Todo) => (
      <TodoListItem
        todo={todo}
        onOpen={() => onOpenTodo(todo)}
        onStatusChange={(newStatus) => onStatusChange(todo._id, newStatus)}
      />
    ),
    [onStatusChange, onOpenTodo]
  );

  const sortedQueryForVirtualList = useMemo(
    () => ({
      results: sortedTodos,
      loadMore,
      status,
    }),
    [sortedTodos, loadMore, status]
  );

  return (
    <Card className="flex-1 min-h-0">
      <CardContent className="p-0 h-full max-h-[calc(100vh-240px)]">
        <VirtualList
          query={sortedQueryForVirtualList}
          renderItem={renderListItem}
          estimateSize={72}
          getItemKey={getItemKey}
          emptyState={
            <p className="text-muted-foreground text-center py-12">
              No tasks found. Create one to get started!
            </p>
          }
        />
      </CardContent>
    </Card>
  );
}
