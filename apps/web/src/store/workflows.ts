import { atom } from "jotai";

export type TriggerType = "webhook" | "schedule" | "event";

export type ScheduleMode = "every" | "at" | "cron";

export type IntervalUnit = "minutes" | "hours" | "days";

export type EventType =
  | "on_chat_create"
  | "on_chat_delete"
  | "on_sandbox_provision"
  | "on_sandbox_delete"
  | "on_todo_create"
  | "on_todo_complete";

export type AllowedAction =
  | "send_message"
  | "create_todo"
  | "run_sandbox_command"
  | "web_search"
  | "http_request"
  | "notify";

export const ALL_ACTIONS: { value: AllowedAction; label: string; description: string }[] = [
  { value: "send_message", label: "Send Message", description: "Send a message to a chat" },
  { value: "create_todo", label: "Create Todo", description: "Create a new todo/task" },
  { value: "run_sandbox_command", label: "Run Command", description: "Execute a command in a sandbox" },
  { value: "web_search", label: "Web Search", description: "Search the web for information" },
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
    case "minutes":
      return startFrom ? `${m}-59/${amount} ${h} * * *` : `*/${amount} * * * *`;
    case "hours":
      return startFrom ? `${m} ${h}-23/${amount} * * *` : `0 */${amount} * * *`;
    case "days":
      return startFrom ? `${m} ${h} */${amount} * *` : `0 0 */${amount} * *`;
  }
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
