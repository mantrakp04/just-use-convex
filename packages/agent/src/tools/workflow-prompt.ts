interface WorkflowDoc {
  name: string;
  description?: string;
  instructions: string;
}

export function buildWorkflowSystemPrompt(workflow: WorkflowDoc, triggerPayload: string): string {
  return `You are executing a workflow automation.

## Workflow: ${workflow.name}
${workflow.description ?? ""}

## Instructions
${workflow.instructions}

## Trigger Context
${triggerPayload}

## Rules
- Execute the workflow instructions using the available action tools
- Be decisive and complete the workflow efficiently
- Report what you did clearly
- If an action fails, note the failure and continue with remaining actions
- Do not ask for user input — workflows run autonomously`;
}
