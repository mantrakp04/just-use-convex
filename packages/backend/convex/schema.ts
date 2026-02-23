import { defineEntSchema, getEntDefinitions } from "convex-ents";
import { todosEnt } from "./tables/todos";
import { todoAssignedMembersEnt } from "./tables/todoAssignedMembers";
import { chatsEnt } from "./tables/chats";
import { sandboxesEnt } from "./tables/sandboxes";
import { globalAttachmentsEnt } from "./tables/globalAttachments";
import { orgMemberAttachmentsEnt } from "./tables/orgMemberAttachments";
import { workflowsEnt } from "./tables/workflows";
import { workflowExecutionsEnt } from "./tables/workflowExecutions";
import { workflowStepsEnt } from "./tables/workflowSteps";

const schema = defineEntSchema({
  todos: todosEnt,
  todoAssignedMembers: todoAssignedMembersEnt,
  chats: chatsEnt,
  sandboxes: sandboxesEnt,
  globalAttachments: globalAttachmentsEnt,
  orgMemberAttachments: orgMemberAttachmentsEnt,
  workflows: workflowsEnt,
  workflowExecutions: workflowExecutionsEnt,
  workflowSteps: workflowStepsEnt,
});

export default schema;
export const entDefinitions = getEntDefinitions(schema);
