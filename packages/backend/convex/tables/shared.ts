import { z } from "zod";

export const executionStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "idle",
]);