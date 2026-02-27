import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { env as sharedEnv } from "./shared";

const backendEnvSchema = {
  JWKS: z.string(),
};

export const env = createEnv({
  server: backendEnvSchema,
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  extends: [sharedEnv],
  skipValidation: !process.env.JWKS,
});
