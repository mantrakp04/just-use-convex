import { useMutation } from "@tanstack/react-query";
import { useConvexMutation, useConvexPaginatedQuery } from "@convex-dev/react-query";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "sonner";

type ListArgs = FunctionArgs<typeof api.attachments.index.list>;
export type AttachmentFilters = Omit<ListArgs, "paginationOpts">;
export type AttachmentItem = FunctionReturnType<typeof api.attachments.index.list>["page"][number];

const INITIAL_NUM_ITEMS = 20;
const EMPTY_FILTERS: AttachmentFilters = {};

export function useAttachments() {
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
    deleteAttachment: deleteMutation.mutateAsync,
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
