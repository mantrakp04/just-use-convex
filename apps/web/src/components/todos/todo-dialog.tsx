import { useEffect, useMemo, useReducer } from "react";
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
  const fetchedAssignedMemberIds = useMemo(
    () => todoWithAssignees?.assignedMembers?.map((a) => a.memberId) ?? [],
    [todoWithAssignees?.assignedMembers]
  );

  const isEditing = mode === "edit" || mode === "create";
  const [formState, dispatch] = useReducer(
    todoDialogFormReducer,
    createTodoDialogFormState(todo, fetchedAssignedMemberIds)
  );
  const {
    title,
    description,
    priority,
    status,
    dueDate,
    startTime,
    endTime,
    teamId,
    assignedMemberIds,
    initialAssignedMemberIds,
  } = formState;

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
    if (!open) {
      return;
    }

    dispatch({
      type: "reset",
      state: createTodoDialogFormState(todo, fetchedAssignedMemberIds),
    });
  }, [open, todo]);

  useEffect(() => {
    if (!open || mode === "create") {
      return;
    }

    dispatch({ type: "hydrateAssignedMembers", memberIds: fetchedAssignedMemberIds });
  }, [fetchedAssignedMemberIds, mode, open]);

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

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      dispatch({
        type: "reset",
        state: createTodoDialogFormState(todo, fetchedAssignedMemberIds),
      });
    }
    onOpenChange(nextOpen);
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
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
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
              onTitleChange={(value) => dispatch({ type: "setTitle", value })}
              description={description}
              onDescriptionChange={(value) => dispatch({ type: "setDescription", value })}
              status={status}
              onStatusChange={(value) => dispatch({ type: "setStatus", value })}
              priority={priority}
              onPriorityChange={(value) => dispatch({ type: "setPriority", value })}
              dueDate={dueDate}
              onDueDateChange={(value) => dispatch({ type: "setDueDate", value })}
              startTime={startTime}
              onStartTimeChange={(value) => dispatch({ type: "setStartTime", value })}
              endTime={endTime}
              onEndTimeChange={(value) => dispatch({ type: "setEndTime", value })}
              teamId={teamId}
              onTeamIdChange={(value) => dispatch({ type: "setTeamId", value })}
              assignedMemberIds={assignedMemberIds}
              onAssignedMemberIdsChange={(value) => dispatch({ type: "setAssignedMemberIds", value })}
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

type TodoDialogFormState = {
  title: string;
  description: string;
  priority: Priority;
  status: TodoStatus;
  dueDate: string;
  startTime: string;
  endTime: string;
  teamId: string | undefined;
  assignedMemberIds: string[];
  initialAssignedMemberIds: string[];
};

type TodoDialogFormAction =
  | { type: "reset"; state: TodoDialogFormState }
  | { type: "setTitle"; value: string }
  | { type: "setDescription"; value: string }
  | { type: "setPriority"; value: Priority }
  | { type: "setStatus"; value: TodoStatus }
  | { type: "setDueDate"; value: string }
  | { type: "setStartTime"; value: string }
  | { type: "setEndTime"; value: string }
  | { type: "setTeamId"; value: string | undefined }
  | { type: "setAssignedMemberIds"; value: string[] }
  | { type: "hydrateAssignedMembers"; memberIds: string[] };

function todoDialogFormReducer(state: TodoDialogFormState, action: TodoDialogFormAction): TodoDialogFormState {
  switch (action.type) {
    case "reset":
      return action.state;
    case "setTitle":
      return { ...state, title: action.value };
    case "setDescription":
      return { ...state, description: action.value };
    case "setPriority":
      return { ...state, priority: action.value };
    case "setStatus":
      return { ...state, status: action.value };
    case "setDueDate":
      return { ...state, dueDate: action.value };
    case "setStartTime":
      return { ...state, startTime: action.value };
    case "setEndTime":
      return { ...state, endTime: action.value };
    case "setTeamId":
      return { ...state, teamId: action.value };
    case "setAssignedMemberIds":
      return { ...state, assignedMemberIds: action.value };
    case "hydrateAssignedMembers":
      return {
        ...state,
        assignedMemberIds: action.memberIds,
        initialAssignedMemberIds: action.memberIds,
      };
    default:
      return state;
  }
}

function createTodoDialogFormState(todo: Todo | null, assignedMemberIds: string[]): TodoDialogFormState {
  return {
    title: todo?.title ?? "",
    description: todo?.description ?? "",
    priority: todo?.priority ?? "medium",
    status: todo?.status ?? "todo",
    dueDate: todo?.dueDate ? new Date(todo.dueDate).toISOString().split("T")[0] : "",
    startTime: todo?.startTime ? new Date(todo.startTime).toTimeString().slice(0, 5) : "",
    endTime: todo?.endTime ? new Date(todo.endTime).toTimeString().slice(0, 5) : "",
    teamId: todo?.teamId,
    assignedMemberIds,
    initialAssignedMemberIds: assignedMemberIds,
  };
}
