import { useState, useMemo, useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  startOfDay,
  endOfDay,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Todo, TodoStatus } from "@/hooks/use-todos";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import {
  priorityColors,
  statusIcons,
  type CalendarViewMode,
} from "./constants";
import { cn } from "@/lib/utils";

export interface DateRange {
  from: number;
  to: number;
}

interface CalendarViewProps {
  todos: Todo[];
  onOpenTodo: (todo: Todo, mode?: "view" | "edit") => void;
  onStatusChange: (id: Id<"todos">, status: TodoStatus) => void;
  onDateRangeChange?: (range: DateRange) => void;
}

export function CalendarView({
  todos,
  onOpenTodo,
  onStatusChange,
  onDateRangeChange,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState<CalendarViewMode>("month");

  // Calculate and emit date range whenever currentDate or calendarView changes
  useEffect(() => {
    if (!onDateRangeChange) return;

    let rangeStart: Date;
    let rangeEnd: Date;

    if (calendarView === "month") {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      // Include full weeks that overlap with the month
      rangeStart = startOfWeek(monthStart, { weekStartsOn: 0 });
      rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    } else if (calendarView === "week") {
      rangeStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      rangeEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
    } else {
      rangeStart = startOfDay(currentDate);
      rangeEnd = endOfDay(currentDate);
    }

    onDateRangeChange({
      from: rangeStart.getTime(),
      to: rangeEnd.getTime(),
    });
  }, [currentDate, calendarView, onDateRangeChange]);

  const navigate = (direction: "prev" | "next") => {
    if (calendarView === "month") {
      setCurrentDate(
        direction === "next"
          ? addMonths(currentDate, 1)
          : subMonths(currentDate, 1)
      );
    } else if (calendarView === "week") {
      setCurrentDate(
        direction === "next"
          ? addWeeks(currentDate, 1)
          : subWeeks(currentDate, 1)
      );
    } else {
      setCurrentDate(
        direction === "next"
          ? addDays(currentDate, 1)
          : subDays(currentDate, 1)
      );
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const getTitle = () => {
    if (calendarView === "month") {
      return format(currentDate, "MMMM yyyy");
    } else if (calendarView === "week") {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${format(weekStart, "MMM d")} - ${format(weekEnd, "d, yyyy")}`;
      }
      return `${format(weekStart, "MMM d")} - ${format(weekEnd, "MMM d, yyyy")}`;
    }
    return format(currentDate, "EEEE, MMMM d, yyyy");
  };

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate("prev")}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate("next")}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <h2 className="text-lg font-semibold">{getTitle()}</h2>
        </div>

        <Tabs
          value={calendarView}
          onValueChange={(v) => setCalendarView(v as CalendarViewMode)}
        >
          <TabsList>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="day">Day</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Calendar Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {calendarView === "month" && (
          <MonthView
            currentDate={currentDate}
            todos={todos}
            onOpenTodo={onOpenTodo}
            onDateClick={(date) => {
              setCurrentDate(date);
              setCalendarView("day");
            }}
          />
        )}
        {calendarView === "week" && (
          <WeekView
            currentDate={currentDate}
            todos={todos}
            onOpenTodo={onOpenTodo}
            onDateClick={(date) => {
              setCurrentDate(date);
              setCalendarView("day");
            }}
          />
        )}
        {calendarView === "day" && (
          <DayView
            currentDate={currentDate}
            todos={todos}
            onOpenTodo={onOpenTodo}
            onStatusChange={onStatusChange}
          />
        )}
      </div>
    </div>
  );
}

interface MonthViewProps {
  currentDate: Date;
  todos: Todo[];
  onOpenTodo: (todo: Todo, mode?: "view" | "edit") => void;
  onDateClick: (date: Date) => void;
}

function MonthView({
  currentDate,
  todos,
  onOpenTodo,
  onDateClick,
}: MonthViewProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const todosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    todos.forEach((todo) => {
      if (todo.dueDate) {
        const dateKey = format(new Date(todo.dueDate), "yyyy-MM-dd");
        const existing = map.get(dateKey) || [];
        map.set(dateKey, [...existing, todo]);
      }
    });
    return map;
  }, [todos]);

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b shrink-0">
        {weekdays.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-sm font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="grid grid-cols-7 auto-rows-fr">
          {days.map((day) => {
            const dateKey = format(day, "yyyy-MM-dd");
            const dayTodos = todosByDate.get(dateKey) || [];
            const isCurrentMonth = isSameMonth(day, currentDate);

            return (
              <Button
                nativeButton={false}
                render={<div />}
                variant="ghost"
                size="sm"
                key={dateKey}
                className={cn(
                  "border-b border-r p-1 min-h-24 cursor-pointer hover:bg-muted/50 transition-colors",
                  !isCurrentMonth && "bg-muted/20"
                )}
                onClick={() => onDateClick(day)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full",
                      isToday(day) && "bg-primary text-primary-foreground",
                      !isCurrentMonth && "text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayTodos.length > 3 && (
                    <span className="text-xs text-muted-foreground">
                      +{dayTodos.length - 3}
                    </span>
                  )}
                </div>
                <div className="space-y-0.5 overflow-hidden">
                  {dayTodos.slice(0, 3).map((todo) => (
                    <CalendarTodoItem
                      key={todo._id}
                      todo={todo}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTodo(todo);
                      }}
                      compact
                    />
                  ))}
                </div>
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

interface WeekViewProps {
  currentDate: Date;
  todos: Todo[];
  onOpenTodo: (todo: Todo, mode?: "view" | "edit") => void;
  onDateClick: (date: Date) => void;
}

function WeekView({
  currentDate,
  todos,
  onOpenTodo,
  onDateClick,
}: WeekViewProps) {
  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate]);

  const todosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    todos.forEach((todo) => {
      if (todo.dueDate) {
        const dateKey = format(new Date(todo.dueDate), "yyyy-MM-dd");
        const existing = map.get(dateKey) || [];
        map.set(dateKey, [...existing, todo]);
      }
    });
    return map;
  }, [todos]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Day Headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b shrink-0">
        <div className="py-2" />
        {days.map((day) => (
          <Button
            nativeButton={false}
            render={<div />}
            variant="ghost"
            size="sm"
            key={format(day, "yyyy-MM-dd")}
            className={cn(
              "py-2 text-center border-l cursor-pointer hover:bg-muted/50 transition-colors",
              isToday(day) && "bg-primary/5"
            )}
            onClick={() => onDateClick(day)}
          >
            <div className="text-sm text-muted-foreground">
              {format(day, "EEE")}
            </div>
            <div
              className={cn(
                "text-lg font-semibold w-10 h-10 mx-auto flex items-center justify-center rounded-full",
                isToday(day) && "bg-primary text-primary-foreground"
              )}
            >
              {format(day, "d")}
            </div>
          </Button>
        ))}
      </div>

      {/* All-day Events */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b shrink-0">
        <div className="py-2 text-xs text-muted-foreground text-right pr-2">
          All day
        </div>
        {days.map((day) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayTodos = todosByDate.get(dateKey) || [];
          return (
            <ScrollArea
              key={dateKey}
              className="border-l p-1 min-h-12 max-h-24"
            >
              <div className="space-y-0.5">
                {dayTodos.map((todo) => (
                  <CalendarTodoItem
                    key={todo._id}
                    todo={todo}
                    onClick={() => onOpenTodo(todo)}
                    compact
                  />
                ))}
              </div>
            </ScrollArea>
          );
        })}
      </div>

      {/* Time Grid */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
          {hours.map((hour) => (
            <div key={hour} className="contents">
              <div className="h-12 text-xs text-muted-foreground text-right pr-2 -mt-2">
                {hour === 0 ? "" : format(new Date().setHours(hour, 0), "h a")}
              </div>
              {days.map((day) => (
                <div
                  key={`${format(day, "yyyy-MM-dd")}-${hour}`}
                  className="h-12 border-l border-t hover:bg-muted/30 transition-colors"
                />
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface DayViewProps {
  currentDate: Date;
  todos: Todo[];
  onOpenTodo: (todo: Todo, mode?: "view" | "edit") => void;
  onStatusChange: (id: Id<"todos">, status: TodoStatus) => void;
}

function DayView({
  currentDate,
  todos,
  onOpenTodo,
  onStatusChange,
}: DayViewProps) {
  const dayTodos = useMemo(() => {
    return todos.filter((todo) => {
      if (!todo.dueDate) return false;
      return isSameDay(new Date(todo.dueDate), currentDate);
    });
  }, [todos, currentDate]);

  // Separate all-day and timed todos
  const { allDayTodos, timedTodos } = useMemo(() => {
    const allDay: Todo[] = [];
    const timed: Todo[] = [];
    dayTodos.forEach((todo) => {
      if (todo.startTime && todo.endTime) {
        timed.push(todo);
      } else {
        allDay.push(todo);
      }
    });
    return { allDayTodos: allDay, timedTodos: timed };
  }, [dayTodos]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const hourHeight = 56; // 14 * 4 = 56px (h-14)

  // Calculate position and height for a timed todo
  const getTodoPosition = (todo: Todo) => {
    if (!todo.startTime || !todo.endTime) return null;
    const startDate = new Date(todo.startTime);
    const endDate = new Date(todo.endTime);
    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
    const top = (startMinutes / 60) * hourHeight;
    const height = Math.max(((endMinutes - startMinutes) / 60) * hourHeight, 24);
    return { top, height };
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* All-day Events */}
      <div className="flex border-b shrink-0 max-h-48">
        <div className="w-16 py-2 text-xs text-muted-foreground text-right pr-2 shrink-0">
          All day
        </div>
        <ScrollArea className="flex-1 min-h-16 border-l">
          <div className="p-2 space-y-1">
            {allDayTodos.length > 0 ? (
              allDayTodos.map((todo) => (
                <CalendarTodoItem
                  key={todo._id}
                  todo={todo}
                  onClick={() => onOpenTodo(todo)}
                  onStatusChange={onStatusChange}
                />
              ))
            ) : (
              <div className="text-sm text-muted-foreground py-2">
                No all-day tasks
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Time Grid */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col relative">
          {/* Hour grid lines */}
          {hours.map((hour) => (
            <div key={hour} className="flex h-14">
              <div className="w-16 text-xs text-muted-foreground text-right pr-2 -mt-2 shrink-0">
                {hour === 0 ? "" : format(new Date().setHours(hour, 0), "h a")}
              </div>
              <div className="flex-1 border-t border-l hover:bg-muted/30 transition-colors" />
            </div>
          ))}
          {/* Timed todos overlay */}
          <div className="absolute left-16 right-0 top-0 bottom-0 pointer-events-none">
            {timedTodos.map((todo) => {
              const pos = getTodoPosition(todo);
              if (!pos) return null;
              const startDate = new Date(todo.startTime!);
              const endDate = new Date(todo.endTime!);
              return (
                <div
                  key={todo._id}
                  className="absolute left-1 right-1 pointer-events-auto"
                  style={{ top: pos.top, height: pos.height }}
                >
                  <CalendarTodoItem
                    todo={todo}
                    onClick={() => onOpenTodo(todo)}
                    onStatusChange={onStatusChange}
                    timeLabel={`${format(startDate, "h:mm a")} - ${format(endDate, "h:mm a")}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

interface CalendarTodoItemProps {
  todo: Todo;
  onClick: (e: React.MouseEvent) => void;
  onStatusChange?: (id: Id<"todos">, status: TodoStatus) => void;
  compact?: boolean;
  timeLabel?: string;
}

function CalendarTodoItem({
  todo,
  onClick,
  onStatusChange,
  compact,
  timeLabel,
}: CalendarTodoItemProps) {
  const status = todo.status ?? "todo";
  const priority = todo.priority ?? "medium";
  const StatusIcon = statusIcons[status];

  const priorityBgColors = {
    high: "bg-destructive/10 border-destructive/30 hover:bg-destructive/20",
    medium: "bg-muted border-border hover:bg-muted/80",
    low: "bg-primary/10 border-primary/30 hover:bg-primary/20",
  };

  if (compact) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClick}
        className={cn(
          "w-full text-left text-xs px-1.5 py-0.5 rounded border truncate transition-colors",
          priorityBgColors[priority],
          status === "done" && "line-through opacity-60"
        )}
      >
        {todo.title}
      </Button>
    );
  }

  return (
    <Button
      nativeButton={false}
      render={<div />}
      variant="ghost"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors",
        priorityBgColors[priority]
      )}
    >
      {onStatusChange && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation();
            const nextStatus =
              status === "todo"
                ? "in_progress"
                : status === "in_progress"
                  ? "done"
                  : "todo";
            onStatusChange(todo._id, nextStatus);
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <StatusIcon
            className={cn(
              "size-4",
              status === "done" && "text-primary",
              status === "in_progress" && "text-[var(--color-chart-2)]"
            )}
          />
        </Button>
      )}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "font-medium text-sm truncate",
            status === "done" && "line-through text-muted-foreground"
          )}
        >
          {todo.title}
        </p>
        {timeLabel && (
          <p className="text-muted-foreground text-xs">
            {timeLabel}
          </p>
        )}
        {todo.description && !timeLabel && (
          <p className="text-muted-foreground text-xs truncate">
            {todo.description}
          </p>
        )}
      </div>
      <Badge variant={priorityColors[priority]} className="text-[10px] shrink-0">
        {priority}
      </Badge>
    </Button>
  );
}
