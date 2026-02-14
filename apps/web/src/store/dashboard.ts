import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type {
  ViewMode,
  KanbanGroupBy,
  PriorityFilterValue,
  StatusFilterValue,
} from "@/components/dashboard/constants";
import type { DateRange } from "@/components/dashboard/calendar-view";

export const viewModeAtom = atomWithStorage<ViewMode>("dashboard-view-mode", "kanban", undefined, {
  getOnInit: true,
});

// In-memory atoms — persist across navigation but not page refresh
export const groupByAtom = atom<KanbanGroupBy>("status");
export const filterPriorityAtom = atom<PriorityFilterValue>("all");
export const filterStatusAtom = atom<StatusFilterValue>("all");
export const filterTeamIdAtom = atom<string | "all">("all");
export const filterMemberIdAtom = atom<string | "all">("all");
export const calendarDateRangeAtom = atom<DateRange | null>(null);
