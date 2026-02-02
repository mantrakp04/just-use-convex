import type { Priority, TodoStatus } from "@/hooks/use-todos";
import type { Team } from "@/hooks/auth/organization/types";
import type { Member } from "@/hooks/auth/organization/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { TodoMemberSelect } from "./todo-member-select";

interface TodoFormProps {
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  status: TodoStatus;
  onStatusChange: (value: TodoStatus) => void;
  priority: Priority;
  onPriorityChange: (value: Priority) => void;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  startTime: string;
  onStartTimeChange: (value: string) => void;
  endTime: string;
  onEndTimeChange: (value: string) => void;
  teamId: string | undefined;
  onTeamIdChange: (value: string | undefined) => void;
  assignedMemberIds: string[];
  onAssignedMemberIdsChange: (memberIds: string[]) => void;
  teams: Team[];
  members: Member[];
}

export function TodoForm({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  status,
  onStatusChange,
  priority,
  onPriorityChange,
  dueDate,
  onDueDateChange,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  teamId,
  onTeamIdChange,
  assignedMemberIds,
  onAssignedMemberIdsChange,
  teams,
  members,
}: TodoFormProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="What needs to be done?"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Add more details..."
          className="min-h-24"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => onStatusChange(v as TodoStatus)}>
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
          <Select value={priority} onValueChange={(v) => onPriorityChange(v as Priority)}>
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
          onChange={(e) => onDueDateChange(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Time Range (optional)</Label>
          {(startTime || endTime) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto py-0 px-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                onStartTimeChange("");
                onEndTimeChange("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            id="startTime"
            type="time"
            value={startTime}
            onChange={(e) => onStartTimeChange(e.target.value)}
          />
          <Input
            id="endTime"
            type="time"
            value={endTime}
            onChange={(e) => onEndTimeChange(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Team</Label>
        <Select
          value={teamId ?? "none"}
          onValueChange={(v) => onTeamIdChange(!v || v === "none" ? undefined : v)}
        >
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
        <TodoMemberSelect
          members={members}
          selectedMemberIds={assignedMemberIds}
          onSelectionChange={onAssignedMemberIdsChange}
        />
      </div>
    </>
  );
}
