import { z } from "zod";

/** Strict validation — used by deploy.ts to gate deploys */
export const sharedRequiredEnv = {
  DAYTONA_API_KEY: z.string().min(1),
  EXA_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
};

/** Runtime-safe validation — optional so Convex evaluate_push doesn't crash */
export const sharedRuntimeEnv = {
  DAYTONA_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
};

export const sharedEnv = {
  ...sharedRuntimeEnv,
  AGENT_URL: z.string().default("http://localhost:1337"),
  DAYTONA_API_URL: z.url().default("https://app.daytona.io/api"),
  DAYTONA_TARGET: z.string().default("us"),
  EXTERNAL_TOKEN: z.string().default("meow"),
  SANDBOX_INACTIVITY_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(2),
  SANDBOX_VOLUME_MOUNT_PATH: z.string().default("/home/daytona"),
  SITE_URL: z.url().default("http://localhost:3001"),
};
