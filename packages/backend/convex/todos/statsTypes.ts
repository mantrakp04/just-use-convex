import { todosZodSchema } from "../tables/todos";

// Infer teamId type from todos schema
export const TeamStatsArgs = {
  teamId: todosZodSchema.teamId,
};

// Infer memberId type from todos schema
export const UserStatsArgs = {
  memberId: todosZodSchema.memberId.optional(),
};
