import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from 'nitro/vite'
import mdx from 'fumadocs-mdx/vite';
import * as MdxConfig from './source.config';
import dotenv from 'dotenv';
import { resolve } from 'node:path';

// Load root .env — map canonical names to VITE_ prefix for client exposure.
// dotenv won't override existing process.env (CI vars take precedence).
dotenv.config({ path: resolve(import.meta.dirname, '../../.env') });

const envMap: Record<string, string> = {
  CONVEX_URL: 'VITE_CONVEX_URL',
  CONVEX_SITE_URL: 'VITE_CONVEX_SITE_URL',
  AGENT_URL: 'VITE_AGENT_URL',
};

for (const [from, to] of Object.entries(envMap)) {
  if (process.env[from] && !process.env[to]) {
    process.env[to] = process.env[from];
  }
}

export default defineConfig({
  plugins: [mdx(MdxConfig), tsconfigPaths(), tailwindcss(), tanstackStart(), viteReact(), nitro({ preset: 'vercel'})],
  server: {
    port: 3001,
  },
  build: {
    minify: false,
    sourcemap: false,
  },
  ssr: {
    noExternal: ["@convex-dev/better-auth"],
  },
});
