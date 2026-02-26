import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ALL_EVENTS,
  type TriggerType,
  type EventType,
  type ScheduleMode,
  type IntervalUnit,
} from "@/store/workflows";
import { Clock, Webhook, Zap, Repeat, Timer, CalendarClock } from "lucide-react";

interface TriggerConfigProps {
  triggerType: TriggerType;
  onTriggerTypeChange: (type: TriggerType) => void;
  event: EventType;
  onEventChange: (event: EventType) => void;
  scheduleMode: ScheduleMode;
  onScheduleModeChange: (mode: ScheduleMode) => void;
  intervalAmount: number;
  onIntervalAmountChange: (amount: number) => void;
  intervalUnit: IntervalUnit;
  onIntervalUnitChange: (unit: IntervalUnit) => void;
  intervalStart: string | undefined;
  onIntervalStartChange: (time: string | undefined) => void;
  atTime: string;
  onAtTimeChange: (time: string) => void;
  cron: string;
  onCronChange: (cron: string) => void;
}

const TRIGGER_OPTIONS: { value: TriggerType; label: string; icon: typeof Clock; description: string }[] = [
  { value: "event", label: "Event", icon: Zap, description: "When something happens" },
  { value: "schedule", label: "Schedule", icon: CalendarClock, description: "Time-based triggers" },
  { value: "webhook", label: "Webhook", icon: Webhook, description: "Via HTTP request" },
];

export function TriggerConfig({
  triggerType,
  onTriggerTypeChange,
  event,
  onEventChange,
  scheduleMode,
  onScheduleModeChange,
  intervalAmount,
  onIntervalAmountChange,
  intervalUnit,
  onIntervalUnitChange,
  intervalStart,
  onIntervalStartChange,
  atTime,
  onAtTimeChange,
  cron,
  onCronChange,
}: TriggerConfigProps) {
  return (
    <div className="flex flex-col gap-3">
      <Label>Trigger</Label>

      {/* Trigger type cards */}
      <div className="grid grid-cols-3 gap-2">
        {TRIGGER_OPTIONS.map(({ value, label, icon: Icon, description }) => (
          <button
            key={value}
            type="button"
            onClick={() => onTriggerTypeChange(value)}
            className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors cursor-pointer ${
              triggerType === value
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:bg-muted/50"
            }`}
          >
            <Icon className={`size-4 ${triggerType === value ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-muted-foreground leading-tight">{description}</span>
          </button>
        ))}
      </div>

      {/* Event config */}
      {triggerType === "event" && (
        <div className="flex flex-col gap-2">
          <Label>Event</Label>
          <Select value={event} onValueChange={(v) => onEventChange(v as EventType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-xl w-full">
              {ALL_EVENTS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Schedule config — 3 modes */}
      {triggerType === "schedule" && (
        <Tabs value={scheduleMode} onValueChange={(v) => onScheduleModeChange(v as ScheduleMode)}>
          <TabsList className="w-full">
            <TabsTrigger value="every" className="flex-1 gap-1.5">
              <Repeat className="size-3.5" />
              Every
            </TabsTrigger>
            <TabsTrigger value="at" className="flex-1 gap-1.5">
              <Timer className="size-3.5" />
              At
            </TabsTrigger>
            <TabsTrigger value="cron" className="flex-1 gap-1.5">
              <Clock className="size-3.5" />
              Cron
            </TabsTrigger>
          </TabsList>

          {/* Every X minutes/hours/days, starting from */}
          <TabsContent value="every" className="mt-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label>Run every</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={intervalAmount}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) onIntervalAmountChange(val);
                    }}
                    className="w-20 tabular-nums"
                  />
                  <Select value={intervalUnit} onValueChange={(v) => onIntervalUnitChange(v as IntervalUnit)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minutes">minutes</SelectItem>
                      <SelectItem value="hours">hours</SelectItem>
                      <SelectItem value="days">days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={intervalStart !== undefined}
                      onChange={(e) => onIntervalStartChange(e.target.checked ? "08:00" : undefined)}
                      className="accent-primary size-3.5"
                    />
                    <span className="text-sm text-muted-foreground">Starting from</span>
                  </label>
                  {intervalStart !== undefined && (
                    <Input
                      type="time"
                      value={intervalStart}
                      onChange={(e) => onIntervalStartChange(e.target.value)}
                      className="w-32"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {intervalStart !== undefined
                    ? `Runs every ${intervalAmount} ${intervalUnit} starting at ${intervalStart} UTC`
                    : "Runs from the top of the hour/day by default"}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* At a specific time (daily) */}
          <TabsContent value="at" className="mt-3">
            <div className="flex flex-col gap-2">
              <Label>Run daily at</Label>
              <Input
                type="time"
                value={atTime}
                onChange={(e) => onAtTimeChange(e.target.value)}
                className="w-36"
              />
              <p className="text-xs text-muted-foreground">Time is in UTC</p>
            </div>
          </TabsContent>

          {/* Raw cron */}
          <TabsContent value="cron" className="mt-3">
            <div className="flex flex-col gap-2">
              <Label>Cron expression</Label>
              <Input
                value={cron}
                onChange={(e) => onCronChange(e.target.value)}
                placeholder="0 * * * *"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                5-field cron (UTC): minute hour day-of-month month day-of-week
              </p>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* Webhook info */}
      {triggerType === "webhook" && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">
            A webhook URL and secret will be generated when you create the workflow.
          </p>
        </div>
      )}
    </div>
  );
}
