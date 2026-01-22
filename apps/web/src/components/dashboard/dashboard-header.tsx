import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface DashboardHeaderProps {
  todoCount: number;
  onCreateClick: () => void;
}

export function DashboardHeader({ todoCount, onCreateClick }: DashboardHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold">Todos</h1>
        <p className="text-muted-foreground text-sm">
          {todoCount} {todoCount === 1 ? "task" : "tasks"}
        </p>
      </div>
      <Button onClick={onCreateClick}>
        <Plus className="size-4" />
        New Todo
      </Button>
    </div>
  );
}
