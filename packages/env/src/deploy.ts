import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    CLOUDFLARE_API_TOKEN: z.string().optional(),
    CONVEX_DEPLOY_KEY: z.string().optional(),
    CONVEX_SITE_URL: z.string().optional(),
    CONVEX_URL: z.string().optional(),
    SITE_URL: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
