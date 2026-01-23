import { useState, useMemo, useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTodos, useTodosList, useOrgStats, type Priority, type TodoStatus, type Todo, type TodoFilters } from "@/hooks/use-todos";
import { useTeams } from "@/hooks/auth/organization/use-teams";
import { useMembers } from "@/hooks/auth/organization/use-members";
import { useUser } from "@/hooks/auth/user/use-user";
import { TodoDialog } from "@/components/todos/todo-dialog";
import { Loader2 } from "lucide-react";
import {
  DashboardHeader,
  DashboardToolbar,
  KanbanBoard,
  TodoListView,
  CalendarView,
  type ViewMode,
  type KanbanGroupBy,
} from "@/components/dashboard";

export const Route = createFileRoute("/(protected)/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { updateStatus, updatePriority } = useTodos();
  const { teams } = useTeams();
  const { members } = useMembers();
  const { user } = useUser();
  const orgStats = useOrgStats();

  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [groupBy, setGroupBy] = useState<KanbanGroupBy>("status");
  const [filterPriority, setFilterPriority] = useState<Priority | "all">("all");
  const [filterStatus, setFilterStatus] = useState<TodoStatus | "all">("all");
  const [filterTeamId, setFilterTeamId] = useState<string | "all">("all");
  const [filterMemberId, setFilterMemberId] = useState<string | "all">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [dialogMode, setDialogMode] = useState<"view" | "edit" | "create">("view");

  const filters = useMemo<TodoFilters>(() => {
    const f: TodoFilters = {};
    if (filterPriority !== "all") f.priority = filterPriority;
    if (filterStatus !== "all") f.status = filterStatus;
    if (filterTeamId !== "all") f.teamId = filterTeamId;
    if (filterMemberId === "by_me" && user?.id) {
      f.userId = user.id;
    } else if (filterMemberId !== "all") {
      f.assignedUserId = filterMemberId;
    }
    return f;
  }, [filterPriority, filterStatus, filterTeamId, filterMemberId, user?.id]);

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
      <div className="flex items-center justify-center h-full">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-2 h-full">
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
