import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import convexPlugin from "@convex-dev/eslint-plugin";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import prettierPlugin from "eslint-plugin-prettier";
import sonarjsPlugin from "eslint-plugin-sonarjs";
import unusedImportsPlugin from "eslint-plugin-unused-imports";

const convexRecommendedConfig = convexPlugin.configs.recommended[0];

export default defineConfig([
  {
    ignores: [
      "**/.turbo/**",
      "**/.output/**",
      "**/.source/**",
      "**/build/**",
      "**/coverage/**",
      "**/dist/**",
      "**/.alchemy/**",
      "**/node_modules/**",
      "**/convex/_generated/**",
      "**/convex/betterAuth/_generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        projectService: true,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      import: importPlugin,
      prettier: prettierPlugin,
      sonarjs: sonarjsPlugin,
      "unused-imports": unusedImportsPlugin,
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
          message:
            "Avoid `as unknown` assertions. Prefer a safer typing approach.",
        },
        {
          selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword']",
          message:
            "Avoid `as any` assertions. Prefer a safer typing approach.",
        },
      ],
    },
  },
  prettierConfig,
  {
    files: ["packages/backend/convex/**/*.{js,ts}"],
    ...convexRecommendedConfig,
    languageOptions: {
      ...(convexRecommendedConfig.languageOptions ?? {}),
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "@convex-dev": convexPlugin,
    },
    rules: {
      ...(convexRecommendedConfig.rules ?? {}),
    },
  },
]);
