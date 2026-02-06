import { defineEntSchema, getEntDefinitions } from "convex-ents";
import { todosEnt } from "./tables/todos";
import { todoAssignedMembersEnt } from "./tables/todoAssignedMembers";
import { chatsEnt } from "./tables/chats";
import { sandboxesEnt } from "./tables/sandboxes";
import { triggersEnt } from "./tables/triggers";
import { actionsEnt } from "./tables/actions";
import { workflowRunsEnt } from "./tables/workflowRuns";

const schema = defineEntSchema({
  todos: todosEnt,
  todoAssignedMembers: todoAssignedMembersEnt,
  chats: chatsEnt,
  sandboxes: sandboxesEnt,
  triggers: triggersEnt,
  actions: actionsEnt,
  workflowRuns: workflowRunsEnt,
});

export default schema;
export const entDefinitions = getEntDefinitions(schema);
