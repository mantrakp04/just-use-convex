import { useAtom } from "jotai";
import { createFileRoute } from "@tanstack/react-router";
import { Github } from "lucide-react";
import { env } from "@just-use-convex/env/web";
import { ThemePicker } from "@/components/tweakcn-theme-picker";
import { HeroScene } from "@/components/hero-scene";
import { Switcher } from "@/components/hero-scene/switcher";
import { heroSceneAtom } from "@/store/hero";
import { useHealthCheck } from "@/hooks/use-health-check";
import { BouncingText } from "@/components/hero-scene/bouncing-text";
import { MatrixRain } from "@/components/hero-scene/matrix-rain";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { GithubHoverContent } from "@/components/github-hover-card";

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
  const healthCheck = useHealthCheck();
  const [activeScene, setActiveScene] = useAtom(heroSceneAtom);

  return (
    <>
      <div className="fixed inset-0 z-0 h-svh w-full pointer-events-none">
        <HeroScene activeScene={activeScene} />
      </div>
      <div className="fixed inset-0 z-1 h-svh w-full pointer-events-none bg-background/67" />
      
      {activeScene === "dvd" && <BouncingText text={TITLE_TEXT} />}
      {activeScene === "matrix" && <MatrixRain />}

      <div className="container relative z-10 mx-auto flex w-4xl flex-col gap-2 p-2 pointer-events-none">
        <pre className={`overflow-x-auto font-mono text-xs transition-opacity ${activeScene === "dvd" ? "opacity-0" : "opacity-100"}`}>
          {TITLE_TEXT}
        </pre>
        <div className="flex flex-col gap-2 pointer-events-auto">
          <section className="flex flex-col gap-1 rounded-lg border p-2 backdrop-blur-md">
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
          <section className="flex flex-row gap-1 rounded-lg border p-2 justify-between items-center backdrop-blur-md">
            <div className="flex gap-2 items-center">
              <HoverCard>
                <HoverCardTrigger
                  render={
                    <a
                      href={`https://github.com/${env.VITE_GITHUB_REPO}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      aria-label="GitHub"
                    />
                  }
                >
                  <Github className="size-5" />
                </HoverCardTrigger>
                <HoverCardContent side="top" align="start" className="w-80">
                  <GithubHoverContent />
                </HoverCardContent>
              </HoverCard>
              <a
                href={`https://x.com/${env.VITE_TWITTER_HANDLE}`}
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
      <Switcher activeScene={activeScene} onSceneChange={setActiveScene} />
    </>
  );
}
