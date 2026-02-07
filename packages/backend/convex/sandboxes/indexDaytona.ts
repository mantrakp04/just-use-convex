"use node";

import { Daytona, DaytonaNotFoundError } from "@daytonaio/sdk";
import { v } from "convex/values";
import { internalAction } from "../_generated/server";

let daytonaClient: Daytona | null = null;

function getDaytonaClient() {
  if (daytonaClient) {
    return daytonaClient;
  }

  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    throw new Error("DAYTONA_API_KEY is required to sync Convex sandboxes with Daytona");
  }

  daytonaClient = new Daytona({
    apiKey,
    ...(process.env.DAYTONA_API_URL ? { apiUrl: process.env.DAYTONA_API_URL } : {}),
    ...(process.env.DAYTONA_TARGET ? { target: process.env.DAYTONA_TARGET } : {}),
  });

  return daytonaClient;
}

export const provision = internalAction({
  args: {
    sandboxId: v.id("sandboxes"),
  },
  handler: async (_ctx, args) => {
    const sandboxName = args.sandboxId;
    const daytona = getDaytonaClient();

    try {
      await daytona.get(sandboxName);
      return;
    } catch (error) {
      if (!(error instanceof DaytonaNotFoundError)) {
        throw error;
      }
    }

    await daytona.create({
      name: sandboxName,
      language: "typescript",
      snapshot: "daytona-medium",
      labels: {
        convexSandboxId: sandboxName,
      },
    });
  },
});

export const destroy = internalAction({
  args: {
    sandboxId: v.id("sandboxes"),
  },
  handler: async (_ctx, args) => {
    const daytona = getDaytonaClient();

    try {
      const sandbox = await daytona.get(args.sandboxId);
      await sandbox.delete();
    } catch (error) {
      if (error instanceof DaytonaNotFoundError) {
        return;
      }
      throw error;
    }
  },
});
