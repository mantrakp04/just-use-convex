import type { SandboxInstance } from "./types";

export function normalizeRootPath(path: string): string {
  return path.trim().replace(/\/+/g, "/");
}

export function resolveSandboxPath(inputPath: string, rootPath: string): string {
  const normalizedInput = inputPath.trim() || ".";

  if (normalizedInput === "/" || normalizedInput === ".") {
    return rootPath;
  }

  if (normalizedInput.startsWith("/")) {
    return normalizedInput.replace(/\/+/g, "/");
  }

  return `${rootPath}/${normalizedInput}`.replace(/\/+/g, "/");
}

export function normalizeFoundPath(path: string, basePath: string): string {
  if (path.startsWith("/")) {
    return path.replace(/\/+/g, "/");
  }

  return `${basePath}/${path}`.replace(/\/+/g, "/");
}

export function joinPath(basePath: string, childName: string): string {
  const normalizedBase = basePath.endsWith("/") && basePath !== "/"
    ? basePath.slice(0, -1)
    : basePath;

  return `${normalizedBase}/${childName}`.replace(/\/+/g, "/");
}

export function parentPath(path: string): string {
  const normalizedPath = path.endsWith("/") && path !== "/"
    ? path.replace(/\/+$/, "")
    : path;

  const separatorIndex = normalizedPath.lastIndexOf("/");
  if (separatorIndex <= 0) {
    return "/";
  }

  return normalizedPath.slice(0, separatorIndex) || "/";
}

export function toIsoTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return new Date().toISOString();
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

export function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeModTime(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return 0;
}

export function escapeShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export async function getFileDetailsOrNull(sandbox: SandboxInstance, path: string) {
  try {
    return await sandbox.fs.getFileDetails(path);
  } catch {
    return null;
  }
}

export async function ensureDirectoryExists(
  sandbox: SandboxInstance,
  targetDirectoryPath: string
): Promise<void> {
  if (!targetDirectoryPath || targetDirectoryPath === "/") {
    return;
  }

  const segments = targetDirectoryPath.split("/").filter(Boolean);
  let currentPath = "";

  for (const segment of segments) {
    currentPath = `${currentPath}/${segment}`.replace(/\/+/g, "/");

    const details = await getFileDetailsOrNull(sandbox, currentPath);
    if (details?.isDir) {
      continue;
    }

    if (details && !details.isDir) {
      throw new Error(`Path exists and is not a directory: ${currentPath}`);
    }

    await sandbox.fs.createFolder(currentPath, "755");
  }
}
