import { createFileRoute } from "@tanstack/react-router";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";

export const Route = createFileRoute("/(protected)/workflows/new")({
  component: NewWorkflowPage,
});

function NewWorkflowPage() {
  return <WorkflowBuilder />;
}
