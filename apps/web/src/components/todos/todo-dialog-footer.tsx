import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Trash2, Pencil } from "lucide-react";

interface TodoDialogFooterProps {
  mode: "view" | "edit" | "create";
  onSave: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onClose: () => void;
  isUpdating: boolean;
  isDeleting: boolean;
  isCreating: boolean;
  isSaveDisabled: boolean;
}

export function TodoDialogFooter({
  mode,
  onSave,
  onDelete,
  onEdit,
  onClose,
  isUpdating,
  isDeleting,
  isCreating,
  isSaveDisabled,
}: TodoDialogFooterProps) {
  const isEditing = mode === "edit" || mode === "create";

  return (
    <DialogFooter className="gap-2 sm:gap-0">
      {mode !== "create" && (
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={isDeleting}
          className="mr-auto"
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      )}

      {isEditing ? (
        <Button
          size="sm"
          onClick={onSave}
          disabled={isUpdating || isCreating || isSaveDisabled}
        >
          {mode === "create" ? "Create" : "Save"}
        </Button>
      ) : (
        <>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      )}
    </DialogFooter>
  );
}
