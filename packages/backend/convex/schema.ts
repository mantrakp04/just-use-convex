import { defineEntSchema, getEntDefinitions } from "convex-ents";
import { todosEnt } from "./tables/todos";
import { todoAssignedUsersEnt } from "./tables/todoAssignedUsers";
import { chatsEnt } from "./tables/chats";
import { sandboxesEnt } from "./tables/sandboxes";

const schema = defineEntSchema({
  todos: todosEnt,
  todoAssignedUsers: todoAssignedUsersEnt,
  chats: chatsEnt,
  sandboxes: sandboxesEnt,
});

export default schema;
export const entDefinitions = getEntDefinitions(schema);
