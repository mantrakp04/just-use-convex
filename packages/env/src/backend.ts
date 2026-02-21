import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { sharedEnv } from "./shared";

export const backendEnvSchema = {
  ...sharedEnv,
  MAX_VOLUME_READY_RETRIES: z.coerce.number().int().positive().default(10),
  JWKS: z.string(),
  SANDBOX_SNAPSHOT: z.string().default("daytona-medium"),
};

export const env = createEnv({
  server: backendEnvSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !process.env.JWKS,
});
