import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useWorkflows } from "@/hooks/use-workflows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft } from "lucide-react";
import {
  builderNameAtom,
  builderDescriptionAtom,
  builderTriggerTypeAtom,
  builderCronAtom,
  builderScheduleModeAtom,
  builderIntervalAmountAtom,
  builderIntervalUnitAtom,
  builderIntervalStartAtom,
  builderAtTimeAtom,
  builderEventAtom,
  builderInstructionsAtom,
  builderAllowedActionsAtom,
  builderSandboxIdAtom,
  ALL_ACTIONS,
  intervalToCron,
  timeToCron,
  type TriggerType,
  type EventType,
  type ScheduleMode,
  type IntervalUnit,
  type AllowedAction,
} from "@/store/workflows";
import { SandboxSelector } from "@/components/sandboxes/sandbox-selector";
import { TriggerConfig } from "./trigger-config";

export function WorkflowBuilder() {
  const navigate = useNavigate();
  const { createWorkflow, isCreating } = useWorkflows();

  const [name, setName] = useAtom(builderNameAtom);
  const [description, setDescription] = useAtom(builderDescriptionAtom);
  const [triggerType, setTriggerType] = useAtom(builderTriggerTypeAtom);
  const [cron, setCron] = useAtom(builderCronAtom);
  const [scheduleMode, setScheduleMode] = useAtom(builderScheduleModeAtom);
  const [intervalAmount, setIntervalAmount] = useAtom(builderIntervalAmountAtom);
  const [intervalUnit, setIntervalUnit] = useAtom(builderIntervalUnitAtom);
  const [intervalStart, setIntervalStart] = useAtom(builderIntervalStartAtom);
  const [atTime, setAtTime] = useAtom(builderAtTimeAtom);
  const [event, setEvent] = useAtom(builderEventAtom);
  const [instructions, setInstructions] = useAtom(builderInstructionsAtom);
  const [allowedActions, setAllowedActions] = useAtom(builderAllowedActionsAtom);
  const [sandboxId, setSandboxId] = useAtom(builderSandboxIdAtom);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !instructions.trim()) return;

    const trigger = buildTrigger(triggerType, scheduleMode, intervalAmount, intervalUnit, intervalStart, atTime, cron, event);

    await createWorkflow({
      data: {
        name: name.trim(),
        description: description.trim() || undefined,
        trigger,
        instructions: instructions.trim(),
        allowedActions,
        sandboxId: sandboxId ?? undefined,
      },
    });

    // Reset form
    setName("");
    setDescription("");
    setInstructions("");
    setAllowedActions(["notify"]);
    setSandboxId(null);

    navigate({ to: "/workflows" });
  }, [name, description, triggerType, scheduleMode, intervalAmount, intervalUnit, intervalStart, atTime, cron, event, instructions, allowedActions, sandboxId, createWorkflow, navigate, setName, setDescription, setInstructions, setAllowedActions, setSandboxId]);

  const toggleAction = useCallback(
    (action: AllowedAction) => {
      setAllowedActions((prev) =>
        prev.includes(action)
          ? prev.filter((a) => a !== action)
          : [...prev, action]
      );
    },
    [setAllowedActions]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/workflows" })}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold">New Workflow</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workflow"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Sandbox</Label>
            <SandboxSelector value={sandboxId} onChange={setSandboxId} />
          </div>

          <TriggerConfig
            triggerType={triggerType}
            onTriggerTypeChange={setTriggerType}
            event={event}
            onEventChange={setEvent}
            scheduleMode={scheduleMode}
            onScheduleModeChange={setScheduleMode}
            intervalAmount={intervalAmount}
            onIntervalAmountChange={setIntervalAmount}
            intervalUnit={intervalUnit}
            onIntervalUnitChange={setIntervalUnit}
            intervalStart={intervalStart}
            onIntervalStartChange={setIntervalStart}
            atTime={atTime}
            onAtTimeChange={setAtTime}
            cron={cron}
            onCronChange={setCron}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Tell the agent what to do when this workflow triggers..."
              rows={6}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Allowed Actions</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ACTIONS.map(({ value, label, description: desc }) => (
                <label
                  key={value}
                  className="flex items-start gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={allowedActions.includes(value)}
                    onCheckedChange={() => toggleAction(value)}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={isCreating || !name.trim() || !instructions.trim()}
        className="self-end"
      >
        {isCreating ? "Creating..." : "Create Workflow"}
      </Button>
    </div>
  );
}

function buildTrigger(
  type: TriggerType,
  scheduleMode: ScheduleMode,
  intervalAmount: number,
  intervalUnit: IntervalUnit,
  intervalStart: string | undefined,
  atTime: string,
  cron: string,
  event: EventType,
) {
  switch (type) {
    case "webhook":
      return { type: "webhook" as const, secret: "" };
    case "schedule": {
      let resolvedCron: string;
      switch (scheduleMode) {
        case "every": resolvedCron = intervalToCron(intervalAmount, intervalUnit, intervalStart); break;
        case "at":    resolvedCron = timeToCron(atTime); break;
        case "cron":  resolvedCron = cron; break;
      }
      return { type: "schedule" as const, cron: resolvedCron };
    }
    case "event":
      return { type: "event" as const, event };
  }
}
