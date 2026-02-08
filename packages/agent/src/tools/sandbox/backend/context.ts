import { getSandboxInstance } from "./runtime";
import { normalizeRootPath, resolveSandboxPath } from "./utils";
import type { SandboxEnv, SandboxInstance } from "./types";

export class SandboxContext {
  private sandboxPromise: Promise<SandboxInstance> | null = null;
  private rootPathPromise: Promise<string> | null = null;

  constructor(
    private readonly env: SandboxEnv,
    readonly sandboxId: string
  ) {}

  async getSandbox(): Promise<SandboxInstance> {
    if (!this.sandboxPromise) {
      this.sandboxPromise = getSandboxInstance(this.env, this.sandboxId);
    }

    return this.sandboxPromise;
  }

  async getRootPath(): Promise<string> {
    if (!this.rootPathPromise) {
      this.rootPathPromise = (async () => {
        const sandbox = await this.getSandbox();
        const workDir = await sandbox.getWorkDir();

        if (!workDir) {
          throw new Error(`Sandbox ${this.sandboxId} does not expose a workdir`);
        }

        return normalizeRootPath(workDir);
      })();
    }

    return this.rootPathPromise;
  }

  async resolvePath(inputPath: string): Promise<string> {
    return resolveSandboxPath(inputPath, await this.getRootPath());
  }
}
