import { SandboxFilesystemBackend } from "../tools/sandbox";
import type {
  LsInput,
  PtySessionCreateInput,
  XtermCloseInput,
  XtermReadInput,
  XtermResizeInput,
  XtermWriteInput,
} from "../tools/sandbox/types";

export class SandboxTerminal {
  constructor(
    private readonly getBackend: () => Promise<SandboxFilesystemBackend>
  ) {}

  async listFiles(input?: LsInput) {
    const backend = await this.getBackend();
    return await backend.listFiles({
      path: input?.path ?? ".",
    });
  }

  async openPtyTerminal(input?: PtySessionCreateInput) {
    const backend = await this.getBackend();
    const response = await backend.openPtySession({
      terminalId: input?.terminalId,
      cols: input?.cols,
      rows: input?.rows,
      cwd: input?.cwd,
      envs: input?.envs,
    });
    return { terminalId: response.terminalId };
  }

  async readPtyTerminal(input: XtermReadInput) {
    const backend = await this.getBackend();
    return await backend.readPtySession({
      terminalId: input.terminalId,
      offset: input.offset ?? 0,
    });
  }

  async writePtyTerminal(input: XtermWriteInput) {
    const backend = await this.getBackend();
    return await backend.writePtySession({
      terminalId: input.terminalId,
      data: input.data,
      cols: input.cols,
      rows: input.rows,
      cwd: input.cwd,
      envs: input.envs,
    });
  }

  async resizePtyTerminal(input: XtermResizeInput) {
    const backend = await this.getBackend();
    return await backend.resizePtySession({
      terminalId: input.terminalId,
      cols: input.cols,
      rows: input.rows,
    });
  }

  async listPtyTerminalSessions() {
    const backend = await this.getBackend();
    return await backend.listPtySessions();
  }

  async closePtyTerminal(input: XtermCloseInput) {
    const backend = await this.getBackend();
    return await backend.closePtySession({
      terminalId: input.terminalId,
    });
  }

  async downloadFile(input: { path: string }) {
    const backend = await this.getBackend();
    return await backend.downloadFileBase64({ path: input.path });
  }

  async downloadFolder(input: { path: string }) {
    const backend = await this.getBackend();
    return await backend.downloadFolderArchive({ path: input.path });
  }

  async deleteEntry(input: { path: string }) {
    const backend = await this.getBackend();
    return await backend.deleteEntry({ path: input.path });
  }
}
