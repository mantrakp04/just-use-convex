import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    AGENT_URL: z.string().default("http://localhost:1337"),
    DAYTONA_API_KEY: z.string().optional(),
    DAYTONA_API_URL: z.url().default("https://app.daytona.io/api"),
    DAYTONA_TARGET: z.string().default("us"),
    EXTERNAL_TOKEN: z.string().default("meow"),
    JWKS: z.string().optional(),
    SITE_URL: z.url().default("http://localhost:3001"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
