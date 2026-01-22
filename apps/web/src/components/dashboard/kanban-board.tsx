import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Todo, TodoStatus, Priority } from "@/hooks/use-todos";
import { TodoCard } from "./todo-card";
import {
  statusColumns,
  priorityColumns,
  type KanbanGroupBy,
  type ColumnDefinition,
} from "./constants";

interface KanbanBoardProps {
  todos: Todo[];
  groupBy: KanbanGroupBy;
  onOpenTodo: (todo: Todo) => void;
  onStatusChange: (todoId: Todo["_id"], status: TodoStatus) => void;
  onPriorityChange: (todoId: Todo["_id"], priority: Priority) => void;
}

export function KanbanBoard({
  todos,
  groupBy,
  onOpenTodo,
  onStatusChange,
  onPriorityChange,
}: KanbanBoardProps) {
  const columns: readonly ColumnDefinition[] = groupBy === "status" ? statusColumns : priorityColumns;

  const handleMoveToColumn = (todo: Todo, columnId: string) => {
    if (groupBy === "status") {
      onStatusChange(todo._id, columnId as TodoStatus);
    } else {
      onPriorityChange(todo._id, columnId as Priority);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 min-h-0">
      {columns.map((column) => {
        const columnTodos = todos.filter(column.filter);
        return (
          <Card key={column.id} className="flex flex-col min-h-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                {column.label}
                <Badge variant="outline">{columnTodos.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-2">
              <ScrollArea className="h-full max-h-[calc(100vh-320px)]">
                <div className="flex flex-col gap-2 pr-2">
                  {columnTodos.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8 text-xs">
                      No tasks
                    </p>
                  ) : (
                    columnTodos.map((todo) => (
                      <TodoCard
                        key={todo._id}
                        todo={todo}
                        onOpen={() => onOpenTodo(todo)}
                        onStatusChange={(status) => onStatusChange(todo._id, status)}
                        groupBy={groupBy}
                        onMove={(columnId) => handleMoveToColumn(todo, columnId)}
                        columns={columns}
                        currentColumn={column.id}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
