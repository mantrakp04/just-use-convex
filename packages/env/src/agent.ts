import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { sharedServerEnv } from "./shared";

export const env = createEnv({
  server: {
    ...sharedServerEnv,
    ALCHEMY_PASSWORD: z.string().optional(),
    COMPOSIO_API_KEY: z.string().default(""),
    CONVEX_SITE_URL: z.url(),
    CONVEX_URL: z.url(),
    DAYTONA_API_KEY: z.string().default(""),
    EXA_API_KEY: z.string().default(""),
    MAX_BACKGROUND_DURATION_MS: z.coerce.number().default(3_600_000),
    VOLTAGENT_PUBLIC_KEY: z.string().default(""),
    VOLTAGENT_SECRET_KEY: z.string().default(""),
    OPENROUTER_API_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
