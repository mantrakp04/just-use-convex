import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { WorkflowDetail } from "@/components/workflows/workflow-detail";

export const Route = createFileRoute("/(protected)/workflows/$workflowId")({
  component: WorkflowDetailPage,
});

function WorkflowDetailPage() {
  const { workflowId } = Route.useParams();
  return <WorkflowDetail workflowId={workflowId as Id<"workflows">} />;
}
