import type { QueueMessage, QueueMessagePart, QueueTodo } from "@/components/ai-elements/queue";
import type { ConfirmationProps } from "@/components/ai-elements/confirmation";
import type { AskUserInput } from "@/components/ai-elements/ask-user";

export type TodosState = {
  todos: QueueTodo[];
  todosApproval?: ConfirmationProps["approval"];
  todosState?: ConfirmationProps["state"];
  todosToolCallId?: string;
  todosInput?: { todos?: QueueTodo[] };
};

export type AskUserState = {
  input: AskUserInput;
  approval?: ConfirmationProps["approval"];
  state?: ConfirmationProps["state"];
};

export type SteerQueueItem = QueueMessage & {
  status?: "queued" | "injecting" | "done" | "failed";
  source?: "live" | "post_finish";
  createdAt?: number;
  error?: string;
};

export type SteerQueueInput = {
  parts?: QueueMessagePart[];
  text?: string;
  mode?: "auto" | "live" | "post_finish";
} & Record<string, unknown>;

export type SteerQueueState = {
  items: SteerQueueItem[];
  pendingRemovalIds: string[];
  isRefreshing: boolean;
  isSteering: boolean;
  steerQueue: (input: SteerQueueInput) => Promise<void>;
  refreshSteerQueueState: () => Promise<void>;
  removeSteerQueueItem: (itemId: string) => Promise<void>;
};
