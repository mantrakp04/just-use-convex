import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    AGENT_URL: z.string().default("http://localhost:1337"),
    DAYTONA_API_KEY: z.string(),
    DAYTONA_API_URL: z.url().default("https://app.daytona.io/api"),
    DAYTONA_TARGET: z.string().default("us"),
    EXTERNAL_TOKEN: z.string().default("meow"),
    MAX_VOLUME_READY_RETRIES: z.coerce.number().int().positive().default(10),
    JWKS: z.string(),
    SANDBOX_INACTIVITY_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(2),
    SANDBOX_SNAPSHOT: z.string().default("daytona-medium"),
    SANDBOX_VOLUME_MOUNT_PATH: z.string().default("/home/daytona"),
    SITE_URL: z.url().default("http://localhost:3001"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
