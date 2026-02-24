import mime from "mime";

export async function toHexHash(bytes: Uint8Array) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function sanitizeAttachmentFileName(fileName: string) {
  return fileName.replace(/[\r\n]+/g, " ").trim() || "file";
}

export function getAttachmentFileNameFromPath(path: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const segments = normalizedPath.split("/");
  const fileName = segments[segments.length - 1] || "file";
  return sanitizeAttachmentFileName(fileName);
}

export function inferAttachmentContentType(fileNameOrPath: string): string | undefined {
  return mime.getType(fileNameOrPath) ?? undefined;
}

export async function uploadBytesToConvexStorage(
  uploadUrl: string,
  fileBytes: Uint8Array,
  contentType: string | undefined,
) {
  const normalizedBytes = new Uint8Array(fileBytes);
  const body = normalizedBytes.buffer.slice(
    normalizedBytes.byteOffset,
    normalizedBytes.byteOffset + normalizedBytes.byteLength,
  );

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType ?? "application/octet-stream" },
    body,
  });

  if (!response.ok) {
    const body = (await response.text()).trim();
    throw new Error(
      body
        ? `Attachment upload failed (${response.status}): ${body}`
        : `Attachment upload failed (${response.status})`
    );
  }

  const result: Record<string, unknown> = await response.json();
  const storageId = typeof result.storageId === "string" ? result.storageId : undefined;
  if (!storageId) {
    throw new Error("Attachment upload failed: missing storageId");
  }

  return { storageId };
}
