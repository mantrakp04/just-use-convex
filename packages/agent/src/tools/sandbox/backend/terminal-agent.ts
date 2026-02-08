import { callable } from "agents";
import { AIChatAgent } from "@cloudflare/ai-chat";
import type { worker } from "../../../../alchemy.run";
import { SandboxContext } from "./context";
import { SandboxPtyService } from "./pty";

export abstract class SandboxTerminalAgentBase<TArgs>
  extends AIChatAgent<typeof worker.Env, TArgs> {
  protected readonly ptyService = new SandboxPtyService();

  protected abstract initSandboxAccess(): Promise<void>;
  protected abstract getSandboxIdForTerminal(): string | null;

  private getSandboxPtyService(sandboxId: string): SandboxPtyService {
    return new SandboxPtyService(new SandboxContext(this.env, sandboxId));
  }

  @callable()
  async openPtyTerminal(params?: { cols?: number; rows?: number }) {
    await this.initSandboxAccess();

    const sandboxId = this.getSandboxIdForTerminal();
    if (!sandboxId) {
      throw new Error("This chat does not have a sandbox attached");
    }

    return this.getSandboxPtyService(sandboxId).open({
      waitUntil: this.ctx.waitUntil.bind(this.ctx),
      cols: params?.cols,
      rows: params?.rows,
    });
  }

  @callable()
  async readPtyTerminal(params: { terminalId: string; offset?: number }) {
    return this.ptyService.read(params);
  }

  @callable()
  async writePtyTerminal(params: { terminalId: string; data: string }) {
    return this.ptyService.write(params);
  }

  @callable()
  async resizePtyTerminal(params: { terminalId: string; cols: number; rows: number }) {
    return this.ptyService.resize(params);
  }

  @callable()
  async closePtyTerminal(params: { terminalId: string }) {
    return this.ptyService.close(params);
  }

  @callable()
  async listFiles(params?: { path?: string }) {
    await this.initSandboxAccess();

    const sandboxId = this.getSandboxIdForTerminal();
    if (!sandboxId) {
      throw new Error("This chat does not have a sandbox attached");
    }

    return this.getSandboxPtyService(sandboxId).listFiles(params?.path);
  }
}
