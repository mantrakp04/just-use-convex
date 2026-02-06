import alchemy from "alchemy";
import { TanStackStart } from "alchemy/cloudflare";

const app = await alchemy("just-use-convex-web", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: process.env.ALCHEMY_PASSWORD,
});

const convexUrl = process.env.VITE_CONVEX_URL;
const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL;

if (!convexUrl || !convexSiteUrl) {
  throw new Error("VITE_CONVEX_URL and VITE_CONVEX_SITE_URL are required");
}

export const website = await TanStackStart("website", {
  name: `${app.name}-${app.stage}-website`,
  bindings: {
    VITE_CONVEX_URL: alchemy.env("VITE_CONVEX_URL"),
    VITE_CONVEX_SITE_URL: alchemy.env("VITE_CONVEX_SITE_URL"),
    VITE_SITE_URL: alchemy.env("VITE_SITE_URL", "http://localhost:3001"),
    VITE_AGENT_URL: alchemy.env("VITE_AGENT_URL", "http://localhost:1337"),
    VITE_DEFAULT_MODEL: alchemy.env("VITE_DEFAULT_MODEL", "openai/gpt-5.2-chat"),
  },
  adopt: true,
  dev: {
    command: "vite dev --port 3001 --host",
  },
});

console.log({ url: website.url });

await app.finalize();
