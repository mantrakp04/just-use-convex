"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { HelpCircleIcon } from "lucide-react";
import type { ComponentProps } from "react";

// Types matching the backend
export interface AskUserOption {
  id: string;
  label: string;
  description?: string;
}

export interface AskUserQuestion {
  id: string;
  question: string;
  header?: string;
  options: AskUserOption[];
  multiSelect?: boolean;
  required?: boolean;
}

export interface AskUserInput {
  questions: AskUserQuestion[];
  context?: string;
}

export interface AskUserAnswer {
  selectedIds: string[];
  customText?: string;
}

export interface AskUserResult {
  answers: Record<string, AskUserAnswer>;
  timestamp: number;
}

// Container
export type AskUserProps = ComponentProps<"div">;

export const AskUser = ({ className, ...props }: AskUserProps) => (
  <div
    className={cn(
      "flex flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-xs",
      className
    )}
    {...props}
  />
);

// Header with icon
export type AskUserHeaderProps = ComponentProps<"div"> & {
  context?: string;
};

export const AskUserHeader = ({
  context,
  className,
  ...props
}: AskUserHeaderProps) => (
  <div className={cn("flex flex-col gap-1", className)} {...props}>
    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <HelpCircleIcon className="size-4" />
      <span>Question from assistant</span>
    </div>
    {context && (
      <p className="text-sm text-muted-foreground/80 ml-6">{context}</p>
    )}
  </div>
);

// Question section
export type AskUserQuestionSectionProps = ComponentProps<"div"> & {
  header?: string;
};

export const AskUserQuestionSection = ({
  header,
  className,
  children,
  ...props
}: AskUserQuestionSectionProps) => (
  <div className={cn("flex flex-col gap-2", className)} {...props}>
    {header && (
      <Badge variant="secondary" className="w-fit text-xs">
        {header}
      </Badge>
    )}
    {children}
  </div>
);

// Question text
export type AskUserQuestionTextProps = ComponentProps<"p">;

export const AskUserQuestionText = ({
  className,
  ...props
}: AskUserQuestionTextProps) => (
  <p className={cn("text-sm font-medium", className)} {...props} />
);

// Options container
export type AskUserOptionsProps = ComponentProps<"div">;

export const AskUserOptions = ({ className, ...props }: AskUserOptionsProps) => (
  <div className={cn("flex flex-col gap-1.5 mt-1", className)} {...props} />
);

// Single option (for display, not interactive)
export type AskUserOptionDisplayProps = ComponentProps<"div"> & {
  selected?: boolean;
  isOther?: boolean;
};

export const AskUserOptionDisplay = ({
  selected,
  isOther,
  className,
  children,
  ...props
}: AskUserOptionDisplayProps) => (
  <div
    className={cn(
      "flex items-start gap-2 rounded-md px-3 py-2 text-sm transition-colors",
      selected
        ? "bg-primary/10 border border-primary/20"
        : "bg-muted/40",
      isOther && "italic",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

// Option label
export type AskUserOptionLabelProps = ComponentProps<"span">;

export const AskUserOptionLabel = ({
  className,
  ...props
}: AskUserOptionLabelProps) => (
  <span className={cn("font-medium", className)} {...props} />
);

// Option description
export type AskUserOptionDescriptionProps = ComponentProps<"span">;

export const AskUserOptionDescription = ({
  className,
  ...props
}: AskUserOptionDescriptionProps) => (
  <span
    className={cn("text-muted-foreground text-xs", className)}
    {...props}
  />
);

// Actions container (for buttons)
export type AskUserActionsProps = ComponentProps<"div">;

export const AskUserActions = ({ className, ...props }: AskUserActionsProps) => (
  <div
    className={cn("flex items-center justify-end gap-2 mt-2 pt-2 border-t", className)}
    {...props}
  />
);

// Answered state display
export type AskUserAnsweredProps = ComponentProps<"div"> & {
  status: "accepted" | "rejected";
};

export const AskUserAnswered = ({
  status,
  className,
  children,
  ...props
}: AskUserAnsweredProps) => (
  <div
    className={cn(
      "flex items-center gap-2 text-sm",
      status === "accepted" ? "text-muted-foreground" : "text-destructive",
      className
    )}
    {...props}
  >
    {children}
  </div>
);
