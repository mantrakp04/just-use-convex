import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";

// ═══════════════════════════════════════════════════════════════════
// ORGANIZATION-LEVEL AGGREGATES
// ═══════════════════════════════════════════════════════════════════

// Total chat count per organization
export const chatsByOrg = new TableAggregate<{
  Key: string;
  DataModel: DataModel;
  TableName: "chats";
}>(components.chatsByOrg, {
  sortKey: (doc) => doc.organizationId,
});

// ═══════════════════════════════════════════════════════════════════
// MEMBER-LEVEL AGGREGATES
// ═══════════════════════════════════════════════════════════════════

// Count chats by member within an organization
export const chatsByMember = new TableAggregate<{
  Namespace: string; // organizationId
  Key: string; // memberId
  DataModel: DataModel;
  TableName: "chats";
}>(components.chatsByMember, {
  namespace: (doc) => doc.organizationId,
  sortKey: (doc) => doc.memberId,
});

// Export all aggregates for trigger registration
export const allChatAggregates = [chatsByOrg, chatsByMember];
