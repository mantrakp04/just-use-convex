import { useState, useEffect, useMemo } from "react";
import { useTodos, useTodo, type Priority, type TodoStatus, type Todo } from "@/hooks/use-todos";
import { useTeams } from "@/hooks/auth/organization/use-teams";
import { useMembers } from "@/hooks/auth/organization/use-members";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { TodoForm } from "./todo-form";
import { TodoView } from "./todo-view";
import { TodoDialogFooter } from "./todo-dialog-footer";

interface TodoDialogProps {
  todo: Todo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "view" | "edit" | "create";
  onModeChange?: (mode: "view" | "edit" | "create") => void;
}

export function TodoDialog({ todo, open, onOpenChange, mode, onModeChange }: TodoDialogProps) {
  const { updateTodo, deleteTodo, createTodo, assignUser, unassignUser, isUpdating, isDeleting, isCreating } = useTodos();
  const { teams } = useTeams();
  const { members } = useMembers();

  // Fetch todo with assigned users for edit mode
  const { data: todoWithAssignees } = useTodo(mode !== "create" && open ? todo?._id : undefined);

  const isEditing = mode === "edit" || mode === "create";
  const [title, setTitle] = useState(todo?.title ?? "");
  const [description, setDescription] = useState(todo?.description ?? "");
  const [priority, setPriority] = useState<Priority>(todo?.priority ?? "medium");
  const [status, setStatus] = useState<TodoStatus>(todo?.status ?? "todo");
  const [dueDate, setDueDate] = useState(todo?.dueDate ? new Date(todo.dueDate).toISOString().split("T")[0] : "");
  const [teamId, setTeamId] = useState<string | undefined>(todo?.teamId);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [initialAssignedUserIds, setInitialAssignedUserIds] = useState<string[]>([]);

  // Find creator from members list
  const creator = useMemo(() => {
    if (!todo?.userId) return null;
    return members.find((m) => m.userId === todo.userId) ?? null;
  }, [todo?.userId, members]);

  // Find assigned team
  const assignedTeam = useMemo(() => {
    if (!todo?.teamId) return null;
    return teams.find((t) => t.id === todo.teamId) ?? null;
  }, [todo?.teamId, teams]);

  // Get assigned users details for display
  const assignedUsersDetails = useMemo(() => {
    return assignedUserIds
      .map((userId) => members.find((m) => m.userId === userId))
      .filter(Boolean) as typeof members;
  }, [assignedUserIds, members]);

  useEffect(() => {
    if (open) {
      setTitle(todo?.title ?? "");
      setDescription(todo?.description ?? "");
      setPriority(todo?.priority ?? "medium");
      setStatus(todo?.status ?? "todo");
      setDueDate(todo?.dueDate ? new Date(todo.dueDate).toISOString().split("T")[0] : "");
      setTeamId(todo?.teamId);
      // Initialize assigned user IDs from fetched todo with assignees
      const userIds = todoWithAssignees?.assignedUsers?.map((a) => a.userId) ?? [];
      setAssignedUserIds(userIds);
      setInitialAssignedUserIds(userIds);
    }
  }, [todo, open, todoWithAssignees]);

  const handleSave = async () => {
    if (!title.trim()) return;

    if (mode === "create") {
      const newTodoId = await createTodo({
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          status,
          dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
          teamId: teamId || undefined,
        },
      });
      // Assign users to the newly created todo
      for (const userId of assignedUserIds) {
        await assignUser({ todoId: newTodoId, userId });
      }
    } else if (todo) {
      await updateTodo({
        _id: todo._id,
        patch: {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          status,
          dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
          teamId: teamId || undefined,
        },
      });
      // Handle assignment changes
      const usersToAssign = assignedUserIds.filter((id) => !initialAssignedUserIds.includes(id));
      const usersToUnassign = initialAssignedUserIds.filter((id) => !assignedUserIds.includes(id));
      for (const userId of usersToAssign) {
        await assignUser({ todoId: todo._id, userId });
      }
      for (const userId of usersToUnassign) {
        await unassignUser({ todoId: todo._id, userId });
      }
    }
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!todo) return;
    await deleteTodo({ _id: todo._id });
    onOpenChange(false);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create Todo" : isEditing ? "Edit Todo" : "Todo Details"}
          </DialogTitle>
          {!isEditing && todo && (
            <DialogDescription>
              Created {formatDate(todo._creationTime)}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {isEditing ? (
            <TodoForm
              title={title}
              onTitleChange={setTitle}
              description={description}
              onDescriptionChange={setDescription}
              status={status}
              onStatusChange={setStatus}
              priority={priority}
              onPriorityChange={setPriority}
              dueDate={dueDate}
              onDueDateChange={setDueDate}
              teamId={teamId}
              onTeamIdChange={setTeamId}
              assignedUserIds={assignedUserIds}
              onAssignedUserIdsChange={setAssignedUserIds}
              teams={teams}
              members={members}
            />
          ) : (
            todo && (
              <TodoView
                todo={todo}
                creator={creator}
                assignedTeam={assignedTeam}
                assignedUsersDetails={assignedUsersDetails}
                formatDate={formatDate}
              />
            )
          )}
        </div>

        {(isEditing || todo) && (
          <TodoDialogFooter
            mode={mode}
            onSave={handleSave}
            onDelete={handleDelete}
            onEdit={() => onModeChange?.("edit")}
            onClose={() => onOpenChange(false)}
            isUpdating={isUpdating}
            isDeleting={isDeleting}
            isCreating={isCreating}
            isSaveDisabled={!title.trim()}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
