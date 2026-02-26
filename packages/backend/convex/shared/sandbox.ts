import { Daytona, Sandbox } from "@daytonaio/sdk";
import { env } from "@just-use-convex/env/backend";

const {
  SANDBOX_MAX_START_RETRIES: MAX_START_RETRIES,
  SANDBOX_START_RETRY_DELAY_MS: RETRY_DELAY_MS,
  SANDBOX_SNAPSHOT,
  SANDBOX_VOLUME_MOUNT_PATH: SANDBOX_MOUNT_PATH,
  SANDBOX_MAX_VOLUME_READY_RETRIES: VOLUME_READY_MAX_ATTEMPTS,
  SANDBOX_VOLUME_READY_POLL_INTERVAL_MS: VOLUME_READY_POLL_INTERVAL_MS,
} = env;

async function waitForVolumeReady(daytona: Daytona, volumeName: string) {
  let volume = await daytona.volume.get(volumeName, true);
  let attempts = 0;
  while (volume.state !== "ready" && attempts < VOLUME_READY_MAX_ATTEMPTS) {
    if (volume.state === "error") {
      throw new Error(
        `Volume '${volumeName}' entered error state: ${volume.errorReason ?? "unknown reason"}`
      );
    }
    await sleep(VOLUME_READY_POLL_INTERVAL_MS);
    volume = await daytona.volume.get(volumeName, true);
    attempts++;
  }
  if (volume.state !== "ready") {
    throw new Error(
      `Volume '${volumeName}' did not become ready after ${VOLUME_READY_MAX_ATTEMPTS} attempts. Last state: '${volume.state}'.`
    );
  }
  return volume;
}

async function createSandbox(daytona: Daytona, connectionId: string): Promise<Sandbox> {
  console.info(`[sandbox] Creating new sandbox for connection ${connectionId}`);
  const volume = await waitForVolumeReady(daytona, connectionId);
  const sandbox = await daytona.create({
    name: connectionId,
    snapshot: SANDBOX_SNAPSHOT,
    volumes: [{ volumeId: volume.id, mountPath: SANDBOX_MOUNT_PATH }],
  });
  await sandbox.start();
  await sandbox.waitUntilStarted();
  await sandbox.setAutostopInterval(env.SANDBOX_INACTIVITY_TIMEOUT_MINUTES);
  console.info(`[sandbox] Created and started sandbox ${sandbox.id}`);
  return sandbox;
}

async function tryStartSandbox(sandbox: Sandbox, skipWaitUntilStarted: boolean): Promise<void> {
  const state = await sandbox.state;
  console.info(`[sandbox] Sandbox ${sandbox.id} state: ${state}`);
  if (state === "started") {
    await sandbox.setAutostopInterval(env.SANDBOX_INACTIVITY_TIMEOUT_MINUTES);
    return;
  }
  await sandbox.start();
  await sandbox.setAutostopInterval(env.SANDBOX_INACTIVITY_TIMEOUT_MINUTES);
  if (!skipWaitUntilStarted) {
    await sandbox.waitUntilStarted();
  }
  console.info(`[sandbox] Sandbox ${sandbox.id} started successfully`);
}

async function tryRecoverSandbox(sandbox: Sandbox, skipWaitUntilStarted: boolean): Promise<void> {
  console.info(`[sandbox] Attempting recovery for sandbox ${sandbox.id}`);
  await sandbox.recover();
  await sandbox.setAutostopInterval(env.SANDBOX_INACTIVITY_TIMEOUT_MINUTES);
  if (!skipWaitUntilStarted) {
    await sandbox.waitUntilStarted();
  }
  console.info(`[sandbox] Sandbox ${sandbox.id} recovered and started`);
}

export async function ensureSandboxReady(daytona: Daytona, connectionId: string): Promise<Sandbox> {
  let sandbox: Sandbox;
  try {
    sandbox = await daytona.get(connectionId);
  } catch {
    return createSandbox(daytona, connectionId);
  }

  for (let attempt = 0; attempt < MAX_START_RETRIES; attempt++) {
    try {
      await tryStartSandbox(sandbox, true);
      return sandbox;
    } catch (startError) {
      console.warn(
        `[sandbox] Start failed for ${sandbox.id} (attempt ${attempt + 1}/${MAX_START_RETRIES}):`,
        startError,
      );

      if (isStateChangeInProgressError(startError)) {
        await sandbox.waitUntilStarted();
        return sandbox;
      }

      if (isConflictError(startError) && attempt < MAX_START_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      try {
        await tryRecoverSandbox(sandbox, true);
        return sandbox;
      } catch (recoverError) {
        console.warn(
          `[sandbox] Recovery failed for ${sandbox.id} (attempt ${attempt + 1}/${MAX_START_RETRIES}):`,
          recoverError,
        );
      }

      if (attempt < MAX_START_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
    }
  }

  console.error(`[sandbox] All start/recovery attempts exhausted for ${sandbox.id}, deleting and recreating`);
  try {
    await daytona.delete(sandbox);
  } catch (deleteError) {
    console.warn(`[sandbox] Failed to delete sandbox ${sandbox.id}, continuing with recreation`, deleteError);
  }
  return createSandbox(daytona, connectionId);
}

function isConflictError(error: unknown): boolean {
  return error instanceof Error && "statusCode" in error && (error as { statusCode: number }).statusCode === 409;
}

function isStateChangeInProgressError(error: unknown): boolean {
  if (!(error instanceof Error) || !("statusCode" in error)) {
    return false;
  }

  const statusCode = (error as { statusCode: number }).statusCode;
  return statusCode === 400 && error.message.toLowerCase().includes("state change in progress");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function ensureSandboxStarted(sandbox: Sandbox, skipWaitUntilStarted: boolean = true) {
  for (let attempt = 0; attempt < MAX_START_RETRIES; attempt++) {
    try {
      await tryStartSandbox(sandbox, skipWaitUntilStarted);
      return;
    } catch (startError) {
      console.warn(`[sandbox] Start failed for ${sandbox.id} (attempt ${attempt + 1}/${MAX_START_RETRIES}):`, startError);

      if (isStateChangeInProgressError(startError)) {
        if (!skipWaitUntilStarted) {
          await sandbox.waitUntilStarted();
        }
        return;
      }

      if (isConflictError(startError) && attempt < MAX_START_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      try {
        await tryRecoverSandbox(sandbox, skipWaitUntilStarted);
        return;
      } catch (recoverError) {
        console.warn(`[sandbox] Recovery failed for ${sandbox.id} (attempt ${attempt + 1}/${MAX_START_RETRIES}):`, recoverError);
      }

      if (attempt < MAX_START_RETRIES - 1) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw new Error(`[sandbox] Unable to ensure sandbox ${sandbox.id} is running after ${MAX_START_RETRIES} attempts`);
}

export async function destroySandbox(daytona: Daytona, sandboxId: string): Promise<void> {
  try {
    const sandbox = await daytona.get(sandboxId);
    await daytona.delete(sandbox);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  try {
    const volume = await daytona.volume.get(sandboxId, false);
    await daytona.volume.delete(volume);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const statusCode = "statusCode" in error ? (error as { statusCode: number }).statusCode : undefined;
  return msg.includes("not found") || msg.includes("404") || statusCode === 404;
}
