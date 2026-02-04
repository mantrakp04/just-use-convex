import type { QueueTodo } from "@/components/ai-elements/queue";
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
