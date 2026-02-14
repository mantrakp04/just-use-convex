import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "@convex/shared/auth";

export const authClient = createAuthClient({
  plugins: [
    convexClient(),
    organizationClient({
      ac,
      roles,
      teams: {
        enabled: true,
      },
    }),
  ],
});
