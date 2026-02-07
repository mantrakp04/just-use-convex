export function normalizeRootDir(path: string): string {
  return path.trim().replace(/\/+/g, "/");
}

export function resolvePath(path: string, rootDir: string): string {
  const normalizedInput = path.trim() || ".";
  if (normalizedInput === "/" || normalizedInput === ".") {
    return rootDir;
  }
  if (normalizedInput.startsWith("/")) {
    return normalizedInput.replace(/\/+/g, "/");
  }
  return `${rootDir}/${normalizedInput}`.replace(/\/+/g, "/");
}

export function normalizeTimestamp(timestamp?: string): string {
  if (!timestamp) {
    return new Date().toISOString();
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

export function normalizeReturnedPath(path: string, basePath: string): string {
  if (path.startsWith("/")) {
    return path.replace(/\/+/g, "/");
  }
  return `${basePath}/${path}`.replace(/\/+/g, "/");
}

export function joinPath(basePath: string, childName: string): string {
  const cleanBase = basePath.endsWith("/") && basePath !== "/" ? basePath.slice(0, -1) : basePath;
  return `${cleanBase}/${childName}`.replace(/\/+/g, "/");
}

export function getParentDir(path: string): string {
  const normalizedPath = path.endsWith("/") && path !== "/" ? path.replace(/\/+$/, "") : path;
  const index = normalizedPath.lastIndexOf("/");
  if (index <= 0) {
    return "/";
  }
  return normalizedPath.slice(0, index) || "/";
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
