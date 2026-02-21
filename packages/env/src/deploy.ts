import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ALCHEMY_CI_STATE_STORE_CHECK: z.string().optional(),
    ALCHEMY_PASSWORD: z.string().optional(),
    ALCHEMY_STAGE: z.string().optional(),
    BETTER_AUTH_SECRET: z.string().optional(),
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    CLOUDFLARE_API_TOKEN: z.string().optional(),
    CONVEX_DEPLOY_KEY: z.string().optional(),
    CONVEX_PREVIEW_NAME: z.string().optional(),
    CONVEX_SITE_URL: z.preprocess(
      (value) => value ?? process.env.VITE_CONVEX_SITE_URL,
      z.string().optional(),
    ),
    CONVEX_URL: z.preprocess(
      (value) => value ?? process.env.VITE_CONVEX_URL,
      z.string().optional(),
    ),
    EXTERNAL_TOKEN: z.string().optional(),
    JWKS: z.string().optional(),
    SITE_URL: z.preprocess(
      (value) =>
        value ??
        (process.env.VERCEL_BRANCH_URL
          ? `https://${process.env.VERCEL_BRANCH_URL}`
          : process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : undefined),
      z.string().optional(),
    ),
    VERCEL_BRANCH_URL: z.string().optional(),
    VERCEL_ENV: z.string().optional(),
    VERCEL_GIT_COMMIT_REF: z.string().optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
    VERCEL_URL: z.string().optional(),
    VITE_CONVEX_SITE_URL: z.preprocess(
      (value) => value ?? process.env.CONVEX_SITE_URL,
      z.string().optional(),
    ),
    VITE_CONVEX_URL: z.preprocess(
      (value) => value ?? process.env.CONVEX_URL,
      z.string().optional(),
    ),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
