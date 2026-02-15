import { defineEntSchema, getEntDefinitions } from "convex-ents";
import { todosEnt } from "./tables/todos";
import { todoAssignedMembersEnt } from "./tables/todoAssignedMembers";
import { todosContentEnt } from "./tables/todosContent";
import { chatsEnt } from "./tables/chats";
import { sandboxesEnt } from "./tables/sandboxes";
import { globalAttachmentsEnt } from "./tables/globalAttachments";
import { orgMemberAttachmentsEnt } from "./tables/orgMemberAttachments";

const schema = defineEntSchema({
  todos: todosEnt,
  todoAssignedMembers: todoAssignedMembersEnt,
  todosContent: todosContentEnt,
  chats: chatsEnt,
  sandboxes: sandboxesEnt,
  globalAttachments: globalAttachmentsEnt,
  orgMemberAttachments: orgMemberAttachmentsEnt,
});

export default schema;
export const entDefinitions = getEntDefinitions(schema);
