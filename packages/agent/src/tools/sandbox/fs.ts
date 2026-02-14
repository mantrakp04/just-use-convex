import { type Sandbox } from '@daytonaio/sdk';
import { z } from 'zod';
import { listSchema } from './types';

const deleteEntrySchema = z.object({ path: z.string() });
const downloadFolderSchema = z.object({ path: z.string() });
const downloadFileSchema = z.object({ path: z.string() });

type ListFilesInput = z.infer<typeof listSchema>;
type DownloadFileInput = z.infer<typeof downloadFileSchema>;
type DownloadFolderInput = z.infer<typeof downloadFolderSchema>;
type DeleteEntryInput = z.infer<typeof deleteEntrySchema>;

export class SandboxFsService {
  constructor(private sandbox: Sandbox) {}

  async listFiles(input: ListFilesInput) {
    const { path } = listSchema.parse(input);
    return await this.sandbox.fs.listFiles(path);
  }

  async downloadFile(input: DownloadFileInput) {
    const { path } = downloadFileSchema.parse(input);
    const fileBuffer = await this.sandbox.fs.downloadFile(path);
    const file = new File([fileBuffer], path.split('/').pop() ?? 'file.txt');
    return file
  }

  async downloadFolder(input: DownloadFolderInput) {
    const { path } = downloadFolderSchema.parse(input);
    const command = `tar -czf - ${path} | base64 -w 0`;
    const commandResult = await this.sandbox.process.executeCommand(command);
    if (commandResult.exitCode !== 0) {
      throw new Error(commandResult.result);
    }
    return new File([commandResult.result], path.split('/').pop() ?? 'folder.tar.gz');
  }

  async deleteEntry(input: DeleteEntryInput) {
    const { path } = deleteEntrySchema.parse(input);
    const command = `rm -rf ${path}`;
    await this.sandbox.process.executeCommand(command);
    return { deleted: true as const, path };
  }
}
