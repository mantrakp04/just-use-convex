import type { AuthConfig } from "convex/server";

import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import { env } from "@just-use-convex/env/backend";

export default {
  providers: [getAuthConfigProvider({ jwks: env.JWKS })],
} satisfies AuthConfig;
