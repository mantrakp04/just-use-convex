import type { BaseTool, ToolExecuteOptions } from "@voltagent/core";
import type { ConvexAdapter } from "@just-use-convex/backend/convex/lib/convexAdapter";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { api } from "@just-use-convex/backend/convex/_generated/api";

export type StepTrackingContext = {
  executionId: Id<"workflowExecutions">;
  convexAdapter: ConvexAdapter;
};

/**
 * Patches a tool's execute function to record workflow step outcomes.
 * Applied as the outermost wrapper so it captures the final result
 * (including background task promotion).
 */
export function patchToolWithStepTracking(
  tool: BaseTool,
  context: StepTrackingContext,
): void {
  const originalExecute = tool.execute;
  if (!originalExecute) return;

  Object.defineProperty(tool, "execute", {
    value: async (args: Record<string, unknown>, opts?: ToolExecuteOptions) => {
      try {
        const result = await originalExecute(args, opts);
        await recordStepOutcome(context, tool.name, "success");
        return result;
      } catch (error) {
        await recordStepOutcome(
          context,
          tool.name,
          "failure",
          error instanceof Error ? error.message : String(error),
        );
        throw error;
      }
    },
    writable: true,
    configurable: true,
  });
}

async function recordStepOutcome(
  context: StepTrackingContext,
  action: string,
  outcome: "success" | "failure",
  error?: string,
): Promise<void> {
  try {
    await context.convexAdapter.mutation(
      api.workflows.index.recordWorkflowStepOutcomeExt,
      {
        executionId: context.executionId,
        action,
        outcome,
        ...(error ? { error } : {}),
      },
    );
  } catch (loggingError) {
    console.error(
      `Failed to record step outcome for "${action}":`,
      loggingError instanceof Error ? loggingError.message : String(loggingError),
    );
  }
}
