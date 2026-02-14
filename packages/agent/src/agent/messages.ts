import { isFileUIPart, type UIMessage } from "ai";

const HTTP_URL_PREFIXES = ["http://", "https://"] as const;

export type FilePartUrl = { url: string; filename: string };

export interface ProcessedMessages {
  messages: UIMessage[];
  lastUserIdx: number;
  lastUserQueryText: string;
  lastUserFilePartUrls: FilePartUrl[];
}

export function processMessagesForAgent(
  messages: UIMessage[],
  inputModalities?: string[]
): ProcessedMessages {
  const result: UIMessage[] = [];
  let lastUserIdx = -1;
  let lastUserQueryText = "";
  let lastUserFilePartUrls: FilePartUrl[] = [];

  for (const msg of messages) {
    const mappedParts: UIMessage["parts"] = [];
    for (const part of msg.parts) {
      if (isFileUIPart(part)) {
        if (!isMimeTypeSupported(part.mediaType, inputModalities)) {
          const filename = sanitizeFilename(part.filename ?? "file");
          const path = `/home/daytona/uploads/${filename}`;
          mappedParts.push({ type: "text", text: `[File uploaded to sandbox: ${path}]` });
          continue;
        }
      }
      const toolName = "type" in part ? getToolNameFromPartType(part.type as string) : null;
      if (toolName != null && toolName.includes("sub-")) continue;
      mappedParts.push(part);
    }

    const sanitized = { ...msg, parts: mappedParts };
    result.push(sanitized);

    if (msg.role === "user") {
      lastUserIdx = result.length - 1;
      const extracted = extractTextAndFileUrlsFromParts(msg.parts);
      lastUserQueryText = extracted.text;
      lastUserFilePartUrls = extracted.filePartUrls;
    }
  }

  return { messages: result, lastUserIdx, lastUserQueryText, lastUserFilePartUrls };
}

export function extractMessageText(message: UIMessage): string {
  if (message.role !== "user" && message.role !== "assistant") return "";
  return extractTextAndFileUrlsFromParts(message.parts).text;
}

function extractTextAndFileUrlsFromParts(
  parts: UIMessage["parts"]
): { text: string; filePartUrls: FilePartUrl[] } {
  const textLines: string[] = [];
  const filePartUrls: FilePartUrl[] = [];
  for (const part of parts) {
    if (part.type === "text" && part.text) {
      textLines.push(part.text);
    } else if (
      isFileUIPart(part) &&
      part.url &&
      typeof part.url === "string" &&
      HTTP_URL_PREFIXES.some((p) => part.url.trim().startsWith(p))
    ) {
      const url = part.url.trim();
      const filename = sanitizeFilename(part.filename ?? url.split("/").pop() ?? "file");
      filePartUrls.push({ url, filename });
    }
  }
  return { text: textLines.join("\n"), filePartUrls };
}

function getMimeModality(mimeType: string): string | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("application/pdf")) return "file";
  if (mimeType.startsWith("text/")) return "text";
  return null;
}

function isMimeTypeSupported(mimeType: string, inputModalities?: string[]): boolean {
  if (!inputModalities || inputModalities.length === 0) return true;

  const modality = getMimeModality(mimeType);
  if (!modality) return false;
  if (modality === "file" && inputModalities.includes("image")) return true;

  return inputModalities.includes(modality);
}

function getToolNameFromPartType(type: string): string | null {
  if (!type.startsWith("tool-")) return null;
  return type.slice(5);
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "file";
  const sanitized = base.replace(/[\u0000-\u001F\u007F]/g, "_").trim();
  return sanitized.length > 0 ? sanitized : "file";
}
