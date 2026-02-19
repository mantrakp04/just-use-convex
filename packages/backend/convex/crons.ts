import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("workflow-scheduler", { minutes: 1 }, internal.workflows.scheduler.tick);

export default crons;
