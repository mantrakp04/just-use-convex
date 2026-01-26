import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useChats, useChatsList, useChatStats, type Chat } from "@/hooks/use-chats";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { VirtualList } from "@/components/ui/virtual-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageSquare, Plus, MoreVertical, Trash2, Pencil, Pin } from "lucide-react";

export const Route = createFileRoute("/(protected)/chats/")({
  component: ChatsListPage,
});

function ChatCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-32" />
      </CardHeader>
    </Card>
  );
}

function ChatsListPage() {
  const navigate = useNavigate();
  const { createChat, deleteChat, togglePin, isCreating, isDeleting } = useChats();
  const pinnedChatsQuery = useChatsList({ isPinned: true });
  const unpinnedChatsQuery = useChatsList({ isPinned: false });
  const { data: stats } = useChatStats();

  const handleCreateChat = useCallback(async () => {
    const chat = await createChat({ data: { title: "New Chat" } });
    navigate({ to: "/chats/$chatId", params: { chatId: chat } });
  }, [createChat, navigate]);

  const handleDeleteChat = useCallback(
    async (chatId: Chat["_id"]) => {
      await deleteChat({ _id: chatId });
    },
    [deleteChat]
  );

  const handleTogglePin = useCallback(
    async (chatId: Chat["_id"], currentPinState: boolean) => {
      await togglePin(chatId, !currentPinState);
    },
    [togglePin]
  );

  const handleOpenChat = useCallback(
    (chatId: Chat["_id"]) => {
      navigate({ to: "/chats/$chatId", params: { chatId } });
    },
    [navigate]
  );

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp));
  };

  const total = stats?.total ?? 0;

  const renderChatItem = useCallback(
    (chat: Chat) => (
      <Card
        className="cursor-pointer hover:bg-muted/50 transition-colors p-0"
        onClick={() => handleOpenChat(chat._id)}
      >
        <CardHeader className="flex flex-row items-center justify-between p-2 border-border border">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-muted flex items-center justify-center">
              {chat.isPinned ? (
                <Pin className="size-4 text-primary" />
              ) : (
                <MessageSquare className="size-4" />
              )}
            </div>
            <div>
              <CardTitle>{chat.title}</CardTitle>
              <CardDescription>
                {chat.updatedAt
                  ? `Last message ${formatDate(chat.updatedAt)}`
                  : `Created ${formatDate(chat._creationTime)}`}
              </CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="inline-flex items-center justify-center size-8 rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <MoreVertical className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  handleTogglePin(chat._id, chat.isPinned);
                }}
              >
                <Pin className="size-4" />
                {chat.isPinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  handleDeleteChat(chat._id);
                }}
                disabled={isDeleting}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
      </Card>
    ),
    [handleOpenChat, handleDeleteChat, handleTogglePin, isDeleting, formatDate]
  );

  const hasPinnedChats = pinnedChatsQuery.results && pinnedChatsQuery.results.length > 0;
  const hasUnpinnedChats = unpinnedChatsQuery.results && unpinnedChatsQuery.results.length > 0;
  const hasAnyChats = hasPinnedChats || hasUnpinnedChats;

  return (
    <div className="flex flex-col gap-4 p-2 w-4xl mx-auto h-full">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold">Chats</h1>
          <p className="text-muted-foreground text-sm" suppressHydrationWarning>
            {total} {total === 1 ? "conversation" : "conversations"}
          </p>
        </div>
        <Button onClick={handleCreateChat} disabled={isCreating}>
          <Plus className="size-4 mr-2" />
          New Chat
        </Button>
      </div>

      {!pinnedChatsQuery.isLoading && !unpinnedChatsQuery.isLoading && !hasAnyChats && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia>
              <MessageSquare className="size-12 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No chats yet</EmptyTitle>
            <EmptyDescription>
              Start a new conversation with the AI assistant.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={handleCreateChat} disabled={isCreating}>
            <Plus className="size-4 mr-2" />
            Start your first chat
          </Button>
        </Empty>
      )}

      {pinnedChatsQuery.isLoading && unpinnedChatsQuery.isLoading && (
        <div className="flex flex-col gap-3">
          <ChatCardSkeleton />
          <ChatCardSkeleton />
          <ChatCardSkeleton />
        </div>
      )}

      <div className="flex flex-col gap-6">
        {hasPinnedChats && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted-foreground px-1">Pinned</h2>
            <VirtualList
              query={pinnedChatsQuery}
              renderItem={renderChatItem}
              estimateSize={72}
              gap={8}
              getItemKey={(_: number, chat: Chat) => chat._id}
            />
          </div>
        )}

        {hasUnpinnedChats && (
          <div className="flex flex-col gap-2">
            {hasPinnedChats && (
              <h2 className="text-sm font-medium text-muted-foreground px-1">All Chats</h2>
            )}
            <VirtualList
              query={unpinnedChatsQuery}
              renderItem={renderChatItem}
              estimateSize={72}
              gap={8}
              getItemKey={(_: number, chat: Chat) => chat._id}
            />
          </div>
        )}
      </div>
    </div>
  );
}
