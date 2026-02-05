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
  const { updateTodo, deleteTodo, createTodo, assignMember, unassignMember, isUpdating, isDeleting, isCreating } = useTodos();
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
  const [startTime, setStartTime] = useState(todo?.startTime ? new Date(todo.startTime).toTimeString().slice(0, 5) : "");
  const [endTime, setEndTime] = useState(todo?.endTime ? new Date(todo.endTime).toTimeString().slice(0, 5) : "");
  const [teamId, setTeamId] = useState<string | undefined>(todo?.teamId);
  const [assignedMemberIds, setAssignedMemberIds] = useState<string[]>([]);
  const [initialAssignedMemberIds, setInitialAssignedMemberIds] = useState<string[]>([]);

  // Find creator from members list
  const creator = useMemo(() => {
    if (!todo?.memberId) return null;
    return members.find((m) => m.id === todo.memberId) ?? null;
  }, [todo?.memberId, members]);

  // Find assigned team
  const assignedTeam = useMemo(() => {
    if (!todo?.teamId) return null;
    return teams.find((t) => t.id === todo.teamId) ?? null;
  }, [todo?.teamId, teams]);

  // Get assigned users details for display
  const assignedUsersDetails = useMemo(() => {
    return assignedMemberIds
      .map((memberId) => members.find((m) => m.id === memberId))
      .filter(Boolean) as typeof members;
  }, [assignedMemberIds, members]);

  useEffect(() => {
    if (open) {
      setTitle(todo?.title ?? "");
      setDescription(todo?.description ?? "");
      setPriority(todo?.priority ?? "medium");
      setStatus(todo?.status ?? "todo");
      setDueDate(todo?.dueDate ? new Date(todo.dueDate).toISOString().split("T")[0] : "");
      setStartTime(todo?.startTime ? new Date(todo.startTime).toTimeString().slice(0, 5) : "");
      setEndTime(todo?.endTime ? new Date(todo.endTime).toTimeString().slice(0, 5) : "");
      setTeamId(todo?.teamId);
      // Initialize assigned member IDs from fetched todo with assignees
      const memberIds = todoWithAssignees?.assignedMembers?.map((a) => a.memberId) ?? [];
      setAssignedMemberIds(memberIds);
      setInitialAssignedMemberIds(memberIds);
    }
  }, [todo, open, todoWithAssignees]);

  // Helper to convert time string (HH:MM) to timestamp using dueDate as the date
  const timeToTimestamp = (time: string): number | undefined => {
    if (!time || !dueDate) return undefined;
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date(dueDate);
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
  };

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
          startTime: timeToTimestamp(startTime),
          endTime: timeToTimestamp(endTime),
          teamId: teamId || undefined,
        },
      });
      // Assign members to the newly created todo
      for (const memberId of assignedMemberIds) {
        await assignMember({ todoId: newTodoId, memberId });
      }
    } else if (todo) {
      await updateTodo({
        _id: todo._id,
        patch: {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          status,
          dueDate: dueDate ? new Date(dueDate).getTime() : null,
          startTime: timeToTimestamp(startTime) ?? null,
          endTime: timeToTimestamp(endTime) ?? null,
          teamId: teamId || undefined,
        },
      });
      // Handle assignment changes
      const membersToAssign = assignedMemberIds.filter((id) => !initialAssignedMemberIds.includes(id));
      const membersToUnassign = initialAssignedMemberIds.filter((id) => !assignedMemberIds.includes(id));
      for (const memberId of membersToAssign) {
        await assignMember({ todoId: todo._id, memberId });
      }
      for (const memberId of membersToUnassign) {
        await unassignMember({ todoId: todo._id, memberId });
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
              startTime={startTime}
              onStartTimeChange={setStartTime}
              endTime={endTime}
              onEndTimeChange={setEndTime}
              teamId={teamId}
              onTeamIdChange={setTeamId}
              assignedMemberIds={assignedMemberIds}
              onAssignedMemberIdsChange={setAssignedMemberIds}
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
