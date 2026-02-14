import { useState, useMemo, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useTodos, useTodosList, useOrgStats, type Todo, type TodoFilters } from "@/hooks/use-todos";
import { useTeams } from "@/hooks/auth/organization/use-teams";
import { useMembers } from "@/hooks/auth/organization/use-members";
import { useUser } from "@/hooks/auth/user/use-user";
import { TodoDialog } from "@/components/todos/todo-dialog";
import {
  DashboardHeader,
  DashboardToolbar,
  KanbanBoard,
  TodoListView,
  CalendarView,
  KanbanSkeleton,
  ListSkeleton,
  CalendarSkeleton,
} from "@/components/dashboard";
import {
  viewModeAtom,
  groupByAtom,
  filterPriorityAtom,
  filterStatusAtom,
  filterTeamIdAtom,
  filterMemberIdAtom,
  calendarDateRangeAtom,
} from "@/store/dashboard";

export const Route = createFileRoute("/(protected)/dashboard")({
  component: RouteComponent,
  gcTime: Infinity,
  staleTime: Infinity,
});

function RouteComponent() {
  const { updateStatus, updatePriority } = useTodos();
  const { teams } = useTeams();
  const { members } = useMembers();
  const { user } = useUser();
  const orgStats = useOrgStats();

  const [viewMode, setViewMode] = useAtom(viewModeAtom);
  const [groupBy, setGroupBy] = useAtom(groupByAtom);
  const [filterPriority, setFilterPriority] = useAtom(filterPriorityAtom);
  const [filterStatus, setFilterStatus] = useAtom(filterStatusAtom);
  const [filterTeamId, setFilterTeamId] = useAtom(filterTeamIdAtom);
  const [filterMemberId, setFilterMemberId] = useAtom(filterMemberIdAtom);
  const [calendarDateRange, setCalendarDateRange] = useAtom(calendarDateRangeAtom);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit" | "create">("view");

  const filters = useMemo<TodoFilters>(() => {
    const f: TodoFilters = {};
    if (filterPriority !== "all") f.priority = filterPriority;
    if (filterStatus !== "all") f.status = filterStatus;
    if (filterTeamId !== "all") f.teamId = filterTeamId;
    if (filterMemberId === "by_me") {
      // Find current user's member record to get their memberId
      const currentMember = members.find((m) => m.userId === user?.id);
      if (currentMember) {
        f.memberId = currentMember.id;
      }
    } else if (filterMemberId !== "all") {
      f.assignedMemberId = filterMemberId;
    }
    // Apply date range filter when in calendar mode
    if (viewMode === "calendar" && calendarDateRange) {
      f.dueDateFrom = calendarDateRange.from;
      f.dueDateTo = calendarDateRange.to;
    }
    return f;
  }, [filterPriority, filterStatus, filterTeamId, filterMemberId, user?.id, members, viewMode, calendarDateRange]);

  const todosQuery = useTodosList(filters);
  const { results: todos, status } = todosQuery;

  const hasLoadedOnce = useRef(false);
  if (todos.length > 0 || status !== "LoadingFirstPage") {
    hasLoadedOnce.current = true;
  }

  const isInitialLoading = status === "LoadingFirstPage" && !hasLoadedOnce.current;

  const openTodoDialog = useCallback((todo: Todo, mode: "view" | "edit" = "view") => {
    setSelectedTodo(todo);
    setDialogMode(mode);
    setDialogOpen(true);
  }, []);

  const openCreateDialog = useCallback(() => {
    setSelectedTodo(null);
    setDialogMode("create");
    setDialogOpen(true);
  }, []);

  const clearFilters = useCallback(() => {
    setFilterPriority("all");
    setFilterStatus("all");
    setFilterTeamId("all");
    setFilterMemberId("all");
  }, []);

  if (isInitialLoading) {
    return (
      <div className="flex flex-col gap-4 p-2 h-full mx-auto w-4xl">
        <DashboardHeader stats={undefined} onCreateClick={() => {}} />
        <DashboardToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          filterPriority={filterPriority}
          onFilterPriorityChange={setFilterPriority}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
          filterTeamId={filterTeamId}
          onFilterTeamIdChange={setFilterTeamId}
          filterMemberId={filterMemberId}
          onFilterMemberIdChange={setFilterMemberId}
          teams={teams}
          members={members}
          onClearFilters={clearFilters}
        />
        {viewMode === "kanban" && <KanbanSkeleton />}
        {viewMode === "list" && <ListSkeleton />}
        {viewMode === "calendar" && <CalendarSkeleton />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-2 h-full mx-auto w-4xl">
      <DashboardHeader stats={orgStats.data} onCreateClick={openCreateDialog} />

      <DashboardToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        filterPriority={filterPriority}
        onFilterPriorityChange={setFilterPriority}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        filterTeamId={filterTeamId}
        onFilterTeamIdChange={setFilterTeamId}
        filterMemberId={filterMemberId}
        onFilterMemberIdChange={setFilterMemberId}
        teams={teams}
        members={members}
        onClearFilters={clearFilters}
      />

      {viewMode === "kanban" && (
        <KanbanBoard
          todos={todos}
          groupBy={groupBy}
          onOpenTodo={openTodoDialog}
          onStatusChange={updateStatus}
          onPriorityChange={updatePriority}
          loadMore={todosQuery.loadMore}
          status={todosQuery.status}
        />
      )}
      {viewMode === "list" && (
        <TodoListView
          todos={todos}
          loadMore={todosQuery.loadMore}
          status={todosQuery.status}
          onOpenTodo={openTodoDialog}
          onStatusChange={updateStatus}
        />
      )}
      {viewMode === "calendar" && (
        <CalendarView
          todos={todos}
          onOpenTodo={openTodoDialog}
          onStatusChange={updateStatus}
          onDateRangeChange={setCalendarDateRange}
        />
      )}

      <TodoDialog
        todo={selectedTodo}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        onModeChange={setDialogMode}
      />
    </div>
  );
}
