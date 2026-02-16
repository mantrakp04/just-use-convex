import { createTool, createToolkit, type Toolkit } from "@voltagent/core";
import { z } from "zod";
import type { ConvexAdapter } from "@just-use-convex/backend/convex/lib/convexAdapter";

export function createWorkflowActionToolkit(
  allowedActions: string[],
  _convexAdapter: ConvexAdapter,
): Toolkit {
  const sendMessage = createTool({
    name: "send_message",
    description: "Send a workflow message as part of execution output.",
    parameters: z.object({
      message: z.string().describe("Message content to send"),
      level: z.enum(["info", "warning", "error"]).optional().describe("Message level"),
    }),
    execute: async ({ message, level = "info" }) => {
      return { sent: true, message, level, timestamp: Date.now() };
    },
  });

  const httpRequest = createTool({
    name: "http_request",
    description: "Make an HTTP request to an external URL. Supports GET and POST methods.",
    parameters: z.object({
      url: z.string().url().describe("The URL to request"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional().describe("HTTP method (default: GET)"),
      headers: z.record(z.string(), z.string()).optional().describe("Request headers"),
      body: z.string().optional().describe("Request body (for POST/PUT/PATCH)"),
    }),
    execute: async ({ url, method = "GET", headers, body }) => {
      const response = await fetchWithSafeRedirects(url, {
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

async function fetchWithSafeRedirects(
  rawUrl: string,
  init: RequestInit,
): Promise<Response> {
  let currentUrl = new URL(rawUrl);
  let method = (init.method ?? "GET").toUpperCase();
  let body = init.body;
  let headers = init.headers;

  for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
    assertSafeHttpUrl(currentUrl.toString());

    const response = await fetch(currentUrl.toString(), {
      ...init,
      headers,
      method,
      body,
      redirect: "manual",
    });

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    if (redirectCount === 5) {
      throw new Error("Too many redirects.");
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error("Redirect response missing location header.");
    }

    const nextUrl = new URL(location, currentUrl);

    if (nextUrl.origin !== currentUrl.origin) {
      headers = stripSensitiveHeaders(headers);
    }

    currentUrl = nextUrl;

    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method !== "GET" && method !== "HEAD")) {
      method = "GET";
      body = undefined;
    }
  }

  throw new Error("Unexpected redirect handling failure.");
}

function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function stripSensitiveHeaders(headersInit: HeadersInit | undefined): Headers {
  const headers = new Headers(headersInit ?? {});
  headers.delete("authorization");
  headers.delete("proxy-authorization");
  headers.delete("cookie");
  return headers;
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
  const normalized = normalizeIpv6Hostname(hostname);
  if (!normalized.includes(":")) return false;
  if (normalized === "::1") return true;

  const mappedIpv4 = parseIpv4FromMappedIpv6(normalized);
  if (mappedIpv4) {
    return isPrivateIpv4(mappedIpv4);
  }
  if (normalized.startsWith("::ffff:")) {
    // Fail closed for unmapped IPv6-mapped IPv4 representations.
    return true;
  }

  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function normalizeIpv6Hostname(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function parseIpv4FromMappedIpv6(hostname: string): string | null {
  const dottedMatch = hostname.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dottedMatch?.[1]) {
    return dottedMatch[1];
  }

  const hexMatch = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hexMatch) {
    return null;
  }

  const [, firstHex, secondHex] = hexMatch;
  if (!firstHex || !secondHex) {
    return null;
  }

  const first = Number.parseInt(firstHex, 16);
  const second = Number.parseInt(secondHex, 16);
  if (
    Number.isNaN(first) ||
    Number.isNaN(second) ||
    first < 0 ||
    first > 0xffff ||
    second < 0 ||
    second > 0xffff
  ) {
    return null;
  }

  const octets = [
    (first >> 8) & 0xff,
    first & 0xff,
    (second >> 8) & 0xff,
    second & 0xff,
  ];
  return octets.join(".");
}
