import { ListTodoIcon } from "lucide-react";
import {
  Queue,
  QueueSection,
  QueueSectionTrigger,
  QueueSectionLabel,
  QueueSectionContent,
  QueueList,
  QueueItem,
  QueueItemIndicator,
  QueueItemContent,
  type QueueTodo,
} from "@/components/ai-elements/queue";
import { memo } from "react";

export interface TodosDisplayProps {
  todos: QueueTodo[];
}

export const TodosDisplay = memo(function TodosDisplay({ todos }: TodosDisplayProps) {
  if (todos.length === 0) return null;

  const activeCount = todos.filter((t) => t.status !== "done").length;

  return (
    <Queue className="mb-2">
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel
            icon={<ListTodoIcon className="size-4" />}
            label={activeCount === 1 ? "task" : "tasks"}
            count={activeCount}
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          <QueueList>
            {todos.map((todo, i) => (
              <QueueItem key={todo.id || i}>
                <div className="flex items-start gap-2">
                  <QueueItemIndicator
                    completed={todo.status === "done"}
                    className={
                      todo.status === "in_progress"
                        ? "animate-pulse bg-blue-500"
                        : ""
                    }
                  />
                  <QueueItemContent completed={todo.status === "done"}>
                    {todo.title}
                  </QueueItemContent>
                </div>
              </QueueItem>
            ))}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
});
