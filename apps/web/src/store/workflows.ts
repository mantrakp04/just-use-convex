import { atom } from "jotai";
import type { Id } from "@just-use-convex/backend/convex/_generated/dataModel";
import type { AllowedAction, EventType, TriggerType } from "@just-use-convex/backend/convex/workflows/types";

export type { AllowedAction, EventType, TriggerType };

export type ScheduleMode = "every" | "at" | "cron";

export type IntervalUnit = "minutes" | "hours" | "days";

export const ALL_ACTIONS: { value: AllowedAction; label: string; description: string }[] = [
  { value: "send_message", label: "Send Message", description: "Send a workflow output message" },
  { value: "http_request", label: "HTTP Request", description: "Make an external HTTP request" },
  { value: "notify", label: "Notify", description: "Send a notification" },
];

export const ALL_EVENTS: { value: EventType; label: string }[] = [
  { value: "on_chat_create", label: "Chat Created" },
  { value: "on_chat_delete", label: "Chat Deleted" },
  { value: "on_sandbox_provision", label: "Sandbox Provisioned" },
  { value: "on_sandbox_delete", label: "Sandbox Deleted" },
  { value: "on_todo_create", label: "Todo Created" },
  { value: "on_todo_complete", label: "Todo Completed" },
];

/**
 * Converts "Every X units, starting from HH:MM" to a cron expression.
 * - minutes: startMin-59/N startHour * * *   (or *\/N if no start)
 * - hours:   startMin startHour-23/N * * *   (or 0 *\/N if no start)
 * - days:    startMin startHour *\/N * *      (or 0 0 *\/N if no start)
 */
export function intervalToCron(amount: number, unit: IntervalUnit, startFrom?: string): string {
  const [startHour, startMin] = startFrom ? startFrom.split(":").map(Number) : [0, 0];
  const h = startHour ?? 0;
  const m = startMin ?? 0;

  switch (unit) {
    case "minutes": {
      if (!startFrom) return `*/${amount} * * * *`;
      if (60 % amount === 0) return `${m}-59/${amount} * * * *`;
      return `*/${amount} * * * *`;
    }
    case "hours":
      return startFrom ? `${m} ${h}-23/${amount} * * *` : `0 */${amount} * * *`;
    case "days":
      return startFrom ? `${m} ${h} */${amount} * *` : `0 0 */${amount} * *`;
  }
}

/**
 * Converts cron expression to human-readable string.
 * Handles patterns from intervalToCron/timeToCron; falls back to raw for custom cron.
 */
export function cronToHumanReadable(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;

  const [min, hour, dom, month, dow] = parts;

  // 0 * * * * — every hour (at minute 0)
  if (min === "0" && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return "Every hour";
  }

  // */N * * * * — every N minutes
  const minMatch = min.match(/^\*\/(\d+)$/);
  if (minMatch && hour === "*") {
    const n = Number(minMatch[1]);
    return n === 1 ? "Every minute" : `Every ${n} min`;
  }

  // 0 */N * * * — every N hours
  const hourMatch = hour.match(/^\*\/(\d+)$/);
  if (min === "0" && hourMatch) {
    const n = Number(hourMatch[1]);
    return n === 1 ? "Every hour" : `Every ${n} hr`;
  }

  // 0 0 */N * * — every N days
  const domMatch = dom.match(/^\*\/(\d+)$/);
  if (min === "0" && hour === "0" && domMatch) {
    const n = Number(domMatch[1]);
    return n === 1 ? "Daily" : `Every ${n} days`;
  }

  // M-H/N H * * * — every N minutes starting at H:M
  const minRangeMatch = min.match(/^(\d+)-59\/(\d+)$/);
  if (minRangeMatch) {
    const startMin = minRangeMatch[1];
    const n = minRangeMatch[2];
    if (hour === "*") {
      return `Every ${n} min at :${startMin.padStart(2, "0")}`;
    }
    const h = hour.padStart(2, "0");
    return `Every ${n} min from ${h}:${startMin}`;
  }

  // M H-N * * * — every N hours starting at H:M
  const hourRangeMatch = hour.match(/^(\d+)-23\/(\d+)$/);
  if (min !== "*" && hourRangeMatch) {
    const m = min.padStart(2, "0");
    const startH = hourRangeMatch[1];
    const n = hourRangeMatch[2];
    return `Every ${n} hr from ${startH}:${m}`;
  }

  // MM HH * * * — daily at HH:MM (dom/month/dow are *)
  if (dom === "*" && month === "*" && dow === "*" && min !== "*" && hour !== "*" && !min.includes("/") && !hour.includes("/")) {
    const m = min.padStart(2, "0");
    const hh = Number(hour);
    const ampm = hh >= 12 ? "PM" : "AM";
    const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
    return `Daily at ${h12}:${m} ${ampm}`;
  }

  return cron;
}

/**
 * Converts "At HH:MM" to a daily cron expression: MM HH * * *
 */
export function timeToCron(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${minutes ?? 0} ${hours ?? 0} * * *`;
}

// Builder form state atoms
export const builderNameAtom = atom("");
export const builderDescriptionAtom = atom("");
export const builderTriggerTypeAtom = atom<TriggerType>("event");
export const builderScheduleModeAtom = atom<ScheduleMode>("every");
export const builderIntervalAmountAtom = atom(30);
export const builderIntervalUnitAtom = atom<IntervalUnit>("minutes");
export const builderIntervalStartAtom = atom<string | undefined>(undefined);
export const builderAtTimeAtom = atom("09:00");
export const builderCronAtom = atom("0 * * * *");
export const builderEventAtom = atom<EventType>("on_todo_create");
export const builderInstructionsAtom = atom("");
export const builderAllowedActionsAtom = atom<AllowedAction[]>(["notify"]);
export const builderModelAtom = atom<string | undefined>(undefined);
export const builderSandboxIdAtom = atom<Id<"sandboxes"> | null>(null);
