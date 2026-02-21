import type { Sandbox } from "@daytonaio/sdk";
import { env } from "@just-use-convex/env/agent";
import type { FilePartUrl } from "../../agent/messages";

export async function ensureSandboxStarted(sandbox: Sandbox, skipWaitUntilStarted: boolean = true) {
  await sandbox.start();
  await sandbox.setAutostopInterval(env.SANDBOX_INACTIVITY_TIMEOUT_MINUTES);
  if (!skipWaitUntilStarted) {
    await sandbox.waitUntilStarted();
  }
}

export async function downloadFileUrlsInSandbox(
  sandbox: Sandbox,
  filePartUrls: FilePartUrl[]
): Promise<string[] | null> {
  if (filePartUrls.length === 0) return null;

  try {
    const uploadsDir = `${env.SANDBOX_VOLUME_MOUNT_PATH}/uploads`;
    const mkdirResult = await sandbox.process.executeCommand(`mkdir -p ${uploadsDir}`);
    if (mkdirResult.exitCode !== 0) {
      console.warn("Could not create uploads dir:", mkdirResult.result);
      return null;
    }

    const paths: string[] = [];
    await Promise.all(
      filePartUrls.map(async ({ url, filename }, i) => {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          const safeName = filename.replace(/[/\\]/g, "_");
          const path = `${uploadsDir}/${i}_${safeName}`;
          await sandbox.fs.uploadFile(buf, path);
          paths.push(path);
        } catch (err) {
          console.warn("Failed to download file from message:", url, err);
        }
      })
    );
    return paths;
  } catch (err) {
    console.warn("Daytona sandbox error during file upload:", err);
    return null;
  }
}
