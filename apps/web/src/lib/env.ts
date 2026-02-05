export const env = {
  VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
  VITE_CONVEX_SITE_URL: import.meta.env.VITE_CONVEX_SITE_URL,
  VITE_SITE_URL: import.meta.env.VITE_SITE_URL ?? "http://localhost:3001",
  VITE_AGENT_URL: import.meta.env.VITE_AGENT_URL ?? "http://localhost:1337",
  VITE_DEFAULT_MODEL: import.meta.env.VITE_DEFAULT_MODEL ?? "openai/gpt-5.2-chat",
};
