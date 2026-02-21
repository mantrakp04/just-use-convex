import { z } from "zod";

export const sharedServerEnv = {
  AGENT_URL: z.string().default("http://localhost:1337"),
  DAYTONA_API_KEY: z.string().optional(),
  DAYTONA_API_URL: z.url().default("https://app.daytona.io/api"),
  DAYTONA_TARGET: z.string().default("us"),
  EXTERNAL_TOKEN: z.string().default("meow"),
  SANDBOX_INACTIVITY_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(2),
  SANDBOX_VOLUME_MOUNT_PATH: z.string().default("/home/daytona"),
  SITE_URL: z.url().default("http://localhost:3001"),
};
