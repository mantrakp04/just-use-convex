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
import { useChats, useChatsList, useChat, type Chat } from "@/hooks/use-chats";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { selectedSandboxIdAtom } from "@/store/sandbox";
import { MessageSquare, ChevronDown, Loader2, Plus, Box } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTimeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  return `${Math.floor(diff / day)}d`;
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
  const currentChatId = params?.chatId as Id<"chats"> | undefined;
  const { data: currentChat } = useChat(currentChatId);

  const hasPinned = pinned && pinned.length > 0;
  const hasUnpinned = unpinned && unpinned.length > 0;
  const hasAnyChats = hasPinned || hasUnpinned;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm font-medium backdrop-blur-xs",
          "hover:bg-muted/50 transition-colors cursor-pointer"
        )}
      >
        <MessageSquare className="size-4 shrink-0" />
        <span className="truncate max-w-[140px]">{currentChat?.title ?? "Chats"}</span>
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
        "w-full flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm",
        "hover:bg-muted/70 transition-colors",
        isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <div className="font-medium truncate">{chat.title}</div>
      <div className="flex items-center gap-2 shrink-0">
        {chat.sandbox && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal gap-1 bg-background/50">
            <Box className="size-3" />
            {chat.sandbox.name}
          </Badge>
        )}
        <span className="text-xs opacity-60">{formatTimeAgo(chat.updatedAt || chat._creationTime)}</span>
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
        "w-full flex items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm -translate-x-px",
        "hover:bg-muted/70 transition-colors",
        isActive ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <div className="font-medium truncate">{chat.title}</div>
      <div className="flex items-center gap-2 shrink-0">
        {chat.sandbox && (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal gap-1 bg-background/50">
            <Box className="size-3" />
            {chat.sandbox.name}
          </Badge>
        )}
        <span className="text-xs opacity-60">{formatTimeAgo(chat.updatedAt || chat._creationTime)}</span>
      </div>
    </button>
  );
}
