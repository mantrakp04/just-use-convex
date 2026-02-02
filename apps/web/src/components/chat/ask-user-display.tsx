"use client";

import { memo, useState, useCallback } from "react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, XIcon, HelpCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConfirmationProps } from "@/components/ai-elements/confirmation";
import type {
  AskUserInput,
  AskUserQuestion,
  AskUserAnswer,
  AskUserResult,
} from "@/components/ai-elements/ask-user";

export interface AskUserDisplayProps {
  input: AskUserInput;
  approval?: ConfirmationProps["approval"];
  state?: ConfirmationProps["state"];
  toolApprovalResponse: ChatAddToolApproveResponseFunction;
}

// Single question component for request state
interface QuestionFormProps {
  question: AskUserQuestion;
  answer: AskUserAnswer;
  onAnswerChange: (answer: AskUserAnswer) => void;
}

const QuestionForm = memo(function QuestionForm({
  question,
  answer,
  onAnswerChange,
}: QuestionFormProps) {
  const [showOther, setShowOther] = useState(false);

  const handleOptionSelect = useCallback(
    (optionId: string, checked: boolean) => {
      if (question.multiSelect) {
        // Multi-select: toggle the option
        const newSelected = checked
          ? [...answer.selectedIds, optionId]
          : answer.selectedIds.filter((id) => id !== optionId);
        onAnswerChange({ ...answer, selectedIds: newSelected });
      } else {
        // Single select: replace
        if (optionId === "__other__") {
          setShowOther(true);
          onAnswerChange({ selectedIds: [], customText: answer.customText || "" });
        } else {
          setShowOther(false);
          onAnswerChange({ selectedIds: [optionId], customText: undefined });
        }
      }
    },
    [question.multiSelect, answer, onAnswerChange]
  );

  const handleOtherText = useCallback(
    (text: string) => {
      onAnswerChange({ ...answer, customText: text });
    },
    [answer, onAnswerChange]
  );

  const isSelected = (optionId: string) => answer.selectedIds.includes(optionId);

  if (question.multiSelect) {
    return (
      <div className="flex flex-col gap-3">
        {question.header && (
          <Badge variant="secondary" className="w-fit text-xs">
            {question.header}
          </Badge>
        )}
        <p className="text-sm font-medium">{question.question}</p>
        <div className="flex flex-col gap-2">
          {question.options.map((option) => (
            <label
              key={option.id}
              className={cn(
                "flex items-start gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors",
                "hover:bg-muted/60",
                isSelected(option.id) && "bg-primary/10 border border-primary/20"
              )}
            >
              <Checkbox
                checked={isSelected(option.id)}
                onCheckedChange={(checked) =>
                  handleOptionSelect(option.id, checked === true)
                }
                className="mt-0.5"
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{option.label}</span>
                {option.description && (
                  <span className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </div>
            </label>
          ))}
          {/* Other option */}
          <div className="flex flex-col gap-2">
            <label
              className={cn(
                "flex items-start gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors",
                "hover:bg-muted/60",
                answer.customText !== undefined && "bg-primary/10 border border-primary/20"
              )}
            >
              <Checkbox
                checked={answer.customText !== undefined}
                onCheckedChange={(checked) => {
                  if (checked) {
                    onAnswerChange({ ...answer, customText: "" });
                  } else {
                    onAnswerChange({ ...answer, customText: undefined });
                  }
                }}
                className="mt-0.5"
              />
              <span className="text-sm font-medium italic">Other...</span>
            </label>
            {answer.customText !== undefined && (
              <Input
                value={answer.customText}
                onChange={(e) => handleOtherText(e.target.value)}
                placeholder="Type your answer..."
                className="ml-7"
                autoFocus
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Single select with radio
  return (
    <div className="flex flex-col gap-3">
      {question.header && (
        <Badge variant="secondary" className="w-fit text-xs">
          {question.header}
        </Badge>
      )}
      <p className="text-sm font-medium">{question.question}</p>
      <RadioGroup
        value={showOther ? "__other__" : answer.selectedIds[0] || ""}
        onValueChange={(value) => handleOptionSelect(value, true)}
        className="flex flex-col gap-2"
      >
        {question.options.map((option) => (
          <label
            key={option.id}
            className={cn(
              "flex items-start gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors",
              "hover:bg-muted/60",
              isSelected(option.id) && "bg-primary/10 border border-primary/20"
            )}
          >
            <RadioGroupItem value={option.id} className="mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{option.label}</span>
              {option.description && (
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              )}
            </div>
          </label>
        ))}
        {/* Other option */}
        <div className="flex flex-col gap-2">
          <label
            className={cn(
              "flex items-start gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors",
              "hover:bg-muted/60",
              showOther && "bg-primary/10 border border-primary/20"
            )}
          >
            <RadioGroupItem value="__other__" className="mt-0.5" />
            <span className="text-sm font-medium italic">Other...</span>
          </label>
          {showOther && (
            <Input
              value={answer.customText || ""}
              onChange={(e) => handleOtherText(e.target.value)}
              placeholder="Type your answer..."
              className="ml-7"
              autoFocus
            />
          )}
        </div>
      </RadioGroup>
    </div>
  );
});

// Display answered question (after response)
interface QuestionAnsweredProps {
  question: AskUserQuestion;
  answer?: AskUserAnswer;
}

const QuestionAnswered = memo(function QuestionAnswered({
  question,
  answer,
}: QuestionAnsweredProps) {
  if (!answer) return null;

  const selectedOptions = question.options.filter((opt) =>
    answer.selectedIds.includes(opt.id)
  );

  return (
    <div className="flex flex-col gap-2">
      {question.header && (
        <Badge variant="secondary" className="w-fit text-xs">
          {question.header}
        </Badge>
      )}
      <p className="text-sm font-medium text-muted-foreground">{question.question}</p>
      <div className="flex flex-wrap gap-2">
        {selectedOptions.map((opt) => (
          <Badge key={opt.id} variant="outline" className="text-xs">
            {opt.label}
          </Badge>
        ))}
        {answer.customText && (
          <Badge variant="outline" className="text-xs italic">
            {answer.customText}
          </Badge>
        )}
      </div>
    </div>
  );
});

export const AskUserDisplay = memo(function AskUserDisplay({
  input,
  approval,
  state,
  toolApprovalResponse,
}: AskUserDisplayProps) {
  // Initialize answers state for each question
  const [answers, setAnswers] = useState<Record<string, AskUserAnswer>>(() => {
    const initial: Record<string, AskUserAnswer> = {};
    for (const q of input.questions) {
      initial[q.id] = { selectedIds: [] };
    }
    return initial;
  });

  const handleAnswerChange = useCallback((questionId: string, answer: AskUserAnswer) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!approval?.id) return;

    const result: AskUserResult = {
      answers,
      timestamp: Date.now(),
    };

    // Pass the structured result as JSON in the reason field
    toolApprovalResponse({
      id: approval.id,
      approved: true,
      reason: JSON.stringify(result),
    });
  }, [approval?.id, answers, toolApprovalResponse]);

  const handleSkip = useCallback(() => {
    if (!approval?.id) return;

    toolApprovalResponse({
      id: approval.id,
      approved: false,
      reason: "User skipped the question",
    });
  }, [approval?.id, toolApprovalResponse]);

  // Check if all required questions have answers
  const canSubmit = input.questions.every((q) => {
    if (!q.required) return true;
    const answer = answers[q.id];
    return (
      (answer?.selectedIds?.length ?? 0) > 0 ||
      (answer?.customText?.trim().length ?? 0) > 0
    );
  });

  // Don't render if no approval or still streaming input
  if (!approval || state === "input-streaming" || state === "input-available") {
    return null;
  }

  const isRequest = state === "approval-requested";
  const isAccepted = approval.approved === true;
  const isRejected = approval.approved === false;

  // Parse the result from the reason if accepted
  let parsedResult: AskUserResult | null = null;
  if (isAccepted && approval.reason) {
    try {
      parsedResult = JSON.parse(approval.reason) as AskUserResult;
    } catch {
      // Not JSON, ignore
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-xs">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <HelpCircleIcon className="size-4" />
          <span>Question from assistant</span>
        </div>
        {input.context && (
          <p className="text-sm text-muted-foreground/80 ml-6">{input.context}</p>
        )}
      </div>

      {/* Questions */}
      <div className="flex flex-col gap-4">
        {isRequest &&
          input.questions.map((question) => (
            <QuestionForm
              key={question.id}
              question={question}
              answer={answers[question.id] || { selectedIds: [] }}
              onAnswerChange={(answer) => handleAnswerChange(question.id, answer)}
            />
          ))}

        {(isAccepted || isRejected) &&
          input.questions.map((question) => (
            <QuestionAnswered
              key={question.id}
              question={question}
              answer={parsedResult?.answers[question.id]}
            />
          ))}
      </div>

      {/* Actions for request state */}
      {isRequest && (
        <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            <XIcon className="size-4 mr-1.5" />
            Skip
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
            <CheckIcon className="size-4 mr-1.5" />
            Submit
          </Button>
        </div>
      )}

      {/* Status for responded state */}
      {isAccepted && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2 pt-2 border-t">
          <CheckIcon className="size-4 text-green-500" />
          <span>Answered</span>
        </div>
      )}

      {isRejected && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2 pt-2 border-t">
          <XIcon className="size-4 text-destructive" />
          <span>Skipped</span>
        </div>
      )}
    </div>
  );
});
