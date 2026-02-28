import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { env as sharedEnv } from "./shared";

export const env = createEnv({
  server: {
    ALCHEMY_PASSWORD: z.string().optional(),
    CONVEX_SITE_URL: z.string().min(1),
    CONVEX_URL: z.string().min(1),
    MAX_TOOL_DURATION_MS: z.coerce.number().default(600_000),
    MAX_BACKGROUND_DURATION_MS: z.coerce.number().default(3_600_000),
    BACKGROUND_TASK_POLL_INTERVAL_MS: z.coerce.number().default(3_000),
    VOLTAGENT_PUBLIC_KEY: z.string().optional(),
    VOLTAGENT_SECRET_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  extends: [sharedEnv],
  // Skip validation when env vars aren't populated yet (e.g. Alchemy deploy before Convex deploy)
  skipValidation: !process.env.CONVEX_URL,
});
