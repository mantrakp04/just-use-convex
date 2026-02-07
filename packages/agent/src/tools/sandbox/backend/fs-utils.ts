import type { SandboxInstance } from "./daytona";

export async function getFileDetailsOrNull(sandbox: SandboxInstance, path: string) {
  try {
    return await sandbox.fs.getFileDetails(path);
  } catch {
    return null;
  }
}

export async function ensureDirectory(sandbox: SandboxInstance, directoryPath: string): Promise<void> {
  if (!directoryPath || directoryPath === "/") {
    return;
  }

  const segments = directoryPath.split("/").filter(Boolean);
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

    try {
      await sandbox.fs.createFolder(currentPath, "755");
    } catch {
      const refreshed = await getFileDetailsOrNull(sandbox, currentPath);
      if (!refreshed?.isDir) {
        throw new Error(`Failed to create directory: ${currentPath}`);
      }
    }
  }
}
