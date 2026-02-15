import { createTool, createToolkit, type Toolkit } from "@voltagent/core";
import { z } from "zod";
import type { ConvexAdapter } from "@just-use-convex/backend/convex/lib/convexAdapter";
import { api } from "@just-use-convex/backend/convex/_generated/api";

export function createWorkflowActionToolkit(
  allowedActions: string[],
  convexAdapter: ConvexAdapter,
): Toolkit {
  const sendMessage = createTool({
    name: "send_message",
    description: "Send a message to a chat. Use this to post updates or notifications to a chat thread.",
    parameters: z.object({
      chatId: z.string().describe("The chat ID to send a message to"),
      title: z.string().describe("Update the chat title with this value"),
    }),
    execute: async ({ chatId, title }) => {
      const updateFn = convexAdapter.getTokenType() === "ext"
        ? api.chats.index.updateExt
        : api.chats.index.update;
      await convexAdapter.mutation(updateFn, {
        _id: chatId,
        patch: { title },
      } as never);
      return { success: true, chatId, title };
    },
  });

  const createTodo = createTool({
    name: "create_todo",
    description: "Create a new todo/task item in the organization.",
    parameters: z.object({
      title: z.string().describe("The todo title"),
      description: z.string().optional().describe("Optional description"),
      priority: z.enum(["low", "medium", "high"]).optional().describe("Priority level"),
    }),
    execute: async ({ title, description, priority }) => {
      const todo = await convexAdapter.mutation(
        api.todos.index.create,
        {
          data: {
            title,
            description,
            priority: priority ?? "medium",
          },
        } as never,
      );
      return { success: true, todoId: todo };
    },
  });

  const runSandboxCommand = createTool({
    name: "run_sandbox_command",
    description: "Execute a command in a sandbox environment.",
    parameters: z.object({
      command: z.string().describe("The shell command to execute"),
      sandboxId: z.string().describe("The sandbox ID to execute in"),
    }),
    execute: async ({ command, sandboxId }) => {
      return {
        success: false,
        message: `Sandbox execution requires Daytona SDK. Command: ${command}, Sandbox: ${sandboxId}`,
      };
    },
  });

  const webSearch = createTool({
    name: "web_search",
    description: "Search the web for information.",
    parameters: z.object({
      query: z.string().describe("The search query"),
      numResults: z.number().min(1).max(10).optional().describe("Number of results"),
    }),
    execute: async ({ query, numResults = 5 }) => {
      const Exa = (await import("exa-js")).default;
      const exa = new Exa();
      const response = await exa.search(query.trim(), {
        numResults,
        contents: { text: { maxCharacters: 3000 } },
      });
      return {
        query,
        results: response.results.map((r) => ({
          title: r.title,
          url: r.url,
          text: r.text,
        })),
      };
    },
  });

  const httpRequest = createTool({
    name: "http_request",
    description: "Make an HTTP request to an external URL. Supports GET and POST methods.",
    parameters: z.object({
      url: z.string().url().describe("The URL to request"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().describe("HTTP method (default: GET)"),
      headers: z.record(z.string()).optional().describe("Request headers"),
      body: z.string().optional().describe("Request body (for POST/PUT/PATCH)"),
    }),
    execute: async ({ url, method = "GET", headers, body }) => {
      const response = await fetch(url, {
        method,
        headers: headers ?? {},
        body: ["POST", "PUT", "PATCH"].includes(method) ? body : undefined,
      });
      const responseText = await response.text();
      const truncated = responseText.length > 5000
        ? responseText.slice(0, 5000) + "\n... (truncated)"
        : responseText;
      return {
        status: response.status,
        statusText: response.statusText,
        body: truncated,
      };
    },
  });

  const notify = createTool({
    name: "notify",
    description: "Send a notification. Currently logs the notification for the workflow execution record.",
    parameters: z.object({
      message: z.string().describe("The notification message"),
      level: z.enum(["info", "warning", "error"]).optional().describe("Notification level"),
    }),
    execute: async ({ message, level = "info" }) => {
      return { notified: true, message, level, timestamp: Date.now() };
    },
  });

  const allTools = {
    send_message: sendMessage,
    create_todo: createTodo,
    run_sandbox_command: runSandboxCommand,
    web_search: webSearch,
    http_request: httpRequest,
    notify,
  } as const;

  type ToolKey = keyof typeof allTools;

  // Filter to only allowed actions
  const tools = allowedActions
    .filter((a): a is ToolKey => a in allTools)
    .map((a) => allTools[a]);

  return createToolkit({
    name: "workflow_actions",
    description: "Available actions for this workflow execution",
    tools,
  });
}
