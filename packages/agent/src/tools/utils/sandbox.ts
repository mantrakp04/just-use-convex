import type { Sandbox } from "@daytonaio/sdk";

const SANDBOX_INACTIVITY_TIMEOUT_MINUTES = 2;

export async function ensureSandboxStarted(sandbox: Sandbox, skipWaitUntilStarted: boolean = true) {
  await sandbox.start();
  await sandbox.setAutostopInterval(SANDBOX_INACTIVITY_TIMEOUT_MINUTES);
  if (!skipWaitUntilStarted) {
    await sandbox.waitUntilStarted();
  }
}
