import { useState, useEffect, useMemo } from "react";
import { useTodos, type Priority, type TodoStatus, type Todo } from "@/hooks/use-todos";
import { useTeams } from "@/hooks/auth/organization/use-teams";
import { useMembers } from "@/hooks/auth/organization/use-members";
import { getInitials } from "@/hooks/auth/organization/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Calendar, Clock, Circle, CircleDot, CheckCircle2, Pencil, User, Users } from "lucide-react";

interface TodoDialogProps {
  todo: Todo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "view" | "edit" | "create";
  onModeChange?: (mode: "view" | "edit" | "create") => void;
}

const priorityColors = {
  low: "secondary",
  medium: "outline",
  high: "destructive",
} as const satisfies Record<Priority, "secondary" | "outline" | "destructive">;

const statusLabels = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
} as const satisfies Record<TodoStatus, string>;

const statusIcons = {
  todo: Circle,
  in_progress: CircleDot,
  done: CheckCircle2,
} as const satisfies Record<TodoStatus, typeof Circle>;

export function TodoDialog({ todo, open, onOpenChange, mode, onModeChange }: TodoDialogProps) {
  const { updateTodo, deleteTodo, createTodo, isUpdating, isDeleting, isCreating } = useTodos();
  const { teams } = useTeams();
  const { members } = useMembers();

  const isEditing = mode === "edit" || mode === "create";
  const [title, setTitle] = useState(todo?.title ?? "");
  const [description, setDescription] = useState(todo?.description ?? "");
  const [priority, setPriority] = useState<Priority>(todo?.priority ?? "medium");
  const [status, setStatus] = useState<TodoStatus>(todo?.status ?? "todo");
  const [dueDate, setDueDate] = useState(todo?.dueDate ? new Date(todo.dueDate).toISOString().split("T")[0] : "");
  const [teamId, setTeamId] = useState<string | undefined>(todo?.teamId);
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);

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

  useEffect(() => {
    if (open) {
      setTitle(todo?.title ?? "");
      setDescription(todo?.description ?? "");
      setPriority(todo?.priority ?? "medium");
      setStatus(todo?.status ?? "todo");
      setDueDate(todo?.dueDate ? new Date(todo.dueDate).toISOString().split("T")[0] : "");
      setTeamId(todo?.teamId);
      setAssignedUserIds([]);
    }
  }, [todo, open]);

  const handleSave = async () => {
    if (!title.trim()) return;

    if (mode === "create") {
      await createTodo({
        data: {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          status,
          dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
          teamId: teamId || undefined,
        },
      });
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

  const currentStatus = todo?.status ?? "todo";
  const currentPriority = todo?.priority ?? "medium";
  const StatusIcon = statusIcons[currentStatus];

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
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to be done?"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add more details..."
                  className="min-h-24"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as TodoStatus)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Team</Label>
                <Select value={teamId ?? "none"} onValueChange={(v) => setTeamId(!v || v === "none" ? undefined : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Team</SelectItem>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Assign Members</Label>
                <Select
                  value={assignedUserIds[0] ?? "none"}
                  onValueChange={(v) => setAssignedUserIds(!v || v === "none" ? [] : [v])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.userId}>
                        <div className="flex items-center gap-2">
                          <Avatar size="sm">
                            <AvatarImage src={member.user.image ?? undefined} />
                            <AvatarFallback>{getInitials(member.user.name)}</AvatarFallback>
                          </Avatar>
                          {member.user.name || member.user.email}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            todo && (
              <>
                <div className="flex items-start gap-3">
                  <StatusIcon
                    className={`size-5 mt-0.5 ${
                      currentStatus === "done"
                        ? "text-green-500"
                        : currentStatus === "in_progress"
                          ? "text-blue-500"
                          : "text-muted-foreground"
                    }`}
                  />
                  <div className="flex-1">
                    <h3
                      className={`font-medium ${
                        currentStatus === "done" ? "line-through text-muted-foreground" : ""
                      }`}
                    >
                      {todo.title}
                    </h3>
                  </div>
                </div>

                <div className="flex gap-2 pl-8">
                  <Badge variant="outline">{statusLabels[currentStatus]}</Badge>
                  <Badge variant={priorityColors[currentPriority]}>{currentPriority}</Badge>
                </div>

                {todo.description && (
                  <div className="pl-8">
                    <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                      {todo.description}
                    </p>
                  </div>
                )}

                {/* Created by */}
                {creator && (
                  <div className="flex items-center gap-2 pl-8">
                    <User className="size-3 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">Created by:</span>
                    <Avatar size="sm">
                      <AvatarImage src={creator.user.image ?? undefined} />
                      <AvatarFallback>{getInitials(creator.user.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm">{creator.user.name || creator.user.email}</span>
                  </div>
                )}

                {/* Team */}
                {assignedTeam && (
                  <div className="flex items-center gap-2 pl-8">
                    <Users className="size-3 text-muted-foreground" />
                    <span className="text-muted-foreground text-xs">Team:</span>
                    <Badge variant="outline">{assignedTeam.name}</Badge>
                  </div>
                )}

                <div className="flex flex-wrap gap-3 text-muted-foreground text-xs pl-8">
                  {todo.dueDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      Due: {new Date(todo.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    Updated: {formatDate(todo.updatedAt)}
                  </span>
                </div>
              </>
            )
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {mode !== "create" && todo && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
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
              onClick={handleSave}
              disabled={isUpdating || isCreating || !title.trim()}
            >
              {mode === "create" ? "Create" : "Save"}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onModeChange?.("edit")}
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
              <Button size="sm" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
