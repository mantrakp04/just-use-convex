import { useCallback, useRef } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useChats, useChatsList, type Chat } from "@/hooks/use-chats";
import { Badge } from "@/components/ui/badge";
import { selectedSandboxIdAtom } from "@/store/sandbox";
import { MessageSquare, Pin, ChevronDown, Loader2, Box, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

const LOAD_MORE_COUNT = 20;

export function HeaderChatsDropdown() {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const { createChat, isCreating } = useChats();
  const selectedSandboxId = useAtomValue(selectedSandboxIdAtom);

  // Same queries as /chats page — React Query dedupes
  const pinnedChatsQuery = useChatsList({ isPinned: true });
  const unpinnedChatsQuery = useChatsList({ isPinned: false });

  const handleNewChat = useCallback(async () => {
    const chatId = await createChat({ data: { title: "New Chat", sandboxId: selectedSandboxId ?? undefined } });
    navigate({ to: "/chats/$chatId", params: { chatId } });
  }, [createChat, navigate, selectedSandboxId]);

  const pinned = pinnedChatsQuery.results;
  const unpinned = unpinnedChatsQuery.results;

  const isLoading =
    pinnedChatsQuery.status === "LoadingFirstPage" ||
    unpinnedChatsQuery.status === "LoadingFirstPage";
  const canLoadMoreUnpinned = unpinnedChatsQuery.status === "CanLoadMore";
  const isLoadingMoreUnpinned = unpinnedChatsQuery.status === "LoadingMore";
  const canLoadMorePinned = pinnedChatsQuery.status === "CanLoadMore";
  const isLoadingMorePinned = pinnedChatsQuery.status === "LoadingMore";

  const handleLoadMore = useCallback(() => {
    if (canLoadMoreUnpinned && !isLoadingMoreUnpinned) {
      unpinnedChatsQuery.loadMore(LOAD_MORE_COUNT);
    } else if (canLoadMorePinned && !isLoadingMorePinned) {
      pinnedChatsQuery.loadMore(LOAD_MORE_COUNT);
    }
  }, [
    canLoadMoreUnpinned,
    isLoadingMoreUnpinned,
    canLoadMorePinned,
    isLoadingMorePinned,
    unpinnedChatsQuery,
    pinnedChatsQuery,
  ]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (!nearBottom) return;

    handleLoadMore();
  }, [handleLoadMore]);

  const handleSelectChat = useCallback(
    (chatId: Chat["_id"]) => {
      navigate({ to: "/chats/$chatId", params: { chatId } });
    },
    [navigate]
  );

  const params = useParams({ strict: false });
  const currentChatId = params?.chatId;

  const hasPinned = pinned && pinned.length > 0;
  const hasUnpinned = unpinned && unpinned.length > 0;
  const hasAnyChats = hasPinned || hasUnpinned;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm font-medium backdrop-blur-xs",
          "hover:bg-muted/50 transition-colors cursor-pointer"
        )}
      >
        <MessageSquare className="size-4 shrink-0" />
        <span className="truncate max-w-[140px]">Chats</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-72 p-0" sideOffset={8}>
        <div className="border-b border-border p-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2"
            onClick={handleNewChat}
            disabled={isCreating}
          >
            <Plus className="size-4" />
            New Chat
          </Button>
        </div>
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-[min(60vh,320px)] overflow-y-auto overscroll-contain"
        >
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && !hasAnyChats && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No chats yet
            </div>
          )}

          {!isLoading && hasAnyChats && (
            <div className="py-1">
              {hasPinned && (
                <Collapsible defaultOpen className="group/pinned">
                  <div className="px-2 py-1">
                    <CollapsibleTrigger
                      className={cn(
                        "group/trigger flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium text-muted-foreground",
                        "hover:bg-muted/50 transition-colors"
                      )}
                    >
                      <ChevronDown className="size-4 shrink-0 -rotate-90 transition-transform duration-200 ease-out group-data-[panel-open]/trigger:rotate-0" />
                      Pinned
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <ul className="border-border mt-0.5 ml-3.5 border-l px-2.5 py-0.5 flex flex-col gap-0.5">
                        {pinned.map((chat) => (
                          <li key={chat._id}>
                            <ChatSubItem
                              chat={chat}
                              isActive={chat._id === currentChatId}
                              onSelect={() => handleSelectChat(chat._id)}
                            />
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )}

              {hasUnpinned && (
                <div className="px-2 py-1">
                  {hasPinned && (
                    <div className="text-xs font-medium text-muted-foreground mb-1 px-2">
                      All Chats
                    </div>
                  )}
                  <ul className="flex flex-col gap-0.5">
                    {unpinned.map((chat) => (
                      <li key={chat._id}>
                        <ChatItem
                          chat={chat}
                          isActive={chat._id === currentChatId}
                          onSelect={() => handleSelectChat(chat._id)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(isLoadingMoreUnpinned || isLoadingMorePinned) && (
                <div className="flex justify-center py-2">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChatItem({
  chat,
  isActive,
  onSelect,
}: {
  chat: Chat;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm",
        "hover:bg-muted/70 transition-colors",
        isActive && "bg-muted"
      )}
    >
      <div className="size-8 shrink-0 rounded-md bg-muted flex items-center justify-center">
        {chat.isPinned ? (
          <Pin className="size-4 text-primary" />
        ) : (
          <MessageSquare className="size-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{chat.title}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {chat.updatedAt
              ? `Last message ${formatDate(chat.updatedAt)}`
              : `Created ${formatDate(chat._creationTime)}`}
          </span>
          {chat.sandbox && (
            <Badge variant="outline" className="shrink-0">
              <Box className="size-3" />
              {chat.sandbox.name}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

function ChatSubItem({
  chat,
  isActive,
  onSelect,
}: {
  chat: Chat;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs -translate-x-px",
        "hover:bg-muted/70 transition-colors",
        isActive && "bg-muted"
      )}
    >
      <div className="size-6 shrink-0 rounded bg-muted flex items-center justify-center">
        <Pin className="size-3 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{chat.title}</div>
        <div className="text-muted-foreground truncate">
          {chat.updatedAt
            ? formatDate(chat.updatedAt)
            : formatDate(chat._creationTime)}
        </div>
      </div>
    </button>
  );
}
