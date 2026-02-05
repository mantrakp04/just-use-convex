import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvexMutation, useConvexPaginatedQuery, convexQuery } from "@convex-dev/react-query";
import { api } from "@just-use-convex/backend/convex/_generated/api";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "sonner";

type ListArgs = FunctionArgs<typeof api.chats.index.list>;
export type ChatFilters = ListArgs["filters"];
export type Chat = FunctionReturnType<typeof api.chats.index.list>["page"][number];

const INITIAL_NUM_ITEMS = 20;
const EMPTY_FILTERS: ChatFilters = {};

export function useChats() {
  const createMutation = useMutation({
    mutationFn: useConvexMutation(api.chats.index.create),
    onSuccess: () => {
      toast.success("Chat created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create chat");
    },
  });

  const updateMutation = useMutation({
    mutationFn: useConvexMutation(api.chats.index.update),
    onSuccess: () => {
      toast.success("Chat updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update chat");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: useConvexMutation(api.chats.index.deleteChat),
    onSuccess: () => {
      toast.success("Chat deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete chat");
    },
  });

  const updateTitle = useCallback(
    async (id: Id<"chats">, title: string) => {
      await updateMutation.mutateAsync({
        _id: id,
        patch: { title },
      });
    },
    [updateMutation]
  );

  const togglePin = useCallback(
    async (id: Id<"chats">, isPinned: boolean) => {
      await updateMutation.mutateAsync({
        _id: id,
        patch: { isPinned },
      });
    },
    [updateMutation]
  );

  return {
    createChat: createMutation.mutateAsync,
    updateChat: updateMutation.mutateAsync,
    deleteChat: deleteMutation.mutateAsync,
    updateTitle,
    togglePin,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

export function useChatsList(filters: ChatFilters = EMPTY_FILTERS) {
  return useConvexPaginatedQuery(
    api.chats.index.list,
    { filters },
    { initialNumItems: INITIAL_NUM_ITEMS }
  );
}

export type ChatWithDetails = FunctionReturnType<typeof api.chats.index.get>;

export function useChat(chatId: Id<"chats"> | undefined) {
  return useQuery({
    ...convexQuery(api.chats.index.get, chatId ? { _id: chatId } : "skip"),
    enabled: !!chatId,
  });
}

export type ChatStats = FunctionReturnType<typeof api.chats.index.getMemberStats>;

export function useChatStats() {
  return useQuery(convexQuery(api.chats.index.getMemberStats, {}));
}
