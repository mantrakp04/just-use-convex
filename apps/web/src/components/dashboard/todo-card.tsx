import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight, ChevronLeft } from "lucide-react";
import type { Todo, TodoStatus } from "@/hooks/use-todos";
import {
  priorityColors,
  statusIcons,
  statusLabels,
  type KanbanGroupBy,
  type ColumnDefinition,
} from "./constants";

interface TodoCardProps {
  todo: Todo;
  onOpen: () => void;
  onStatusChange: (status: TodoStatus) => void;
  groupBy: KanbanGroupBy;
  onMove: (columnId: string) => void;
  columns: readonly ColumnDefinition[];
  currentColumn: string;
}

export function TodoCard({
  todo,
  onOpen,
  onStatusChange,
  groupBy,
  onMove,
  columns,
  currentColumn,
}: TodoCardProps) {
  const status = todo.status ?? "todo";
  const priority = todo.priority ?? "medium";
  const StatusIcon = statusIcons[status];

  const currentIndex = columns.findIndex((c) => c.id === currentColumn);
  const prevColumn = currentIndex > 0 ? columns[currentIndex - 1] : null;
  const nextColumn = currentIndex < columns.length - 1 ? columns[currentIndex + 1] : null;

  return (
    <div
      role="button"
      tabIndex={0}
      className="group flex w-full flex-col gap-2 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors text-left"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground hover:text-foreground mt-0.5"
          onClick={(e) => {
            e.stopPropagation();
            const nextStatus = status === "todo" ? "in_progress" : status === "in_progress" ? "done" : "todo";
            onStatusChange(nextStatus);
          }}
        >
          <StatusIcon
            className={`size-4 ${status === "done" ? "text-green-500" : status === "in_progress" ? "text-blue-500" : ""}`}
          />
        </Button>
        <div className="flex-1 min-w-0">
          <p
            className={`font-medium text-sm leading-tight ${
              status === "done" ? "line-through text-muted-foreground" : ""
            }`}
          >
            {todo.title}
          </p>
          {todo.description && (
            <p className="text-muted-foreground text-xs mt-1 line-clamp-2">
              {todo.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {groupBy !== "priority" && (
            <Badge variant={priorityColors[priority]} className="text-[10px]">
              {priority}
            </Badge>
          )}
          {groupBy !== "status" && (
            <Badge variant="outline" className="text-[10px]">
              {statusLabels[status]}
            </Badge>
          )}
          {todo.dueDate && (
            <span className="text-muted-foreground text-[10px] flex items-center gap-1">
              <Calendar className="size-2.5" />
              {new Date(todo.dueDate).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Quick move buttons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {prevColumn && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onMove(prevColumn.id);
              }}
              title={`Move to ${prevColumn.label}`}
            >
              <ChevronLeft className="size-3" />
            </Button>
          )}
          {nextColumn && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onMove(nextColumn.id);
              }}
              title={`Move to ${nextColumn.label}`}
            >
              <ChevronRight className="size-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
