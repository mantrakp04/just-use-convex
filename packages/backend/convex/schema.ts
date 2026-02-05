import { defineEntSchema, getEntDefinitions } from "convex-ents";
import { todosEnt } from "./tables/todos";
import { todoAssignedMembersEnt } from "./tables/todoAssignedMembers";
import { chatsEnt } from "./tables/chats";
import { sandboxesEnt } from "./tables/sandboxes";

const schema = defineEntSchema({
  todos: todosEnt,
  todoAssignedMembers: todoAssignedMembersEnt,
  chats: chatsEnt,
  sandboxes: sandboxesEnt,
});

export default schema;
export const entDefinitions = getEntDefinitions(schema);
