import { api } from "@just-use-convex/backend/convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";

export function useHealthCheck() {
  return useSuspenseQuery(convexQuery(api.healthCheck.get, {}));
}
