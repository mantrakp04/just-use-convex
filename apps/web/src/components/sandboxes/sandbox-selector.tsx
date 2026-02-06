import { useRef, useCallback, useState } from "react";
import { useAtom } from "jotai";
import { useSandbox, useSandboxes, useSandboxesList, type Sandbox } from "@/hooks/use-sandboxes";
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
import { Box, ChevronDown, Plus, Loader2, Info, Check, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEM_HEIGHT = 28;
const MAX_VISIBLE_ITEMS = 3;
const MAX_LIST_HEIGHT = ITEM_HEIGHT * MAX_VISIBLE_ITEMS;

export function SandboxSelector() {
  const sandboxesQuery = useSandboxesList();
  const { createSandbox, isCreating, updateSandbox, isUpdating, deleteSandbox, isDeleting } = useSandboxes();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editState, setEditState] = useState<{ mode: "create" | "edit"; sandbox?: Sandbox } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Sandbox | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedSandboxId, setSelectedSandboxId] = useAtom(selectedSandboxIdAtom);

  const selectedSandboxQuery = useSandbox(selectedSandboxId ?? undefined);
  const selectedSandbox =
    selectedSandboxQuery.data ??
    sandboxesQuery.results?.find((s: Sandbox) => s._id === selectedSandboxId);

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

  const openCreate = useCallback(() => {
    setName("");
    setDescription("");
    setEditState({ mode: "create" });
  }, []);

  const openEdit = useCallback((e: React.MouseEvent, sandbox: Sandbox) => {
    e.stopPropagation();
    setName(sandbox.name);
    setDescription(sandbox.description ?? "");
    setEditState({ mode: "edit", sandbox });
  }, []);

  const openDelete = useCallback((e: React.MouseEvent, sandbox: Sandbox) => {
    e.stopPropagation();
    setDeleteTarget(sandbox);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteSandbox({ _id: deleteTarget._id });
    if (selectedSandboxId === deleteTarget._id) {
      setSelectedSandboxId(null);
    }
    setDeleteTarget(null);
  }, [deleteSandbox, deleteTarget, selectedSandboxId, setSelectedSandboxId]);

  const handleSave = useCallback(async () => {
    if (!name.trim() || !editState) return;
    if (editState.mode === "create") {
      const sandboxId = await createSandbox({
        data: { name: name.trim(), description: description.trim() || undefined },
      });
      setSelectedSandboxId(sandboxId);
    } else if (editState.sandbox) {
      await updateSandbox({
        _id: editState.sandbox._id,
        patch: { name: name.trim(), description: description.trim() || undefined },
      });
    }
    setEditState(null);
  }, [createSandbox, updateSandbox, setSelectedSandboxId, name, description, editState]);

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
            onClick={() => {
              setSelectedSandboxId(null);
            }}
            className={cn("cursor-pointer justify-between", !selectedSandboxId && "bg-accent")}
          >
            <span className="text-muted-foreground">No Sandbox</span>
            {!selectedSandboxId && <Check className="size-4 text-primary" />}
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
                {sandboxesQuery.results.map((sandbox: Sandbox) => {
                  const isSelected = selectedSandboxId === sandbox._id;
                  return (
                    <DropdownMenuItem
                      key={sandbox._id}
                      onClick={() => {
                        setSelectedSandboxId(sandbox._id);
                      }}
                      className={cn(
                        "cursor-pointer justify-between group",
                        isSelected && "bg-accent"
                      )}
                    >
                      <span className="truncate">{sandbox.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {isSelected && <Check className="size-4 text-primary" />}
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={(e) => openEdit(e, sandbox)}
                          className="hidden group-hover:flex cursor-pointer"
                          aria-label={`Edit ${sandbox.name}`}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon-xs"
                          onClick={(e) => openDelete(e, sandbox)}
                          className="hidden group-hover:flex cursor-pointer"
                          aria-label={`Delete ${sandbox.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
                {isLoadingMore && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openCreate} className="cursor-pointer">
            <Plus className="size-4" />
            New Sandbox
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!editState} onOpenChange={(open) => !open && setEditState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editState?.mode === "edit" ? "Edit Sandbox" : "Create Sandbox"}</DialogTitle>
            <DialogDescription>
              {editState?.mode === "edit"
                ? "Update your sandbox configuration."
                : "Create a new sandbox to organize your chats."}
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
              onClick={() => setEditState(null)}
              disabled={isCreating || isUpdating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isCreating || isUpdating || !name.trim()}
            >
              {(isCreating || isUpdating) ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {editState?.mode === "edit" ? "Saving..." : "Creating..."}
                </>
              ) : (
                editState?.mode === "edit" ? "Save" : "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Sandbox</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
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
