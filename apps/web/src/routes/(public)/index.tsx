import { api } from "@just-use-convex/backend/convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { ThemePicker } from "@/components/tweakcn-theme-picker";
import { HeroScene } from "@/components/HeroScene";

export const Route = createFileRoute("/(public)/")({
  component: HomeComponent,
});

const TITLE_TEXT = `
      ██╗██╗   ██╗███████╗████████╗    ██╗   ██╗███████╗███████╗     ██████╗ ██████╗ ███╗   ██╗██╗   ██╗███████╗██╗  ██╗
      ██║██║   ██║██╔════╝╚══██╔══╝    ██║   ██║██╔════╝██╔════╝    ██╔════╝██╔═══██╗████╗  ██║██║   ██║██╔════╝╚██╗██╔╝
      ██║██║   ██║███████╗   ██║       ██║   ██║███████╗█████╗      ██║     ██║   ██║██╔██╗ ██║██║   ██║█████╗   ╚███╔╝
 ██   ██║██║   ██║╚════██║   ██║       ██║   ██║╚════██║██╔══╝      ██║     ██║   ██║██║╚██╗██║╚██╗ ██╔╝██╔══╝   ██╔██╗
 ╚█████╔╝╚██████╔╝███████║   ██║       ╚██████╔╝███████║███████╗    ╚██████╗╚██████╔╝██║ ╚████║ ╚████╔╝ ███████╗██╔╝ ██╗
  ╚════╝  ╚═════╝ ╚══════╝   ╚═╝        ╚═════╝ ╚══════╝╚══════╝     ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝  ╚═══╝  ╚══════╝╚═╝  ╚═╝
 `;

function HomeComponent() {
  const healthCheck = useSuspenseQuery(convexQuery(api.healthCheck.get, {}));

  return (
    <>
      <div className="fixed inset-0 z-0 h-svh w-full pointer-events-none">
        <HeroScene />
      </div>
      <div className="fixed inset-0 z-[1] h-svh w-full pointer-events-none bg-background/80" />
      <div className="container relative z-10 mx-auto flex w-4xl flex-col gap-2 p-2">
        <pre className="overflow-x-auto font-mono text-xs">{TITLE_TEXT}</pre>
        <div className="flex flex-col gap-2">
          <section className="flex flex-col gap-1 rounded-lg border p-2 backdrop-blur-sm">
            <h2 className="font-medium">API Status</h2>
            <div className="flex items-center gap-1">
              <div
                className={`h-2 w-2 rounded-full ${healthCheck.data === "OK" ? "bg-green-500" : "bg-red-500"}`}
              />
              <span className="text-muted-foreground text-sm">
                {healthCheck.data === "OK" ? "Connected" : "Error"}
              </span>
            </div>
          </section>
          <section className="flex flex-row gap-1 rounded-lg border p-2 justify-between items-center backdrop-blur-sm">
            <div className="flex gap-2 items-center">
              <a
                href="https://github.com/mantrakp04/just-use-convex"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="GitHub"
              >
                <Github className="size-5" />
              </a>
              <a
                href="https://x.com/barre_of_lube"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="X"
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
            <ThemePicker />
          </section>
        </div>
      </div>
    </>
  );
}
