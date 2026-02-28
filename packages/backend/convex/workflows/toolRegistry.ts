/**
 * Canonical registry of all tools grouped by toolkit.
 * Single source of truth for both agent and frontend.
 */

export type ToolEntry = {
  readonly name: string;
  readonly label: string;
  readonly description: string;
};

export type ToolGroup = {
  readonly toolkit: string;
  readonly label: string;
  readonly description: string;
  readonly tools: readonly ToolEntry[];
};

export const TOOL_GROUPS = [
  {
    toolkit: "sandbox",
    label: "Sandbox",
    description: "File operations, command execution, code interpreter",
    tools: [
      { name: "list", label: "List Files", description: "List files and directories" },
      { name: "read", label: "Read File", description: "Read file contents" },
      { name: "write", label: "Write File", description: "Write or overwrite a file" },
      { name: "edit", label: "Edit File", description: "Text replacement in a file" },
      { name: "glob", label: "Glob", description: "Find files matching a pattern" },
      { name: "grep", label: "Grep", description: "Search for text patterns" },
      { name: "upload_attachment_to_workspace", label: "Upload Attachment", description: "Upload sandbox file to workspace" },
      { name: "exec", label: "Execute Command", description: "Run shell commands" },
      { name: "stateful_code_exec", label: "Code Interpreter", description: "Run persistent Python code" },
    ],
  },
  {
    toolkit: "web_search",
    label: "Web Search",
    description: "Neural web search via Exa",
    tools: [
      { name: "web_search", label: "Web Search", description: "Search the web for information" },
    ],
  },
  {
    toolkit: "workflow",
    label: "Workflow Management",
    description: "List, inspect, update, and delete workflows",
    tools: [
      { name: "workflow_list", label: "List Workflows", description: "List workflows" },
      { name: "workflow_get", label: "Get Workflow", description: "Get workflow details" },
      { name: "workflow_get_runs", label: "Get Runs", description: "List execution runs" },
      { name: "workflow_get_run_output_page", label: "Get Run Output", description: "Paginate run output" },
      { name: "workflow_update", label: "Update Workflow", description: "Update workflow fields" },
      { name: "workflow_delete", label: "Delete Workflow", description: "Delete a workflow" },
    ],
  },
  {
    toolkit: "workflow_actions",
    label: "Workflow Actions",
    description: "Output actions for workflow execution",
    tools: [
      { name: "send_message", label: "Send Message", description: "Send a workflow output message" },
      { name: "http_request", label: "HTTP Request", description: "Make an external HTTP request" },
      { name: "notify", label: "Notify", description: "Send a notification" },
    ],
  },
] as const satisfies readonly ToolGroup[];

export const ALL_TOOL_NAMES = TOOL_GROUPS.flatMap((g) => g.tools.map((t) => t.name));
