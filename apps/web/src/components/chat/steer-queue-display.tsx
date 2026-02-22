import { memo, useState } from "react";
import { ListOrderedIcon, Loader2Icon, XIcon } from "lucide-react";
import {
  Queue,
  QueueItem,
  QueueItemAction,
  QueueItemActions,
  QueueItemAttachment,
  QueueItemContent,
  QueueItemDescription,
  QueueItemFile,
  QueueItemImage,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { SteerQueueItem } from "./types";

export interface SteerQueueDisplayProps {
  items: SteerQueueItem[];
  pendingRemovalIds: string[];
  isRefreshing?: boolean;
  isSteering?: boolean;
  onRemoveItem: (itemId: string) => void;
  onSteer: (text: string) => Promise<void>;
}

export const SteerQueueDisplay = memo(function SteerQueueDisplay({
  items,
  pendingRemovalIds,
  isRefreshing = false,
  isSteering = false,
  onRemoveItem,
  onSteer,
}: SteerQueueDisplayProps) {
  const [draft, setDraft] = useState("");
  const canSubmit = draft.trim().length > 0 && !isSteering;
  const submitSteer = async () => {
    if (!canSubmit) return;
    try {
      await onSteer(draft.trim());
      setDraft("");
    } catch (error) {
      console.error("Failed to steer queue:", error);
    }
  };

  return (
    <Queue className="mb-2">
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSubmit) {
              event.preventDefault();
              void submitSteer();
            }
          }}
          placeholder="Steer the active agent..."
          className="h-8 text-xs"
        />
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit}
          onClick={() => void submitSteer()}
          className="h-8"
        >
          {isSteering ? <Loader2Icon className="size-3.5 animate-spin" /> : "Steer"}
        </Button>
      </div>
      <QueueSection defaultOpen>
        <QueueSectionTrigger>
          <QueueSectionLabel
            icon={<ListOrderedIcon className="size-4" />}
            label={items.length === 1 ? "steer item" : "steer items"}
            count={items.length}
          />
        </QueueSectionTrigger>
        <QueueSectionContent>
          {items.length > 0 ? (
            <QueueList>
              {items.map((item, index) => {
                const primaryText = getPrimaryText(item, index);
                const secondaryText = getSecondaryText(item);
                const attachments = getAttachmentParts(item);
                const isRemoving = pendingRemovalIds.includes(item.id);

                return (
                  <QueueItem key={item.id}>
                    <div className="flex items-start gap-2">
                      <QueueItemIndicator className="mt-1 border-blue-500/50 bg-blue-500/20" />
                      <QueueItemContent>{primaryText}</QueueItemContent>
                      <QueueItemActions className="shrink-0">
                        <QueueItemAction
                          aria-label="Remove steer queue item"
                          disabled={isRemoving}
                          onClick={() => onRemoveItem(item.id)}
                        >
                          {isRemoving ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            <XIcon className="size-3.5" />
                          )}
                        </QueueItemAction>
                      </QueueItemActions>
                    </div>
                    {secondaryText && (
                      <QueueItemDescription>{secondaryText}</QueueItemDescription>
                    )}
                    {attachments.length > 0 && (
                      <QueueItemAttachment>
                        {attachments.map((attachment, attachmentIndex) =>
                          isImagePart(attachment) ? (
                            <QueueItemImage
                              key={`${item.id}-${attachmentIndex}-image`}
                              src={attachment.url}
                            />
                          ) : (
                            <QueueItemFile key={`${item.id}-${attachmentIndex}-file`}>
                              {attachment.filename ?? "file"}
                            </QueueItemFile>
                          )
                        )}
                      </QueueItemAttachment>
                    )}
                  </QueueItem>
                );
              })}
            </QueueList>
          ) : (
            <div className="px-3 pt-2 text-xs text-muted-foreground">No steer items queued.</div>
          )}
          {isRefreshing && (
            <div className="px-3 pt-1 text-xs text-muted-foreground">Syncing steer queue...</div>
          )}
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
});

function getPrimaryText(item: SteerQueueItem, index: number): string {
  const textPart = item.parts.find((part) => part.type === "text" && part.text?.trim());
  if (textPart?.text) return textPart.text;

  return `Steer item ${index + 1}`;
}

function getSecondaryText(item: SteerQueueItem): string | undefined {
  const chips: string[] = [];
  if (item.source) {
    chips.push(item.source === "post_finish" ? "post-finish" : "live");
  }
  if (item.status) {
    chips.push(item.status);
  }
  if (item.error) {
    chips.push(`error: ${item.error}`);
  }

  const extraText = item.parts
    .filter((part, index) => index > 0 && part.type === "text" && part.text?.trim())
    .map((part) => part.text!.trim());

  if (extraText.length > 0) {
    chips.push(extraText.join(" "));
  }

  return chips.length > 0 ? chips.join(" · ") : undefined;
}

function getAttachmentParts(item: SteerQueueItem) {
  return item.parts.filter((part) => part.url || part.filename);
}

function isImagePart(part: SteerQueueItem["parts"][number]): part is SteerQueueItem["parts"][number] & {
  url: string;
  mediaType: string;
} {
  return typeof part.url === "string" && typeof part.mediaType === "string" && part.mediaType.startsWith("image/");
}
