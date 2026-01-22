import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import type { Todo, TodoStatus } from "@/hooks/use-todos";
import { priorityColors, statusIcons, statusLabels } from "./constants";

interface TodoListItemProps {
  todo: Todo;
  onOpen: () => void;
  onStatusChange: (status: TodoStatus) => void;
}

export function TodoListItem({ todo, onOpen, onStatusChange }: TodoListItemProps) {
  const status = todo.status ?? "todo";
  const priority = todo.priority ?? "medium";
  const StatusIcon = statusIcons[status];

  return (
    <div
      className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors cursor-pointer border-b"
      onClick={onOpen}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => {
            const nextStatus = status === "todo" ? "in_progress" : status === "in_progress" ? "done" : "todo";
            onStatusChange(nextStatus);
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <StatusIcon
            className={`size-5 ${status === "done" ? "text-green-500" : status === "in_progress" ? "text-blue-500" : ""}`}
          />
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`font-medium ${
            status === "done" ? "line-through text-muted-foreground" : ""
          }`}
        >
          {todo.title}
        </p>
        {todo.description && (
          <p className="text-muted-foreground text-xs truncate">{todo.description}</p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge variant="outline" className="text-xs">
          {statusLabels[status]}
        </Badge>
        <Badge variant={priorityColors[priority]}>{priority}</Badge>
        {todo.dueDate && (
          <span className="text-muted-foreground text-xs flex items-center gap-1">
            <Calendar className="size-3" />
            {new Date(todo.dueDate).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
