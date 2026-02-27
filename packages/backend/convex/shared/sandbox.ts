import { Daytona, Sandbox } from "@daytonaio/sdk";
import { env } from "@just-use-convex/env/backend";

const {
  SANDBOX_SNAPSHOT,
  SANDBOX_VOLUME_MOUNT_PATH: SANDBOX_MOUNT_PATH,
  SANDBOX_INACTIVITY_TIMEOUT_MINUTES,
} = env;
const SANDBOX_AUTOSTOP_INTERVAL = normalizeAutostopInterval(SANDBOX_INACTIVITY_TIMEOUT_MINUTES);

async function createSandbox(daytona: Daytona, connectionId: string): Promise<Sandbox> {
  console.info(`[sandbox] Creating sandbox for ${connectionId}`);
  const volume = await daytona.volume.get(connectionId, true);
  return daytona.create({
    name: connectionId,
    snapshot: SANDBOX_SNAPSHOT,
    volumes: [{ volumeId: volume.id, mountPath: SANDBOX_MOUNT_PATH }],
    autoStopInterval: SANDBOX_AUTOSTOP_INTERVAL,
  });
}

async function startSandbox(sandbox: Sandbox): Promise<void> {
  if (sandbox.state === "started") return;
  await sandbox.start();
  await sandbox.setAutostopInterval(SANDBOX_AUTOSTOP_INTERVAL);
}

export async function ensureSandboxReady(daytona: Daytona, connectionId: string): Promise<Sandbox> {
  // 1. If sandbox doesn't exist, create it
  let sandbox: Sandbox;
  try {
    sandbox = await daytona.get(connectionId);
  } catch {
    return createSandbox(daytona, connectionId);
  }

  // 2. Try to start it
  try {
    await startSandbox(sandbox);
    return sandbox;
  } catch (e) {
    console.warn(`[sandbox] Start failed for ${sandbox.id}, retrying:`, e);
  }

  // 3. Retry start
  try {
    await startSandbox(sandbox);
    return sandbox;
  } catch (e) {
    console.warn(`[sandbox] Retry start failed for ${sandbox.id}, recreating:`, e);
  }

  // 4. Delete and recreate
  try {
    await daytona.delete(sandbox);
  } catch (e) {
    console.warn(`[sandbox] Failed to delete ${sandbox.id}:`, e);
  }

  return createSandbox(daytona, connectionId);
}

export async function ensureSandboxStarted(sandbox: Sandbox): Promise<void> {
  try {
    await startSandbox(sandbox);
  } catch (e) {
    console.warn(`[sandbox] Start failed for ${sandbox.id}, retrying:`, e);
    await startSandbox(sandbox);
  }
}

export async function destroySandbox(daytona: Daytona, sandboxId: string): Promise<void> {
  try {
    const sandbox = await daytona.get(sandboxId);
    await daytona.delete(sandbox);
  } catch (e) {
    if (!isNotFoundError(e)) throw e;
  }

  try {
    const volume = await daytona.volume.get(sandboxId);
    await daytona.volume.delete(volume);
  } catch (e) {
    if (!isNotFoundError(e)) throw e;
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  const statusCode = "statusCode" in error ? (error as { statusCode: number }).statusCode : undefined;
  return msg.includes("not found") || msg.includes("404") || statusCode === 404;
}

function normalizeAutostopInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = Math.floor(value);
  return normalized < 0 ? 0 : normalized;
}
