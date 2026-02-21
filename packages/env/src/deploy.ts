import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { sharedRequiredEnv } from "./shared";

export const env = createEnv({
  server: {
    ...sharedRequiredEnv,
    CLOUDFLARE_API_TOKEN: z.string().min(1),
    CONVEX_DEPLOY_KEY: z.string().min(1),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
