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
import { type ConfirmationProps } from "@/components/ai-elements/confirmation";
import { memo } from "react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import { ToolApprovalConfirmation } from "./tool-approval-confirmation";

export interface TodosDisplayProps {
  todos: QueueTodo[];
  approval?: ConfirmationProps['approval'];
  state?: ConfirmationProps['state'];
  toolApprovalResponse: ChatAddToolApproveResponseFunction;
}

export const TodosDisplay = memo(function TodosDisplay({ todos, approval, state, toolApprovalResponse }: TodosDisplayProps) {
  if (todos.length === 0) return null;

  const activeCount = todos.filter((t) => t.status !== "done").length;
  const showApproval = !!state && !!approval;

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
              <QueueItem key={todo.id || `todo-${i}`}>
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
      {showApproval && (
        <ToolApprovalConfirmation
          approval={approval}
          state={state}
          toolApprovalResponse={toolApprovalResponse}
          acceptedTitle="Tasks approved."
          rejectedTitle="Tasks rejected"
        />
      )}
    </Queue>
  );
});
