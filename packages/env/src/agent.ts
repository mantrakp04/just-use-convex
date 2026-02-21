import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { sharedEnv } from "./shared";

export const env = createEnv({
  server: {
    ...sharedEnv,
    ALCHEMY_PASSWORD: z.string().optional(),
    COMPOSIO_API_KEY: z.string().optional(),
    CONVEX_SITE_URL: z.string().optional(),
    CONVEX_URL: z.string().optional(),
    MAX_BACKGROUND_DURATION_MS: z.coerce.number().default(3_600_000),
    VOLTAGENT_PUBLIC_KEY: z.string().optional(),
    VOLTAGENT_SECRET_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
