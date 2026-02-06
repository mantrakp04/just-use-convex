import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import alchemy from "alchemy/cloudflare/tanstack-start"
import mdx from 'fumadocs-mdx/vite';
import * as MdxConfig from './source.config';

export default defineConfig({
  plugins: [mdx(MdxConfig), tsconfigPaths(), tailwindcss(), alchemy(), tanstackStart(), viteReact()],
  server: {
    port: 3001,
  },
  build: {
    minify: false,
    sourcemap: true,
  },
  ssr: {
    noExternal: ["@convex-dev/better-auth"],
  },
});
