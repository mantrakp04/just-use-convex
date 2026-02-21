import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { sharedEnv } from "./shared";

export const env = createEnv({
  server: {
    ...sharedEnv,
    MAX_VOLUME_READY_RETRIES: z.coerce.number().int().positive().default(10),
    JWKS: z.string().optional(),
    SANDBOX_SNAPSHOT: z.string().default("daytona-medium"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
