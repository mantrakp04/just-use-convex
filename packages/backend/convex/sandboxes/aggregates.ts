import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════
// ORGANIZATION-LEVEL AGGREGATES
// ═══════════════════════════════════════════════════════════════════

// Total sandbox count per organization
export const sandboxesByOrg = new TableAggregate<{
  Key: string;
  DataModel: DataModel;
  TableName: "sandboxes";
}>(components.sandboxesByOrg, {
  sortKey: (doc) => doc.organizationId,
});

// ═══════════════════════════════════════════════════════════════════
// USER-LEVEL AGGREGATES
// ═══════════════════════════════════════════════════════════════════

// Count sandboxes by user within an organization
export const sandboxesByUser = new TableAggregate<{
  Namespace: string; // organizationId
  Key: string; // userId
  DataModel: DataModel;
  TableName: "sandboxes";
}>(components.sandboxesByUser, {
  namespace: (doc) => doc.organizationId,
  sortKey: (doc) => doc.userId,
});

// Export all aggregates for trigger registration
export const allSandboxAggregates = [sandboxesByOrg, sandboxesByUser];
