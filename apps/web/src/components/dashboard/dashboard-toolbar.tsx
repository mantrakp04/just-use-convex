import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Filter, X, LayoutGrid, List, Calendar, Search, Info } from "lucide-react";
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
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
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
  searchQuery,
  onSearchQueryChange,
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

      {/* Search */}
      <div className="flex items-center gap-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search todos..."
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            className="w-48 pl-8 h-9"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchQueryChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Popover>
          <PopoverTrigger
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted"
          >
            <Info className="size-3.5" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 text-xs">
            <p className="font-medium text-sm mb-1.5">Search syntax</p>
            <div className="space-y-1.5 text-muted-foreground">
              <p>Type any text to search by title, description, status, priority, or assigned members.</p>
              <p className="font-medium text-foreground mt-2">Time filters</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                <code className="text-[11px] bg-muted px-1 rounded">due:today</code>
                <span>Due today</span>
                <code className="text-[11px] bg-muted px-1 rounded">due:tomorrow</code>
                <span>Due tomorrow</span>
                <code className="text-[11px] bg-muted px-1 rounded">due:2026-03-15</code>
                <span>Due on date</span>
                <code className="text-[11px] bg-muted px-1 rounded">due:2026-03-01..2026-03-31</code>
                <span>Due in range</span>
                <code className="text-[11px] bg-muted px-1 rounded">after:2026-03-01</code>
                <span>Due after date</span>
                <code className="text-[11px] bg-muted px-1 rounded">before:2026-04-01</code>
                <span>Due before date</span>
                <code className="text-[11px] bg-muted px-1 rounded">updated:today</code>
                <span>Updated today</span>
              </div>
              <p className="mt-1.5">Combine text with filters: <code className="text-[11px] bg-muted px-1 rounded">fix bug due:today</code></p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

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
