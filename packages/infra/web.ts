import alchemy from "alchemy";
import "alchemy/cloudflare";
import { Project, type EnvironmentVariable } from "alchemy/vercel";
import { serverEnv, webEnv } from "@just-use-convex/env/web";

const VERCEL_ENV_TARGETS: ("production" | "preview" | "development")[] = [
  "production",
  "preview"
];

const app = await alchemy("just-use-convex-web", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: serverEnv.ALCHEMY_PASSWORD,
});

export const project = await Project("vercel-project", {
  accessToken: alchemy.secret(serverEnv.VERCEL_ACCESS_TOKEN),
  name: serverEnv.VERCEL_PROJECT_NAME,
  rootDirectory: "apps/web",
  gitRepository: {
    type: "github",
    repo: serverEnv.VERCEL_GIT_REPO,
  },
  environmentVariables: inferFrontendEnvironmentVariables(),
});

await app.finalize();

function inferFrontendEnvironmentVariables(): EnvironmentVariable[] {
  return Object.entries(webEnv)
    .map(([key, value]) => ({
      key,
      target: VERCEL_ENV_TARGETS,
      value,
    }));
}
