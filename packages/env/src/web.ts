import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const viteEnvSchema = {
  VITE_CONVEX_URL: z.url(),
  VITE_CONVEX_SITE_URL: z.url(),
  VITE_SITE_URL: z.url().default("http://localhost:3001"),
  VITE_AGENT_URL: z.url().default("http://localhost:1337"),
  VITE_DEFAULT_MODEL: z.string().default("openai/gpt-5.2-chat"),
  VITE_TERMINAL_BACKGROUND: z.string().default("#0b0f19"),
  VITE_SANDBOX_MOUNT_PATH: z.string().default("/home/daytona"),
  VITE_SANDBOX_SSH_HOST: z.string().default("ssh.app.daytona.io"),
  VITE_PUBLIC_POSTHOG_KEY: z.string(),
  VITE_PUBLIC_POSTHOG_HOST: z.url(),
};

export const webEnv = createEnv({
  clientPrefix: "VITE_",
  client: viteEnvSchema,
  runtimeEnv: (import.meta as any).env,
  emptyStringAsUndefined: true,
});

export const serverEnv = createEnv({
  extends: [webEnv],
  server: {
    ALCHEMY_PASSWORD: z.string().optional(),
    VERCEL_ACCESS_TOKEN: z.string().optional(),
    VERCEL_GIT_REPO: z.string().default("mantrakp04/just-use-convex"),
    VERCEL_PROJECT_NAME: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
