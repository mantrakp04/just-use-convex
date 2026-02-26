import { useNavigate } from "@tanstack/react-router";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { env } from "@just-use-convex/env/web";
import { useWorkflow, useWorkflows } from "@/hooks/use-workflows";
import { cronToHumanReadable } from "@/store/workflows";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Trash2, Copy, Box, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ExecutionLog } from "./execution-log";
import { useState } from "react";
import { WorkflowBuilder } from "./workflow-builder";

interface WorkflowDetailProps {
  workflowId: Id<"workflows">;
}

export function WorkflowDetail({ workflowId }: WorkflowDetailProps) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const { deleteWorkflow, toggleEnabled, isDeleting } = useWorkflows();

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 w-full max-w-4xl mx-auto">
        <div className="h-8 w-48 shrink-0 bg-muted animate-pulse rounded border-border border" />
        <div className="min-h-0 flex-1 bg-muted animate-pulse rounded-xl border-border border" />
      </div>
    );
  }

  if (!workflow) {
    return <p className="text-muted-foreground">Workflow not found.</p>;
  }

  if (isEditing) {
    return (
      <WorkflowBuilder
        mode="edit"
        workflow={workflow}
        onCancel={() => setIsEditing(false)}
        onSuccess={() => setIsEditing(false)}
      />
    );
  }

  const trigger = parseTrigger(workflow.trigger);

  const handleDelete = async () => {
    await deleteWorkflow({ _id: workflowId });
    navigate({ to: "/workflows" });
  };

  const copyWebhookUrl = () => {
    if (trigger.type === "webhook") {
      const convexSiteUrl = env.VITE_CONVEX_SITE_URL?.replace(/\/$/, "");
      if (!convexSiteUrl) {
        toast.error("Convex site URL is not configured");
        return;
      }
      const url = `${convexSiteUrl}/webhooks/workflows?id=${workflowId}`;
      navigator.clipboard.writeText(url);
      toast.success("Webhook URL copied");
    }
  };

  const copyWebhookSecret = () => {
    if (trigger.type === "webhook" && trigger.secret) {
      navigator.clipboard.writeText(trigger.secret);
      toast.success("Webhook secret copied");
      return;
    }
    toast.error("Webhook secret unavailable");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 w-full max-w-4xl mx-auto">
      <div className="flex shrink-0 items-center justify-between">
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="gap-1.5"
          >
            <Pencil className="size-4" />
            Edit
          </Button>
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

      <div className="grid shrink-0 grid-cols-2 gap-4">
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
              <span className="text-sm" title={trigger.cron}>
                {cronToHumanReadable(trigger.cron)}
              </span>
            )}
            {trigger.type === "webhook" && (
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap gap-1">
                  <Button variant="outline" size="sm" onClick={copyWebhookUrl} className="w-fit gap-1">
                    <Copy className="size-3" />
                    Copy URL
                  </Button>
                  {trigger.secret && (
                    <Button variant="outline" size="sm" onClick={copyWebhookSecret} className="w-fit gap-1">
                      <Copy className="size-3" />
                      Copy Secret
                    </Button>
                  )}
                </div>
                {trigger.secret && (
                  <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    <span>Secret: {maskSecret(trigger.secret)}</span>
                    <span>x-webhook-signature: sha256=HMAC_SHA256(secret, raw_body)</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Actions</CardTitle>
          </CardHeader>
          <CardContent className="py-2 flex flex-wrap gap-1">
            {workflow.actions.map((action) => (
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

      <div className="grid min-h-0 flex-1 grid-rows-[1fr_2fr] gap-4">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0 py-3">
            <CardTitle className="text-sm">Instructions</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 shrink overflow-y-auto py-2">
            <pre className="text-sm whitespace-pre-wrap font-sans">{workflow.instructions}</pre>
          </CardContent>
        </Card>

        <ExecutionLog workflowId={workflowId} />
      </div>
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

function maskSecret(secret: string): string {
  if (secret.length <= 10) return secret;
  return `${secret.slice(0, 6)}...${secret.slice(-4)}`;
}
