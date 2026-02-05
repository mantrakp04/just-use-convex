import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter, X, LayoutGrid, List, Calendar } from "lucide-react";
import type {
  ViewMode,
  KanbanGroupBy,
  PriorityFilterValue,
  StatusFilterValue,
} from "./constants";
import {
  priorityFilterOptions,
  statusFilterOptions,
} from "./constants";
import type { Team, Member } from "@/hooks/auth/organization/types";

interface DashboardToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  groupBy: KanbanGroupBy;
  onGroupByChange: (groupBy: KanbanGroupBy) => void;
  filterPriority: PriorityFilterValue;
  onFilterPriorityChange: (priority: PriorityFilterValue) => void;
  filterStatus: StatusFilterValue;
  onFilterStatusChange: (status: StatusFilterValue) => void;
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
      <Tabs value={viewMode} onValueChange={(v) => onViewModeChange(v as ViewMode)}>
        <TabsList>
          <TabsTrigger value="kanban" title="Kanban view">
            <LayoutGrid className="size-3.5" />
          </TabsTrigger>
          <TabsTrigger value="list" title="List view">
            <List className="size-3.5" />
          </TabsTrigger>
          <TabsTrigger value="calendar" title="Calendar view">
            <Calendar className="size-3.5" />
          </TabsTrigger>
        </TabsList>
      </Tabs>

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
            <SelectValue placeholder="Team">
              {filterTeamId === "all"
                ? "All Teams"
                : teams.find((t) => t.id === filterTeamId)?.name || "Team"}
            </SelectValue>
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
            <SelectValue placeholder="Member">
              {filterMemberId === "all"
                ? "All Members"
                : filterMemberId === "by_me"
                  ? "Created by Me"
                  : members.find((m) => m.userId === filterMemberId)?.user.name ||
                    members.find((m) => m.userId === filterMemberId)?.user.email ||
                    "Member"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Members</SelectItem>
            <SelectItem value="by_me">Created by Me</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.userId}>
                {member.user.name || member.user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterPriority}
          onValueChange={(v) => onFilterPriorityChange(v as PriorityFilterValue)}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Priority">
              {priorityFilterOptions.find((o) => o.value === filterPriority)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {priorityFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterStatus}
          onValueChange={(v) => onFilterStatusChange(v as StatusFilterValue)}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status">
              {statusFilterOptions.find((o) => o.value === filterStatus)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {statusFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
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
