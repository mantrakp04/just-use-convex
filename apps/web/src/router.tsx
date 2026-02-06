import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { Spinner } from "@/components/ui/spinner";

import { routeTree } from "./routeTree.gen";
import { TokenClient } from "./lib/token-client";

export function getRouter() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  if (!convexUrl) {
    throw new Error("VITE_CONVEX_URL is not set");
  }

  const convexQueryClient = new ConvexQueryClient(convexUrl, {
    expectAuth: true,
  });

  const queryClient: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        gcTime: Infinity,
        staleTime: Infinity,
        refetchOnWindowFocus: true
      },
    },
  });
  convexQueryClient.connect(queryClient);

  const tokenClient = new TokenClient();

  // Set up persistence only on the client side
  if (typeof window !== "undefined") {
    const persister = createAsyncStoragePersister({
      storage: window.localStorage,
    });

    persistQueryClient({
      queryClient,
      persister,
      maxAge: Infinity,
    });
  }

  const router = createTanStackRouter({
    routeTree,
    defaultPreload: "intent",
    defaultPendingComponent: () => (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="size-5 animate-spin" />
      </div>
    ),
    defaultNotFoundComponent: () => (
      <div className="flex h-screen items-center justify-center">
        <div>Not Found</div>
      </div>
    ),
    context: { queryClient, convexQueryClient, tokenClient },
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
