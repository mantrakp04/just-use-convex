import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { useWorkflowExecutions, type WorkflowExecution } from "@/hooks/use-workflows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ExecutionLogProps {
  workflowId: Id<"workflows">;
}

export function ExecutionLog({ workflowId }: ExecutionLogProps) {
  const { results: executions, status, loadMore, isLoading } = useWorkflowExecutions(workflowId);

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Execution History</CardTitle>
      </CardHeader>
      <CardContent className="py-2">
        {isLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        )}

        {!isLoading && executions.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No executions yet.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {executions.map((execution) => (
            <ExecutionItem key={execution._id} execution={execution} />
          ))}
        </div>

        {status === "CanLoadMore" && (
          <Button variant="outline" size="sm" onClick={() => loadMore(20)} className="mt-2 w-full">
            Load more
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ExecutionItem({ execution }: { execution: WorkflowExecution }) {
  const [expanded, setExpanded] = useState(false);

  const statusColor: Record<string, string> = {
    pending: "secondary",
    running: "default",
    completed: "default",
    failed: "destructive",
    cancelled: "secondary",
  };

  return (
    <div
      className="flex flex-col gap-1 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={statusColor[execution.status] as "default" | "secondary" | "destructive"}>
            {execution.status}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {new Date(execution.startedAt).toLocaleString()}
          </span>
        </div>
        {execution.completedAt && (
          <span className="text-xs text-muted-foreground">
            {formatDuration(execution.completedAt - execution.startedAt)}
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {execution.error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              {execution.error}
            </div>
          )}
          {execution.agentOutput && (
            <div className="text-sm bg-muted p-2 rounded">
              <pre className="whitespace-pre-wrap font-sans">{execution.agentOutput}</pre>
            </div>
          )}
          {!execution.error && !execution.agentOutput && (
            <p className="text-sm text-muted-foreground">No output yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
