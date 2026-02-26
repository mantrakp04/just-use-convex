import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai";
import type { InputModality } from "@convex/workflows/types";
import { useWorkflows, type Workflow } from "@/hooks/use-workflows";
import { useOpenRouterModels } from "@/hooks/use-openrouter-models";
import { ChatModelSelector, type ChatSettings } from "@/components/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft } from "lucide-react";
import {
  builderNameAtom,
  builderTriggerTypeAtom,
  builderCronAtom,
  builderScheduleModeAtom,
  builderIntervalAmountAtom,
  builderIntervalUnitAtom,
  builderIntervalStartAtom,
  builderAtTimeAtom,
  builderEventAtom,
  builderInstructionsAtom,
  builderActionsAtom,
  builderModelAtom,
  builderSandboxIdAtom,
  ALL_ACTIONS,
  intervalToCron,
  timeToCron,
  type TriggerType,
  type EventType,
  type ScheduleMode,
  type IntervalUnit,
  type Action,
} from "@/store/workflows";
import { defaultChatSettingsAtom } from "@/store/models";
import { SandboxSelector } from "@/components/sandboxes/sandbox-selector";
import { TriggerConfig } from "./trigger-config";

interface WorkflowBuilderProps {
  mode?: "create" | "edit";
  workflow?: Workflow;
  onCancel?: () => void;
  onSuccess?: () => void;
}

export function WorkflowBuilder({
  mode = "create",
  workflow,
  onCancel,
  onSuccess,
}: WorkflowBuilderProps) {
  const navigate = useNavigate();
  const { createWorkflow, updateWorkflow, isCreating, isUpdating } = useWorkflows();
  const { groupedModels, models } = useOpenRouterModels();
  const defaultSettings = useAtomValue(defaultChatSettingsAtom);
  const isEditMode = mode === "edit" && !!workflow;
  const isSubmitting = isEditMode ? isUpdating : isCreating;

  const [name, setName] = useAtom(builderNameAtom);
  const [triggerType, setTriggerType] = useAtom(builderTriggerTypeAtom);
  const [cron, setCron] = useAtom(builderCronAtom);
  const [scheduleMode, setScheduleMode] = useAtom(builderScheduleModeAtom);
  const [intervalAmount, setIntervalAmount] = useAtom(builderIntervalAmountAtom);
  const [intervalUnit, setIntervalUnit] = useAtom(builderIntervalUnitAtom);
  const [intervalStart, setIntervalStart] = useAtom(builderIntervalStartAtom);
  const [atTime, setAtTime] = useAtom(builderAtTimeAtom);
  const [event, setEvent] = useAtom(builderEventAtom);
  const [instructions, setInstructions] = useAtom(builderInstructionsAtom);
  const [actions, setActions] = useAtom(builderActionsAtom);
  const [model, setModel] = useAtom(builderModelAtom);
  const [sandboxId, setSandboxId] = useAtom(builderSandboxIdAtom);
  const [webhookSecret, setWebhookSecret] = useState("");
  const resolvedModel = model ?? defaultSettings.model;
  const selectedModel = useMemo(
    () => models.find((openRouterModel) => openRouterModel.slug === resolvedModel),
    [models, resolvedModel]
  );

  const resetForm = useCallback(() => {
    setName("");
    setInstructions("");
    setActions(["notify"]);
    setModel(undefined);
    setSandboxId(null);
    setTriggerType("event");
    setScheduleMode("every");
    setIntervalAmount(30);
    setIntervalUnit("minutes");
    setIntervalStart(undefined);
    setAtTime("09:00");
    setCron("0 * * * *");
    setEvent("on_todos_create");
    setWebhookSecret("");
  }, [setName, setInstructions, setActions, setModel, setSandboxId, setTriggerType, setScheduleMode, setIntervalAmount, setIntervalUnit, setIntervalStart, setAtTime, setCron, setEvent]);

  useEffect(() => {
    if (!isEditMode || !workflow) {
      resetForm();
      return;
    }

    const parsed = parseWorkflowTrigger(workflow.trigger);
    setName(workflow.name);
    setInstructions(workflow.instructions);
    setActions(workflow.actions);
    setModel(workflow.model);
    setSandboxId(workflow.sandboxId ?? null);
    setTriggerType(parsed.triggerType);
    setScheduleMode(parsed.scheduleMode);
    setIntervalAmount(parsed.intervalAmount);
    setIntervalUnit(parsed.intervalUnit);
    setIntervalStart(parsed.intervalStart);
    setAtTime(parsed.atTime);
    setCron(parsed.cron);
    setEvent(parsed.event);
    setWebhookSecret(parsed.webhookSecret);
  }, [
    isEditMode,
    workflow,
    setName,
    setInstructions,
    setActions,
    setModel,
    setSandboxId,
    setTriggerType,
    setScheduleMode,
    setIntervalAmount,
    setIntervalUnit,
    setIntervalStart,
    setAtTime,
    setCron,
    setEvent,
    resetForm,
  ]);

  useEffect(() => {
    if (triggerType === "webhook" && !webhookSecret) {
      setWebhookSecret(generateWebhookSecret());
    }
  }, [triggerType, webhookSecret]);

  const handleModelSettingsChange = useCallback(
    (settingsOrFn: ChatSettings | ((prev: ChatSettings) => ChatSettings)) => {
      const nextSettings = typeof settingsOrFn === "function"
        ? settingsOrFn({ model: resolvedModel })
        : settingsOrFn;
      setModel(nextSettings.model);
    },
    [resolvedModel, setModel]
  );

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !instructions.trim()) return;

    const trigger = buildTrigger(
      triggerType,
      scheduleMode,
      intervalAmount,
      intervalUnit,
      intervalStart,
      atTime,
      cron,
      event,
      webhookSecret
    );
    const inputModalities: InputModality[] =
      selectedModel?.input_modalities ??
      (isEditMode && workflow?.model === model ? workflow.inputModalities : undefined) ??
      defaultSettings.inputModalities ??
      (["text"] satisfies InputModality[]);

    if (isEditMode && workflow) {
      // undefined = no change, null = unset, Id = set
      const patchedSandboxId =
        (workflow.sandboxId ?? null) === sandboxId
          ? undefined
          : sandboxId;
      await updateWorkflow({
        _id: workflow._id,
        patch: {
          name: name.trim(),
          trigger,
          instructions: instructions.trim(),
          actions,
          model,
          inputModalities,
          sandboxId: patchedSandboxId,
        },
      });
    } else {
      await createWorkflow({
        data: {
          name: name.trim(),
          trigger,
          instructions: instructions.trim(),
          actions,
          model: resolvedModel,
          inputModalities,
          sandboxId: sandboxId ?? undefined,
        },
      });
    }

    if (isEditMode) {
      onSuccess?.();
    } else {
      resetForm();
      navigate({ to: "/workflows" });
    }

    if (!isEditMode && onSuccess) {
      onSuccess();
    }
  }, [
    isEditMode,
    workflow,
    name,
    triggerType,
    scheduleMode,
    intervalAmount,
    intervalUnit,
    intervalStart,
    atTime,
    cron,
    event,
    instructions,
    actions,
    model,
    resolvedModel,
    selectedModel,
    sandboxId,
    webhookSecret,
    defaultSettings.inputModalities,
    updateWorkflow,
    createWorkflow,
    navigate,
    onSuccess,
    resetForm,
  ]);

  const toggleAction = useCallback(
    (action: Action) => {
      setActions((prev) =>
        prev.includes(action)
          ? prev.filter((a) => a !== action)
          : [...prev, action]
      );
    },
    [setActions]
  );

  const handleTriggerTypeChange = useCallback((type: TriggerType) => {
    setTriggerType(type);
    if (type === "webhook" && !webhookSecret) {
      setWebhookSecret(generateWebhookSecret());
    }
  }, [setTriggerType, webhookSecret]);

  const submitLabel = isEditMode ? "Save Workflow" : "Create Workflow";

  const handleBack = useCallback(() => {
    if (isEditMode && onCancel) {
      onCancel();
      return;
    }
    navigate({ to: "/workflows" });
  }, [isEditMode, navigate, onCancel]);
  const submittingLabel = isSubmitting
    ? isEditMode ? "Saving..." : "Creating..."
    : submitLabel;

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-semibold">{isEditMode ? "Edit Workflow" : "New Workflow"}</h1>
      </div>

      <Card className="border-border border">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Sandbox</Label>
              <SandboxSelector value={sandboxId} onChange={setSandboxId} />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Model</Label>
              <ChatModelSelector
                  groupedModels={groupedModels}
                  models={models}
                  selectedModel={selectedModel}
                  onSettingsChange={handleModelSettingsChange}
                  hasMessages
                  useDefaults
                  variant="outline"
                  size="default"
                />
            </div>
          </div>

          <TriggerConfig
            triggerType={triggerType}
            onTriggerTypeChange={handleTriggerTypeChange}
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
            <Label>Actions</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_ACTIONS.map(({ value, label, description: desc }) => (
                <label
                  key={value}
                  className="flex items-start gap-2 p-2 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={actions.includes(value)}
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

      <div className="flex items-center justify-end gap-2 self-end">
        {isEditMode && onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !name.trim() || !instructions.trim()}
        >
          {submittingLabel}
        </Button>
      </div>
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
  webhookSecret?: string,
) {
  switch (type) {
    case "webhook":
      return { type: "webhook" as const, secret: webhookSecret ?? "" };
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

type WorkflowTriggerBuilderState = {
  triggerType: TriggerType;
  event: EventType;
  scheduleMode: ScheduleMode;
  intervalAmount: number;
  intervalUnit: IntervalUnit;
  intervalStart: string | undefined;
  atTime: string;
  cron: string;
  webhookSecret: string;
};

type WorkflowCronBuilderState = Pick<
  WorkflowTriggerBuilderState,
  "scheduleMode" | "intervalAmount" | "intervalUnit" | "intervalStart" | "atTime" | "cron"
>;

function parseWorkflowTrigger(triggerJson: string): WorkflowTriggerBuilderState {
  const defaults: WorkflowTriggerBuilderState = {
    triggerType: "event" as TriggerType,
    event: "on_todos_create" as EventType,
    scheduleMode: "every" as ScheduleMode,
    intervalAmount: 30,
    intervalUnit: "minutes" as IntervalUnit,
    intervalStart: undefined as string | undefined,
    atTime: "09:00",
    cron: "0 * * * *",
    webhookSecret: "",
  };

  try {
    const parsed = JSON.parse(triggerJson) as { type: string; secret?: string; cron?: string; event?: string };

    if (parsed.type === "webhook") {
      return {
        ...defaults,
        triggerType: "webhook",
        webhookSecret: typeof parsed.secret === "string" ? parsed.secret : "",
      };
    }

    if (parsed.type === "event" && typeof parsed.event === "string") {
      return {
        ...defaults,
        triggerType: "event",
        event: parsed.event as EventType,
      };
    }

    if (parsed.type === "schedule" && typeof parsed.cron === "string") {
      const schedule = parseCronForBuilder(parsed.cron);
      return { ...defaults, triggerType: "schedule", ...schedule };
    }
  } catch {
    return defaults;
  }

  return defaults;
}

function parseCronForBuilder(cron: string): WorkflowCronBuilderState {
  const normalized = cron.trim();
  const parts = normalized.split(/\s+/);
  if (parts.length < 5) {
    return {
      scheduleMode: "cron",
      intervalAmount: 30,
      intervalUnit: "minutes",
      intervalStart: undefined,
      atTime: "09:00",
      cron: normalized || "0 * * * *",
    };
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  const everyMinutesWithHourRange = minute.match(/^(\d{1,2})-59\/(\d+)$/);
  const everyMinutesHourStart = hour.match(/^(\d{1,2})-23$/);
  if (
    everyMinutesWithHourRange &&
    everyMinutesHourStart &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return {
      scheduleMode: "every",
      intervalAmount: Math.max(1, Number(everyMinutesWithHourRange[2] ?? 1)),
      intervalUnit: "minutes",
      intervalStart: `${padCronTime(everyMinutesHourStart[1] ?? "0")}:${padCronTime(everyMinutesWithHourRange[1] ?? "0")}`,
      atTime: "09:00",
      cron: normalized,
    };
  }

  // Every hour at minute patterns, eg `0 */6 * * *`
  const intervalEveryMinutes = minute.match(/^(\d{1,2})-59\/(\d+)$/);
  if (
    intervalEveryMinutes &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return {
      scheduleMode: "every",
      intervalAmount: Math.max(1, Number(intervalEveryMinutes[2] ?? 1)),
      intervalUnit: "minutes",
      intervalStart: `00:${padCronTime(intervalEveryMinutes[1] ?? "0")}`,
      atTime: "09:00",
      cron: normalized,
    };
  }

  const everyMinutes = minute.match(/^\*\/(\d+)$/);
  if (
    everyMinutes &&
    hour === "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return {
      scheduleMode: "every",
      intervalAmount: Math.max(1, Number(everyMinutes[1] ?? 1)),
      intervalUnit: "minutes",
      intervalStart: undefined,
      atTime: "09:00",
      cron: normalized,
    };
  }

  const everyHoursRange = hour.match(/^(\d{1,2})-23\/(\d+)$/);
  if (
    everyHoursRange &&
    minute !== "*" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return {
      scheduleMode: "every",
      intervalAmount: Math.max(1, Number(everyHoursRange[2] ?? 1)),
      intervalUnit: "hours",
      intervalStart: `${padCronTime(everyHoursRange[1] ?? "0")}:${padCronTime(minute ?? "0")}`,
      atTime: "09:00",
      cron: normalized,
    };
  }

  const everyHours = hour.match(/^\*\/(\d+)$/);
  if (
    everyHours &&
    minute === "0" &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return {
      scheduleMode: "every",
      intervalAmount: Math.max(1, Number(everyHours[1] ?? 1)),
      intervalUnit: "hours",
      intervalStart: undefined,
      atTime: "09:00",
      cron: normalized,
    };
  }

  const everyDays = dayOfMonth.match(/^\*\/(\d+)$/);
  if (
    everyDays &&
    minute === "0" &&
    hour === "0" &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return {
      scheduleMode: "every",
      intervalAmount: Math.max(1, Number(everyDays[1] ?? 1)),
      intervalUnit: "days",
      intervalStart: undefined,
      atTime: "09:00",
      cron: normalized,
    };
  }

  if (
    everyDays &&
    minute.match(/^\d{1,2}$/) &&
    hour.match(/^\d{1,2}$/) &&
    month === "*" &&
    dayOfWeek === "*"
  ) {
    return {
      scheduleMode: "every",
      intervalAmount: Math.max(1, Number(everyDays[1] ?? 1)),
      intervalUnit: "days",
      intervalStart: `${padCronTime(hour ?? "0")}:${padCronTime(minute ?? "0")}`,
      atTime: "09:00",
      cron: normalized,
    };
  }

  const dailyAt = minute.match(/^\d{1,2}$/);
  if (
    dailyAt &&
    hour.match(/^\d{1,2}$/) &&
    dayOfMonth === "*" &&
    month === "*" &&
    dayOfWeek === "*" &&
    !minute.includes("-") &&
    !minute.includes("/") &&
    !hour.includes("-") &&
    !hour.includes("/")
  ) {
    return {
      scheduleMode: "at",
      intervalAmount: 30,
      intervalUnit: "minutes",
      intervalStart: undefined,
      atTime: `${padCronTime(hour ?? "00")}:${padCronTime(minute ?? "00")}`,
      cron: normalized,
    };
  }

  return {
    scheduleMode: "cron",
    intervalAmount: 30,
    intervalUnit: "minutes",
    intervalStart: undefined,
    atTime: "09:00",
    cron: normalized,
  };
}

function padCronTime(value: string) {
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num)) return "00";
  return `${num}`.padStart(2, "0");
}

function generateWebhookSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
