import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CONVEX_URL: z.url(),
    VITE_CONVEX_SITE_URL: z.url(),
    VITE_AGENT_URL: z.url().default("http://localhost:1337"),
    VITE_TERMINAL_BACKGROUND: z.string().default("#0b0f19"),
    VITE_SANDBOX_MOUNT_PATH: z.string().default("/home/daytona"),
    VITE_SANDBOX_SSH_HOST: z.string().default("ssh.app.daytona.io"),
    VITE_PUBLIC_POSTHOG_KEY: z.string().optional(),
    VITE_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
    VITE_GITHUB_REPO: z.string().default("mantrakp04/just-use-convex"),
    VITE_TWITTER_HANDLE: z.string().default("barre_of_lube"),
  },
  runtimeEnv: (import.meta as any).env,
  emptyStringAsUndefined: true,
});
