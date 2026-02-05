import betterAuth from "./betterAuth/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(betterAuth);
app.use(migrations);

// Organization-level aggregates
app.use(aggregate, { name: "todosByStatus" });
app.use(aggregate, { name: "todosByPriority" });
app.use(aggregate, { name: "todosByOrg" });

// Team-level aggregates
app.use(aggregate, { name: "todosByTeam" });
app.use(aggregate, { name: "todosByTeamStatus" });

// Member-level aggregates
app.use(aggregate, { name: "todosByCreator" });
app.use(aggregate, { name: "todosByCreatorStatus" });

// Chat aggregates
app.use(aggregate, { name: "chatsByOrg" });
app.use(aggregate, { name: "chatsByMember" });

// Sandbox aggregates
app.use(aggregate, { name: "sandboxesByOrg" });
app.use(aggregate, { name: "sandboxesByUser" });

export default app;
