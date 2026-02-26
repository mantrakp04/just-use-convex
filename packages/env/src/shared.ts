import { z } from "zod";

/** Strict validation — used by deploy.ts to gate deploys */
export const sharedRequiredEnv = {
  DAYTONA_API_KEY: z.string().min(1),
  EXA_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
};

export const sharedEnv = {
  ...sharedRequiredEnv,
  AGENT_URL: z.string().default("http://localhost:1337"),
  DAYTONA_API_URL: z.url().default("https://app.daytona.io/api"),
  DAYTONA_TARGET: z.string().default("us"),
  EXTERNAL_TOKEN: z.string().default("meow"),
  SANDBOX_INACTIVITY_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(2),
  SANDBOX_VOLUME_MOUNT_PATH: z.string().default("/home/daytona"),
  SITE_URL: z.url().default("http://localhost:3001"),

  SANDBOX_MAX_START_RETRIES: z.coerce.number().int().positive().default(3),
  SANDBOX_START_RETRY_DELAY_MS: z.coerce.number().int().positive().default(1000),
  SANDBOX_VOLUME_READY_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  SANDBOX_SNAPSHOT: z.string().default("daytona-medium"),
  SANDBOX_MAX_VOLUME_READY_RETRIES: z.coerce.number().int().positive().default(10),
};
