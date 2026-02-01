import { useRef, useCallback, useState } from "react";
import { useAtom } from "jotai";
import { useSandboxes, useSandboxesList, type Sandbox } from "@/hooks/use-sandboxes";
import { selectedSandboxIdAtom } from "@/store/sandbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Box, ChevronDown, Plus, Loader2, Info, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEM_HEIGHT = 28;
const MAX_VISIBLE_ITEMS = 3;
const MAX_LIST_HEIGHT = ITEM_HEIGHT * MAX_VISIBLE_ITEMS;

export function SandboxSelector() {
  const sandboxesQuery = useSandboxesList();
  const { createSandbox, isCreating, deleteSandbox, isDeleting } = useSandboxes();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sandboxToDelete, setSandboxToDelete] = useState<Sandbox | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSandboxId, setSelectedSandboxId] = useAtom(selectedSandboxIdAtom);

  const selectedSandbox = sandboxesQuery.results?.find(
    (s: Sandbox) => s._id === selectedSandboxId
  );

  const canLoadMore = sandboxesQuery.status === "CanLoadMore";
  const isLoadingMore = sandboxesQuery.status === "LoadingMore";

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !canLoadMore || isLoadingMore) return;

    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    if (nearBottom) {
      sandboxesQuery.loadMore(20);
    }
  }, [canLoadMore, isLoadingMore, sandboxesQuery]);

  const handleOpenDialog = useCallback(() => {
    setName("");
    setDescription("");
    setIsDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((e: React.MouseEvent, sandbox: Sandbox) => {
    e.stopPropagation();
    setSandboxToDelete(sandbox);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!sandboxToDelete) return;
    await deleteSandbox({ _id: sandboxToDelete._id });
    if (selectedSandboxId === sandboxToDelete._id) {
      setSelectedSandboxId(null);
    }
    setIsDeleteDialogOpen(false);
    setSandboxToDelete(null);
  }, [deleteSandbox, sandboxToDelete, selectedSandboxId, setSelectedSandboxId]);

  const handleCreateSandbox = useCallback(async () => {
    if (!name.trim()) return;
    const sandboxId = await createSandbox({
      data: {
        name: name.trim(),
        description: description.trim() || undefined,
      },
    });
    setIsDialogOpen(false);
    setSelectedSandboxId(sandboxId);
  }, [createSandbox, setSelectedSandboxId, name, description]);

  const hasSandboxes =
    sandboxesQuery.results && sandboxesQuery.results.length > 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" className="gap-2" />}>
          <Box className="size-4" />
          <span className="truncate max-w-32">
            {selectedSandbox?.name ?? "No Sandbox"}
          </span>
          <ChevronDown className="size-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => setSelectedSandboxId(null)}
            className={cn("cursor-pointer justify-between", !selectedSandboxId && "bg-accent")}
          >
            No Sandbox
            {!selectedSandboxId && <Check className="size-4" />}
          </DropdownMenuItem>

          {hasSandboxes && (
            <>
              <DropdownMenuSeparator />
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="overflow-y-auto"
                style={{ maxHeight: MAX_LIST_HEIGHT }}
              >
                {sandboxesQuery.results.map((sandbox: Sandbox) => (
                  <DropdownMenuItem
                    key={sandbox._id}
                    onClick={() => setSelectedSandboxId(sandbox._id)}
                    className={cn(
                      "cursor-pointer justify-between group",
                      selectedSandboxId === sandbox._id && "bg-accent"
                    )}
                  >
                    <span className="truncate">{sandbox.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {selectedSandboxId === sandbox._id && <Check className="size-4" />}
                      <button
                        type="button"
                        onClick={(e) => handleDeleteClick(e, sandbox)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-destructive/20 rounded transition-opacity"
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </button>
                    </div>
                  </DropdownMenuItem>
                ))}
                {isLoadingMore && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleOpenDialog} className="cursor-pointer">
            <Plus className="size-4" />
            New Sandbox
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Sandbox</DialogTitle>
            <DialogDescription>
              Create a new sandbox to organize your chats.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="sandbox-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="sandbox-name"
                placeholder="My Sandbox"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="sandbox-description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="sandbox-description"
                placeholder="Describe what this sandbox is for..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 text-muted-foreground">
              <Info className="size-4 mt-0.5 shrink-0" />
              <p className="text-xs">
                The sandbox name and description will be included in the AI's context for all chats within this sandbox.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSandbox}
              disabled={isCreating || !name.trim()}
            >
              {isCreating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Sandbox"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sandbox</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{sandboxToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { selectedSandboxIdAtom };
