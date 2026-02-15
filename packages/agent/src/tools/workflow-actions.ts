import { createTool, createToolkit, type Toolkit } from "@voltagent/core";
import { z } from "zod";
import type { ConvexAdapter } from "@just-use-convex/backend/convex/lib/convexAdapter";
import { api } from "@just-use-convex/backend/convex/_generated/api";

export function createWorkflowActionToolkit(
  allowedActions: string[],
  convexAdapter: ConvexAdapter,
): Toolkit {
  const updateChatTitle = createTool({
    name: "update_chat_title",
    description: "Update a chat title.",
    parameters: z.object({
      chatId: z.string().describe("The chat ID to update"),
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
      assertSafeHttpUrl(url);

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
    send_message: updateChatTitle,
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

function assertSafeHttpUrl(rawUrl: string): void {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed.");
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error(`Blocked host: ${hostname}`);
  }

  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    throw new Error(`Blocked private address: ${hostname}`);
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => part.length === 0)) return false;

  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const a = octets[0]!;
  const b = octets[1]!;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;

  return false;
}

function isPrivateIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) return false;
  if (hostname === "::1") return true;

  return (
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:")
  );
}
