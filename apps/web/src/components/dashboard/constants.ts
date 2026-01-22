import { Circle, CircleDot, CheckCircle2 } from "lucide-react";
import type { Priority, TodoStatus, Todo } from "@/hooks/use-todos";

export type ViewMode = "kanban" | "list";
export type KanbanGroupBy = "priority" | "status";

export const priorityColors = {
  low: "secondary",
  medium: "outline",
  high: "destructive",
} as const satisfies Record<Priority, "secondary" | "outline" | "destructive">;

export const statusIcons = {
  todo: Circle,
  in_progress: CircleDot,
  done: CheckCircle2,
} as const satisfies Record<TodoStatus, typeof Circle>;

export const statusLabels = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
} as const satisfies Record<TodoStatus, string>;

export const priorityOrder = ["high", "medium", "low"] as const satisfies readonly Priority[];
export const statusOrder = ["todo", "in_progress", "done"] as const satisfies readonly TodoStatus[];

export const statusColumns = [
  { id: "todo", label: "To Do", filter: (t: Todo) => (t.status ?? "todo") === "todo" },
  { id: "in_progress", label: "In Progress", filter: (t: Todo) => (t.status ?? "todo") === "in_progress" },
  { id: "done", label: "Done", filter: (t: Todo) => (t.status ?? "todo") === "done" },
] as const satisfies readonly { id: TodoStatus; label: string; filter: (t: Todo) => boolean }[];

export const priorityColumns = [
  { id: "high", label: "High Priority", filter: (t: Todo) => (t.priority ?? "medium") === "high" },
  { id: "medium", label: "Medium Priority", filter: (t: Todo) => (t.priority ?? "medium") === "medium" },
  { id: "low", label: "Low Priority", filter: (t: Todo) => (t.priority ?? "medium") === "low" },
] as const satisfies readonly { id: Priority; label: string; filter: (t: Todo) => boolean }[];

export type ColumnDefinition = (typeof statusColumns)[number] | (typeof priorityColumns)[number];
