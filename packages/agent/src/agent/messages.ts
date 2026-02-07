import { isFileUIPart, type UIMessage } from "ai";

export function extractMessageText(message: UIMessage): string {
  if (message.role !== "user" && message.role !== "assistant") return "";
  return message.parts
    .map((part) => part.type === "text" ? part.text : "")
    .filter(Boolean)
    .join("\n");
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

export function filterMessageParts(messages: UIMessage[], inputModalities?: string[]): UIMessage[] {
  return messages.map((msg) => ({
    ...msg,
    parts: msg.parts.filter((part) => {
      if (!isFileUIPart(part)) return true;
      return isMimeTypeSupported(part.mediaType, inputModalities);
    }),
  }));
}

export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "file";
  const sanitized = base.replace(/[\u0000-\u001F\u007F]/g, "_").trim();
  return sanitized.length > 0 ? sanitized : "file";
}
