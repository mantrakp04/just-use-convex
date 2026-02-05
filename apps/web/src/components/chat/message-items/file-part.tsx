import { memo } from "react";
import type { UIMessage } from "@ai-sdk/react";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
} from "@/components/ai-elements/attachments";

export interface FilePartProps {
  part: Extract<UIMessage["parts"][number], { type: "file" }>;
  partKey: number;
}

export const FilePart = memo(function FilePart({ part, partKey }: FilePartProps) {
  return (
    <Attachments key={partKey} variant="grid">
      <Attachment data={{ ...part, id: String(partKey) }}>
        <AttachmentPreview />
      </Attachment>
    </Attachments>
  );
});
