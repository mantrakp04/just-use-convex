import { useMutation } from "@tanstack/react-query";
import { useConvexMutation, useConvexPaginatedQuery } from "@convex-dev/react-query";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import type { CreateFromBytesArgs } from "@just-use-convex/backend/convex/attachments/types";
import { sanitizeAttachmentFileName, toHexHash } from "@just-use-convex/backend/convex/attachments/client";
import { z } from "zod";

type ListArgs = FunctionArgs<typeof api.attachments.index.list>;
export type AttachmentFilters = Omit<ListArgs, "paginationOpts">;
export type AttachmentItem = FunctionReturnType<typeof api.attachments.index.list>["page"][number];
type CreateFromHashResult = FunctionReturnType<typeof api.attachments.index.createFromHash>;


const INITIAL_NUM_ITEMS = 20;
const EMPTY_FILTERS: AttachmentFilters = {};

export function useAttachments() {
  const generateUploadUrlMutation = useMutation({
    mutationFn: useConvexMutation(api.attachments.index.generateUploadUrl),
  });

  const createFromHashMutation = useMutation({
    mutationFn: useConvexMutation(api.attachments.index.createFromHash),
  });

  const uploadMutation = useMutation({
    mutationKey: ["attachments", "upload"],
    mutationFn: async (
      args: z.infer<typeof CreateFromBytesArgs> & {
        onProgress?: (progress: number) => void;
        signal?: AbortSignal;
      }
    ): Promise<CreateFromHashResult> => {
      const { onProgress, signal, ...uploadArgs } = args;
      const blob = new Blob([uploadArgs.fileBytes], {
        type: uploadArgs.contentType ?? "application/octet-stream",
      });
      const safeFileName = sanitizeAttachmentFileName(uploadArgs.fileName);

      const uploadUrl = await generateUploadUrlMutation.mutateAsync({});
      const uploadResult = await uploadBlobWithProgress(
        uploadUrl,
        blob,
        uploadArgs.contentType,
        onProgress,
        signal
      );
      const hash = await toHexHash(uploadArgs.fileBytes);
      return await createFromHashMutation.mutateAsync({
        hash,
        storageId: uploadResult.storageId,
        size: uploadArgs.fileBytes.byteLength,
        fileName: safeFileName,
        contentType: uploadArgs.contentType,
      });
    },
    onSuccess: () => {
      toast.success("Attachment uploaded");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to upload attachment");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: useConvexMutation(api.attachments.index.deleteAttachment),
    onSuccess: () => {
      toast.success("Attachment deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete attachment");
    },
  });

  return {
    uploadAttachment: uploadMutation.mutateAsync,
    deleteAttachment: deleteMutation.mutateAsync,
    isUploading:
      uploadMutation.isPending ||
      generateUploadUrlMutation.isPending ||
      createFromHashMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useAttachmentsList(filters: AttachmentFilters = EMPTY_FILTERS) {
  return useConvexPaginatedQuery(
    api.attachments.index.list,
    { ...filters },
    { initialNumItems: INITIAL_NUM_ITEMS }
  );
}

async function uploadBlobWithProgress(
  uploadUrl: string,
  blob: Blob,
  contentType: string | undefined,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal
): Promise<{ storageId: string }> {
  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType ?? "application/octet-stream");

    if (onProgress) {
      onProgress(0);
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) {
        return;
      }
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(Math.min(100, Math.max(0, percent)));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        const errorBody = xhr.responseText?.trim();
        reject(new Error(errorBody ? `Upload failed (${xhr.status}): ${errorBody}` : `Upload failed (${xhr.status})`));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText || "{}") as { storageId: string });
      } catch {
        reject(new Error("Upload failed (invalid response)"));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Upload failed"));
    };

    xhr.onabort = () => {
      reject(new Error("Upload canceled"));
    };

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          xhr.abort();
        },
        { once: true }
      );
    }

    xhr.send(blob);
  });
}
