import { useNavigate } from "@tanstack/react-router";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { useWorkflow, useWorkflows } from "@/hooks/use-workflows";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Trash2, Copy, Box } from "lucide-react";
import { toast } from "sonner";
import { ExecutionLog } from "./execution-log";

interface WorkflowDetailProps {
  workflowId: Id<"workflows">;
}

export function WorkflowDetail({ workflowId }: WorkflowDetailProps) {
  const navigate = useNavigate();
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const { deleteWorkflow, toggleEnabled, isDeleting } = useWorkflows();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!workflow) {
    return <p className="text-muted-foreground">Workflow not found.</p>;
  }

  const trigger = parseTrigger(workflow.trigger);

  const handleDelete = async () => {
    await deleteWorkflow({ _id: workflowId });
    navigate({ to: "/workflows" });
  };

  const copyWebhookUrl = () => {
    if (trigger.type === "webhook") {
      const url = `${window.location.origin}/api/webhooks/workflows?id=${workflowId}`;
      navigator.clipboard.writeText(url);
      toast.success("Webhook URL copied");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/workflows" })}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-2xl font-semibold">{workflow.name}</h1>
          <Badge variant={workflow.enabled ? "default" : "secondary"}>
            {workflow.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={workflow.enabled}
            onCheckedChange={(enabled) => toggleEnabled(workflowId, enabled)}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {workflow.description && (
        <p className="text-muted-foreground text-sm">{workflow.description}</p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Trigger</CardTitle>
          </CardHeader>
          <CardContent className="py-2 flex flex-col gap-1">
            <Badge variant="outline" className="w-fit">{trigger.type}</Badge>
            {trigger.type === "event" && trigger.event && (
              <span className="text-sm text-muted-foreground">{trigger.event}</span>
            )}
            {trigger.type === "schedule" && trigger.cron && (
              <code className="text-sm font-mono">{trigger.cron}</code>
            )}
{trigger.type === "webhook" && (
              <Button variant="outline" size="sm" onClick={copyWebhookUrl} className="w-fit gap-1">
                <Copy className="size-3" />
                Copy URL
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Actions</CardTitle>
          </CardHeader>
          <CardContent className="py-2 flex flex-wrap gap-1">
            {workflow.allowedActions.map((action) => (
              <Badge key={action} variant="secondary" className="text-xs">
                {action}
              </Badge>
            ))}
          </CardContent>
        </Card>

        {workflow.sandbox && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Box className="size-3.5" />
                Sandbox
              </CardTitle>
            </CardHeader>
            <CardContent className="py-2 flex flex-col gap-1">
              <span className="text-sm font-medium">{workflow.sandbox.name}</span>
              {workflow.sandbox.description && (
                <span className="text-xs text-muted-foreground">{workflow.sandbox.description}</span>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Instructions</CardTitle>
        </CardHeader>
        <CardContent className="py-2">
          <pre className="text-sm whitespace-pre-wrap font-sans">{workflow.instructions}</pre>
        </CardContent>
      </Card>

      <ExecutionLog workflowId={workflowId} />
    </div>
  );
}

function parseTrigger(triggerJson: string): { type: string; event?: string; cron?: string; secret?: string } {
  try {
    return JSON.parse(triggerJson);
  } catch {
    return { type: "unknown" };
  }
}
