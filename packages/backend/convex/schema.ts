import { defineEntSchema, getEntDefinitions } from "convex-ents";
import { todosEnt } from "./tables/todos";

const schema = defineEntSchema({
  todos: todosEnt,
});

export default schema;
export const entDefinitions = getEntDefinitions(schema);
