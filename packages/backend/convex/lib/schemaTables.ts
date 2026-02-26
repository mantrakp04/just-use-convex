/** Table names from schema — single source of truth for workflow event inference. Keep in sync with schema.ts */
export const tableNames = [
  "todos",
  "todoAssignedMembers",
  "chats",
  "sandboxes",
  "globalAttachments",
  "orgMemberAttachments",
  "workflows",
  "workflowExecutions",
  "workflowSteps",
] as const;
