import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════
// ORGANIZATION-LEVEL AGGREGATES
// ═══════════════════════════════════════════════════════════════════

// Count todos by status within an organization
export const todosByStatus = new TableAggregate<{
  Namespace: string; // organizationId
  Key: string; // status
  DataModel: DataModel;
  TableName: "todos";
}>(components.todosByStatus, {
  namespace: (doc) => doc.organizationId,
  sortKey: (doc) => doc.status ?? "todo",
});

// Count todos by priority within an organization
export const todosByPriority = new TableAggregate<{
  Namespace: string;
  Key: string;
  DataModel: DataModel;
  TableName: "todos";
}>(components.todosByPriority, {
  namespace: (doc) => doc.organizationId,
  sortKey: (doc) => doc.priority ?? "medium",
});

// Total count per organization
export const todosByOrg = new TableAggregate<{
  Key: string;
  DataModel: DataModel;
  TableName: "todos";
}>(components.todosByOrg, {
  sortKey: (doc) => doc.organizationId,
});

// ═══════════════════════════════════════════════════════════════════
// TEAM-LEVEL AGGREGATES
// ═══════════════════════════════════════════════════════════════════

// Count todos by team (composite key: [orgId, teamId])
export const todosByTeam = new TableAggregate<{
  Key: [string, string]; // [orgId, teamId]
  DataModel: DataModel;
  TableName: "todos";
}>(components.todosByTeam, {
  sortKey: (doc) => [doc.organizationId, doc.teamId ?? "none"],
});

// Count todos by status within a team
export const todosByTeamStatus = new TableAggregate<{
  Namespace: string; // orgId:teamId composite
  Key: string; // status
  DataModel: DataModel;
  TableName: "todos";
}>(components.todosByTeamStatus, {
  namespace: (doc) => `${doc.organizationId}:${doc.teamId ?? "none"}`,
  sortKey: (doc) => doc.status ?? "todo",
});

// ═══════════════════════════════════════════════════════════════════
// USER-LEVEL AGGREGATES
// ═══════════════════════════════════════════════════════════════════

// Count todos created by member (within org)
export const todosByCreator = new TableAggregate<{
  Namespace: string; // organizationId
  Key: string; // memberId (creator)
  DataModel: DataModel;
  TableName: "todos";
}>(components.todosByCreator, {
  namespace: (doc) => doc.organizationId,
  sortKey: (doc) => doc.memberId,
});

// Count todos by creator and status
export const todosByCreatorStatus = new TableAggregate<{
  Namespace: string; // orgId:memberId composite
  Key: string; // status
  DataModel: DataModel;
  TableName: "todos";
}>(components.todosByCreatorStatus, {
  namespace: (doc) => `${doc.organizationId}:${doc.memberId}`,
  sortKey: (doc) => doc.status ?? "todo",
});

// Export all aggregates for trigger registration
export const allTodoAggregates = [
  todosByStatus,
  todosByPriority,
  todosByOrg,
  todosByTeam,
  todosByTeamStatus,
  todosByCreator,
  todosByCreatorStatus,
];
