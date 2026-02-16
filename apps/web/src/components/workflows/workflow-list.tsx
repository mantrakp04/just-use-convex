import { useNavigate } from "@tanstack/react-router";
import { useWorkflows, useWorkflowsList, type Workflow } from "@/hooks/use-workflows";
import { cronToHumanReadable } from "@/store/workflows";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Box } from "lucide-react";
import { useCallback } from "react";

export function WorkflowList() {
  const navigate = useNavigate();
  const { deleteWorkflow, toggleEnabled, isDeleting } = useWorkflows();
  const { results: workflows, status, loadMore, isLoading } = useWorkflowsList();

  const handleCreate = useCallback(() => {
    navigate({ to: "/workflows/new" });
  }, [navigate]);

  const handleClick = useCallback(
    (workflowId: string) => {
      navigate({ to: "/workflows/$workflowId", params: { workflowId } });
    },
    [navigate]
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 w-full max-w-4xl mx-auto">
      <div className="flex shrink-0 items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Workflows</h1>
          <p className="text-muted-foreground text-sm">
            Automate actions with triggers and AI agents
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="size-4" />
          New Workflow
        </Button>
      </div>

      {isLoading && (
        <div className="flex shrink-0 flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && workflows.length === 0 && (
        <div className="shrink-0 py-12 text-center text-muted-foreground">
          <p>No workflows yet.</p>
          <p className="mt-1 text-sm">Create your first workflow to automate tasks.</p>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2">
          {workflows.map((workflow) => (
            <WorkflowCard
              key={workflow._id}
              workflow={workflow}
              onClick={() => handleClick(workflow._id)}
              onToggle={(enabled) => toggleEnabled(workflow._id, enabled)}
              onDelete={() => deleteWorkflow({ _id: workflow._id })}
              isDeleting={isDeleting}
            />
          ))}
        </div>
        {status === "CanLoadMore" && (
          <Button variant="outline" onClick={() => loadMore(20)} className="mx-auto mt-4">
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}

function WorkflowCard({
  workflow,
  onClick,
  onToggle,
  onDelete,
  isDeleting,
}: {
  workflow: Workflow;
  onClick: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const trigger = parseTrigger(workflow.trigger);

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors border-border border"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <div className="flex flex-col gap-1 min-w-0">
          <CardTitle className="text-base">{workflow.name}</CardTitle>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-xs">
              {trigger.type}
            </Badge>
            {trigger.type === "event" && trigger.event && (
              <Badge variant="secondary" className="text-xs">
                {trigger.event}
              </Badge>
            )}
            {trigger.type === "schedule" && trigger.cron && (
              <Badge variant="secondary" className="text-xs" title={trigger.cron}>
                {cronToHumanReadable(trigger.cron)}
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              {workflow.allowedActions.length} action{workflow.allowedActions.length !== 1 ? "s" : ""}
            </Badge>
            {workflow.sandbox && (
              <Badge variant="secondary" className="text-xs gap-1">
                <Box className="size-3" />
                {workflow.sandbox.name}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={workflow.enabled}
            onCheckedChange={onToggle}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={isDeleting}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}

function parseTrigger(triggerJson: string): { type: string; event?: string; cron?: string; secret?: string } {
  try {
    return JSON.parse(triggerJson);
  } catch {
    return { type: "unknown" };
  }
}
