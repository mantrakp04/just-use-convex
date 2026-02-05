import type { ConvexQueryClient } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { TokenClient } from "@/lib/token-client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import { ThemeProvider, ThemeScript } from "@/components/tweakcn-theme-provider";
import appCss from "../index.css?url";
import { Toaster } from "@/components/ui/sonner";
import { authClient } from "@/lib/auth-client";
import { getToken } from "@/lib/auth-server";
import { seo } from '@/utils/seo'

import Header from "../components/header";

const getAuth = createServerFn({ method: "GET" }).handler(async () => {
  return await getToken();
});

export interface RouterAppContext {
  queryClient: QueryClient;
  convexQueryClient: ConvexQueryClient;
  tokenClient: TokenClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Just Use Convex",
      },
      ...seo({
        title: "Just Use Convex",
        description: "Just Use Convex is a platform for building web applications with Convex and TanstackStart using best practices.",
        keywords: "Just Use Convex, Convex, React, TanstackStart, Best Practices",
        image: "/logo.svg",
      }),
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/logo.svg",
      }
    ]
  }),

  component: RootDocument,
  beforeLoad: async (ctx) => {
    const token = await getAuth();
    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token);
      ctx.context.tokenClient.setToken(token);
    }
    return {
      isAuthenticated: !!token,
      token,
    };
  },
});

function RootDocument() {
  const context = useRouteContext({ from: Route.id });
  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={authClient}
      initialToken={context.token}
    >
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <html lang="en" suppressHydrationWarning>
          <head>
            <HeadContent />
            <ThemeScript storageKey="theme" defaultTheme="system" attribute="class" enableSystem />
          </head>
          <body>
            <div className="grid h-svh grid-rows-[auto_1fr]">
              <Header />
              <Outlet />
            </div>
            <Toaster richColors />
            <TanStackRouterDevtools position="bottom-left" />
            <Scripts />
          </body>
        </html>
      </ThemeProvider>
    </ConvexBetterAuthProvider>
  );
}
