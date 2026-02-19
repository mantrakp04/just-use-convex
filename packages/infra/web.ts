import alchemy from "alchemy";
import { Project } from "alchemy/vercel";
import { serverEnv } from "@just-use-convex/env/web";

const VERCEL_ENV_TARGETS: ("production" | "preview" | "development")[] = [
  "production",
  "preview"
];

const app = await alchemy("just-use-convex-web", {
  phase: process.argv.includes("--destroy") ? "destroy" : "up",
  password: serverEnv.ALCHEMY_PASSWORD,
});

export const project = await Project("web", {
  accessToken: alchemy.secret(serverEnv.VERCEL_ACCESS_TOKEN),
  name: serverEnv.VERCEL_PROJECT_NAME,
  rootDirectory: "apps/web",
  gitRepository: {
    type: "github",
    repo: serverEnv.VERCEL_GIT_REPO,
  },
  environmentVariables: inferViteEnvironmentVariables(),
});

await app.finalize();

function inferViteEnvironmentVariables() {
  return Object.entries(serverEnv)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({
      key,
      target: VERCEL_ENV_TARGETS,
      value,
    }));
}
