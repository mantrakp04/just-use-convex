import { useMemo, useReducer } from "react";
import {
  useTodos,
  useTodo,
  type Priority,
  type TodoStatus,
  type Todo,
  type TodoWithAssignees,
} from "@/hooks/use-todos";
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
  | {
      type: "set";
      field: keyof TodoDialogFormState;
      value: TodoDialogFormState[keyof TodoDialogFormState];
    }
  | { type: "replace"; state: TodoDialogFormState };

const getAssignedMemberIds = (
  todoWithAssignees?: TodoWithAssignees
): string[] =>
  todoWithAssignees?.assignedMembers?.map((member) => member.memberId) ?? [];

const getTodoDialogInitialState = (
  todo: Todo | null,
  mode: TodoDialogProps["mode"],
  todoWithAssignees: TodoWithAssignees | undefined
): TodoDialogFormState => {
  const assignedMemberIds = mode === "create" ? [] : getAssignedMemberIds(todoWithAssignees);

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
};

const todoDialogFormReducer = (
  state: TodoDialogFormState,
  action: TodoDialogFormAction
): TodoDialogFormState => {
  if (action.type === "replace") {
    return action.state;
  }

  return {
    ...state,
    [action.field]: action.value,
  } as TodoDialogFormState;
};

type TodoDialogBodyProps = Omit<TodoDialogProps, "open"> & {
  todoWithAssignees: TodoWithAssignees | undefined;
  teams: ReturnType<typeof useTeams>["teams"];
  members: ReturnType<typeof useMembers>["members"];
  updateTodo: ReturnType<typeof useTodos>["updateTodo"];
  deleteTodo: ReturnType<typeof useTodos>["deleteTodo"];
  createTodo: ReturnType<typeof useTodos>["createTodo"];
  assignMember: ReturnType<typeof useTodos>["assignMember"];
  unassignMember: ReturnType<typeof useTodos>["unassignMember"];
  isUpdating: boolean;
  isDeleting: boolean;
  isCreating: boolean;
};

function TodoDialogBody({
  todo,
  mode,
  onModeChange,
  onOpenChange,
  todoWithAssignees,
  teams,
  members,
  updateTodo,
  deleteTodo,
  createTodo,
  assignMember,
  unassignMember,
  isUpdating,
  isDeleting,
  isCreating,
}: Omit<TodoDialogBodyProps, "open">) {
  const isEditing = mode === "edit" || mode === "create";

  const [formState, dispatch] = useReducer(
    todoDialogFormReducer,
    getTodoDialogInitialState(todo, mode, todoWithAssignees)
  );

  const setField = <K extends keyof TodoDialogFormState>(
    field: K,
    value: TodoDialogFormState[K]
  ) => {
    dispatch({ type: "set", field, value });
  };

  const creator = useMemo(() => {
    if (!todo?.memberId) return null;
    return members.find((member) => member.id === todo.memberId) ?? null;
  }, [todo?.memberId, members]);

  const assignedTeam = useMemo(() => {
    if (!todo?.teamId) return null;
    return teams.find((team) => team.id === todo.teamId) ?? null;
  }, [todo?.teamId, teams]);

  const assignedUsersDetails = useMemo(() => {
    return formState.assignedMemberIds
      .map((memberId) => members.find((member) => member.id === memberId))
      .filter(Boolean) as typeof members;
  }, [formState.assignedMemberIds, members]);

  const timeToTimestamp = (time: string): number | undefined => {
    if (!time || !formState.dueDate) return undefined;
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date(formState.dueDate);
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
  };

  const handleSave = async () => {
    if (!formState.title.trim()) return;

    if (mode === "create") {
      const newTodoId = await createTodo({
        data: {
          title: formState.title.trim(),
          description: formState.description.trim() || undefined,
          priority: formState.priority,
          status: formState.status,
          dueDate: formState.dueDate ? new Date(formState.dueDate).getTime() : undefined,
          startTime: timeToTimestamp(formState.startTime),
          endTime: timeToTimestamp(formState.endTime),
          teamId: formState.teamId || undefined,
        },
      });

      for (const memberId of formState.assignedMemberIds) {
        await assignMember({ todoId: newTodoId, memberId });
      }
    } else if (todo) {
      await updateTodo({
        _id: todo._id,
        patch: {
          title: formState.title.trim(),
          description: formState.description.trim() || undefined,
          priority: formState.priority,
          status: formState.status,
          dueDate: formState.dueDate ? new Date(formState.dueDate).getTime() : null,
          startTime: timeToTimestamp(formState.startTime) ?? null,
          endTime: timeToTimestamp(formState.endTime) ?? null,
          teamId: formState.teamId || undefined,
        },
      });

      const membersToAssign = formState.assignedMemberIds.filter(
        (id) => !formState.initialAssignedMemberIds.includes(id)
      );
      const membersToUnassign = formState.initialAssignedMemberIds.filter(
        (id) => !formState.assignedMemberIds.includes(id)
      );

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
    <>
      <DialogHeader>
        <DialogTitle>
          {mode === "create"
            ? "Create Todo"
            : isEditing
              ? "Edit Todo"
              : "Todo Details"}
        </DialogTitle>
        {!isEditing && todo && (
          <DialogDescription>Created {formatDate(todo._creationTime)}</DialogDescription>
        )}
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        {isEditing ? (
          <TodoForm
            title={formState.title}
            onTitleChange={(value) => setField("title", value)}
            description={formState.description}
            onDescriptionChange={(value) => setField("description", value)}
            status={formState.status}
            onStatusChange={(value) => setField("status", value)}
            priority={formState.priority}
            onPriorityChange={(value) => setField("priority", value)}
            dueDate={formState.dueDate}
            onDueDateChange={(value) => setField("dueDate", value)}
            startTime={formState.startTime}
            onStartTimeChange={(value) => setField("startTime", value)}
            endTime={formState.endTime}
            onEndTimeChange={(value) => setField("endTime", value)}
            teamId={formState.teamId}
            onTeamIdChange={(value) => setField("teamId", value)}
            assignedMemberIds={formState.assignedMemberIds}
            onAssignedMemberIdsChange={(value) =>
              setField("assignedMemberIds", value)
            }
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
          isSaveDisabled={!formState.title.trim()}
        />
      )}
    </>
  );
}

export function TodoDialog({
  todo,
  open,
  onOpenChange,
  mode,
  onModeChange,
}: TodoDialogProps) {
  const {
    updateTodo,
    deleteTodo,
    createTodo,
    assignMember,
    unassignMember,
    isUpdating,
    isDeleting,
    isCreating,
  } = useTodos();
  const { teams } = useTeams();
  const { members } = useMembers();

  const { data: todoWithAssignees } = useTodo(mode !== "create" && open ? todo?._id : undefined);

  const dialogBodyKey = useMemo(() => {
    const todoKey = todo?._id ?? "new";
    const assigneesState = todoWithAssignees ? "loaded" : "loading";
    const assigneesCount = todoWithAssignees?.assignedMembers?.length ?? 0;

    return `${mode}-${open ? "open" : "closed"}-${todoKey}-${assigneesState}-${assigneesCount}`;
  }, [mode, open, todo?._id, todoWithAssignees?.assignedMembers?.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <TodoDialogBody
          key={dialogBodyKey}
          todo={todo}
          onOpenChange={onOpenChange}
          mode={mode}
          onModeChange={onModeChange}
          todoWithAssignees={todoWithAssignees}
          teams={teams}
          members={members}
          updateTodo={updateTodo}
          deleteTodo={deleteTodo}
          createTodo={createTodo}
          assignMember={assignMember}
          unassignMember={unassignMember}
          isUpdating={isUpdating}
          isDeleting={isDeleting}
          isCreating={isCreating}
        />
      </DialogContent>
    </Dialog>
  );
}
