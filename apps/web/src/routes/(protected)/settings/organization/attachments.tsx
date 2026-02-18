import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import { DownloadIcon, Trash2Icon } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";

import { useAttachments, useAttachmentsList, type AttachmentItem } from "@/hooks/use-attachments";
import { useActiveMember, useMembers, ROLE_HIERARCHY } from "@/hooks/auth/organization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/(protected)/settings/organization/attachments")({
  component: AttachmentsSettings,
});

const PAGE_SIZE = 20;
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

function AttachmentRow({
  attachment,
  onDelete,
  isDeleting,
}: {
  attachment: AttachmentItem;
  onDelete: (id: AttachmentItem["_id"]) => void;
  isDeleting: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{attachment.fileName}</span>
        <div className="text-muted-foreground text-xs flex flex-wrap gap-2">
          <span>{attachment.contentType ?? "Unknown type"}</span>
          <span>•</span>
          <span>{formatBytes(attachment.size)}</span>
          <span>•</span>
          <span>{format(new Date(attachment.updatedAt), "MMM d, yyyy")}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!attachment.url}
          onClick={() => {
            if (!attachment.url) return;
            window.open(attachment.url, "_blank", "noopener,noreferrer");
          }}
        >
          <DownloadIcon className="size-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" disabled={isDeleting} />}>
            <Trash2Icon className="size-3.5" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete attachment</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the attachment from the organization. The underlying file is deleted only when no
                members reference it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(attachment._id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function AttachmentsSettings() {
  const { members, isPending: membersPending } = useMembers();
  const { currentUserRole } = useActiveMember();
  const [memberId, setMemberId] = useState<string>("me");
  const { uploadAttachment, deleteAttachment, isUploading, isDeleting } = useAttachments();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isAdmin = useMemo(() => {
    if (!currentUserRole) return false;
    const level = ROLE_HIERARCHY[currentUserRole] ?? 0;
    return level >= ROLE_HIERARCHY.admin;
  }, [currentUserRole]);

  const listMemberId = isAdmin && memberId !== "me" ? memberId : undefined;
  const attachmentsQuery = useAttachmentsList({ memberId: listMemberId });

  const hasResults = attachmentsQuery.results.length > 0;
  const isLoading = attachmentsQuery.status === "LoadingFirstPage";

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = input.files;
    if (!files || files.length === 0) {
      return;
    }

    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_UPLOAD_SIZE_BYTES) {
          continue;
        }
        const buffer = await file.arrayBuffer();
        await uploadAttachment({
          fileBytes: new Uint8Array(buffer),
          fileName: file.name,
          contentType: file.type || undefined,
        });
      }
    } finally {
      if (input.isConnected) {
        input.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Attachments</CardTitle>
            <CardDescription>Review and delete stored attachments for your organization.</CardDescription>
          </div>
          <div className="flex items-center gap-2" suppressHydrationWarning>
            {isAdmin && (
              <Select
                value={memberId}
                onValueChange={(value) => value && setMemberId(value)}
                disabled={membersPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select member">
                    {memberId === "me"
                      ? "My attachments"
                      : members.find((member) => member.id === memberId)?.user.name ||
                        members.find((member) => member.id === memberId)?.user.email ||
                        "Member"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">My attachments</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={handleUpload}
            />
            <Button
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : !hasResults ? (
            <p className="text-muted-foreground text-sm">No attachments found.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {attachmentsQuery.results.map((attachment) => (
                <AttachmentRow
                  key={attachment._id}
                  attachment={attachment}
                  onDelete={(id) => deleteAttachment({ _id: id })}
                  isDeleting={isDeleting}
                />
              ))}
            </div>
          )}
          {attachmentsQuery.status === "CanLoadMore" && (
            <div className="pt-4">
              <Button variant="secondary" onClick={() => attachmentsQuery.loadMore(PAGE_SIZE)}>
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
