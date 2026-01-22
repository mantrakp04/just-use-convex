import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, X, LayoutGrid, List } from "lucide-react";
import type { Priority, TodoStatus } from "@/hooks/use-todos";
import type { ViewMode, KanbanGroupBy } from "./constants";
import type { Team } from "@/hooks/auth/organization/types";
import type { Member } from "@/hooks/auth/organization/types";

interface DashboardToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  groupBy: KanbanGroupBy;
  onGroupByChange: (groupBy: KanbanGroupBy) => void;
  filterPriority: Priority | "all";
  onFilterPriorityChange: (priority: Priority | "all") => void;
  filterStatus: TodoStatus | "all";
  onFilterStatusChange: (status: TodoStatus | "all") => void;
  filterTeamId: string | "all";
  onFilterTeamIdChange: (teamId: string | "all") => void;
  filterMemberId: string | "all";
  onFilterMemberIdChange: (memberId: string | "all") => void;
  teams: Team[];
  members: Member[];
  onClearFilters: () => void;
}

export function DashboardToolbar({
  viewMode,
  onViewModeChange,
  groupBy,
  onGroupByChange,
  filterPriority,
  onFilterPriorityChange,
  filterStatus,
  onFilterStatusChange,
  filterTeamId,
  onFilterTeamIdChange,
  filterMemberId,
  onFilterMemberIdChange,
  teams,
  members,
  onClearFilters,
}: DashboardToolbarProps) {
  const hasActiveFilters = filterPriority !== "all" || filterStatus !== "all" || filterTeamId !== "all" || filterMemberId !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-4">
      {/* View Mode Toggle */}
      <div className="flex items-center gap-1 border rounded-md p-0.5">
        <Button
          variant={viewMode === "kanban" ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => onViewModeChange("kanban")}
        >
          <LayoutGrid className="size-3.5" />
        </Button>
        <Button
          variant={viewMode === "list" ? "secondary" : "ghost"}
          size="icon-sm"
          onClick={() => onViewModeChange("list")}
        >
          <List className="size-3.5" />
        </Button>
      </div>

      {/* Kanban Group By */}
      {viewMode === "kanban" && (
        <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as KanbanGroupBy)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="status">By Status</SelectItem>
            <SelectItem value="priority">By Priority</SelectItem>
          </SelectContent>
        </Select>
      )}

      <div className="flex-1" />

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="size-3.5 text-muted-foreground" />

        <Select
          value={filterTeamId}
          onValueChange={(v) => onFilterTeamIdChange(v ?? "all")}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterMemberId}
          onValueChange={(v) => onFilterMemberIdChange(v ?? "all")}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Member" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Members</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.userId}>
                {member.user.name || member.user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterPriority}
          onValueChange={(v) => onFilterPriorityChange(v as Priority | "all")}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filterStatus}
          onValueChange={(v) => onFilterStatusChange(v as TodoStatus | "all")}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onClearFilters}>
            <X className="size-3.5" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
