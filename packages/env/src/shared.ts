import { z } from "zod";
import { createEnv } from "@t3-oss/env-core";

/** Strict validation — used by deploy.ts to gate deploys */
export const sharedRequiredEnv = {
  DAYTONA_API_KEY: z.string().min(1),
  EXA_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
};

const sharedEnv = {
  DAYTONA_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  AGENT_URL: z.string().default("http://localhost:1337"),
  DAYTONA_API_URL: z.url().default("https://app.daytona.io/api"),
  DAYTONA_TARGET: z.string().default("us"),
  EXTERNAL_TOKEN: z.string().default("meow"),
  SANDBOX_INACTIVITY_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(2),
  SANDBOX_VOLUME_MOUNT_PATH: z.string().default("/home/daytona"),
  SANDBOX_SNAPSHOT: z.string().default("daytona-medium"),
  SITE_URL: z.url().default("http://localhost:3001"),
};

export const env = createEnv({
  server: sharedEnv,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
