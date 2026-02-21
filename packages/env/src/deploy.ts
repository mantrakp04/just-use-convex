import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { sharedServerEnv } from "./shared";

export const env = createEnv({
  server: {
    ...sharedServerEnv,
    ALCHEMY_CI_STATE_STORE_CHECK: z
      .enum(["true", "false"])
      .default("false"),
    ALCHEMY_PASSWORD: z.string().optional(),
    ALCHEMY_STAGE: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().optional(),
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    CLOUDFLARE_API_KEY: z.string().optional(),
    CLOUDFLARE_API_TOKEN: z.string().optional(),
    COMPOSIO_API_KEY: z.string().optional(),
    EXA_API_KEY: z.string().optional(),
    CONVEX_PREVIEW_NAME: z.string().optional(),
    IS_PREVIEW: z
      .string()
      .optional()
      .transform((value) => value === "true"),
    MAX_VOLUME_READY_RETRIES: z.coerce.number().int().positive().default(10),
    SANDBOX_SNAPSHOT: z.string().optional(),
    SITE_URL: z.url().default("http://localhost:3001"),
    VERCEL_ENV: z
      .enum(["preview", "production", "development"])
      .optional(),
    VERCEL_GIT_COMMIT_REF: z.string().optional(),
    VERCEL_BRANCH_URL: z.string().optional(),
    VERCEL_URL: z.string().optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
    VITE_AGENT_URL: z.url().default("http://localhost:1337"),
    VITE_CONVEX_URL: z.url().optional(),
    VITE_CONVEX_SITE_URL: z.url().optional(),
    VOLTAGENT_PUBLIC_KEY: z.string().optional(),
    VOLTAGENT_SECRET_KEY: z.string().optional(),
    CONVEX_URL: z.url().optional(),
    CONVEX_SITE_URL: z.url().optional(),
    DAYTONA_API_URL: z.url().default("https://app.daytona.io/api"),
    DAYTONA_TARGET: z.string().default("us"),
    EXTERNAL_TOKEN: z.string().default("meow"),
    MAX_BACKGROUND_DURATION_MS: z.coerce.number().default(3_600_000),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
