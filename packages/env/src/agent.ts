import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ALCHEMY_PASSWORD: z.string().optional(),
    COMPOSIO_API_KEY: z.string().default(""),
    CONVEX_SITE_URL: z.url(),
    CONVEX_URL: z.url(),
    DAYTONA_API_KEY: z.string().default(""),
    DAYTONA_API_URL: z.url().default("https://app.daytona.io/api"),
    DAYTONA_TARGET: z.string().default("us"),
    DEFAULT_MODEL: z.string().default("openai/gpt-5.2-chat"),
    EXA_API_KEY: z.string().default(""),
    EXTERNAL_TOKEN: z.string().default("meow"),
    MAX_BACKGROUND_DURATION_MS: z.coerce.number().default(3_600_000),
    OPENROUTER_API_KEY: z.string().min(1),
    SITE_URL: z.url().default("http://localhost:3001"),
    VOLTAGENT_PUBLIC_KEY: z.string().default(""),
    VOLTAGENT_SECRET_KEY: z.string().default(""),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
