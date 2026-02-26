import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { sharedEnv } from "./shared";

export const backendEnvSchema = {
  ...sharedEnv,
  JWKS: z.string(),
};

export const env = createEnv({
  server: backendEnvSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: !process.env.JWKS,
});
