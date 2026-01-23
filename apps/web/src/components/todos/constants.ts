import { Circle, CircleDot, CheckCircle2 } from "lucide-react";
import type { Priority, TodoStatus } from "@/hooks/use-todos";

export const priorityColors = {
  low: "secondary",
  medium: "outline",
  high: "destructive",
} as const satisfies Record<Priority, "secondary" | "outline" | "destructive">;

export const statusLabels = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
} as const satisfies Record<TodoStatus, string>;

export const statusIcons = {
  todo: Circle,
  in_progress: CircleDot,
  done: CheckCircle2,
} as const satisfies Record<TodoStatus, typeof Circle>;
