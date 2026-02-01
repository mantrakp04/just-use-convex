# CLAUDE.md

## Project Overview
AI-powered chat SaaS template — multi-tenant, real-time, with org/team support. Uses Cloudflare Agents for WebSocket chat state, Convex for reactive backend, TanStack Start for SSR.

## Tech Stack
| Layer | Stack |
|-------|-------|
| **Frontend** | React 19, TanStack Start/Router/Query, Tailwind v4, shadcn/ui (base-mira), Jotai |
| **Backend** | Convex, Convex Ents (relationships), Better Auth (org plugin) |
| **Agent** | Cloudflare Workers, AI SDK, OpenRouter |
| **Build** | Turborepo, Bun, Vite 7 |

## Monorepo Structure
```
apps/web/          # TanStack Start frontend + Fumadocs
packages/agent/    # Cloudflare Workers AI agent
packages/backend/  # Convex backend
packages/config/   # Shared TS config
packages/env/      # T3 Env type-safe env vars
```

## Commands
```bash
bun run dev        # Start everything
bun run build      # Production build
turbo dev          # Turborepo dev
```

## Working Style

**Be concise and direct.** No fluff.

**Debugging:**
- Add minimal, structured logs with prefixes: `[module:action]`
- Don't spam the console
- Identify root cause through precise logging

**Performance:**
- Prefer memoization over throttling
- Isolate streaming state from static components
- Use `React.memo` strategically for message lists

**Animations:**
- Keep under 300ms
- Reference `skills/emilkowal-animations` for timing/easing

## Key Patterns

### Backend (Convex)
Each table follows this structure:
```
tables/tableName.ts    # Zod schema + Ents definition
tableName/types.ts     # Input/output Zod schemas
tableName/functions.ts # Pure business logic
tableName/index.ts     # zQuery/zMutation exports
tableName/aggregates.ts # Stats/triggers
```

Custom `zQuery`/`zMutation` wrappers inject auth context (`identity.userId`, `activeOrganizationId`, `activeTeamId`) and ents table access.

### Frontend Hooks
Wrap TanStack Query + Convex:
```typescript
export function useChats() {
  const createMutation = useMutation({
    mutationFn: useConvexMutation(api.chats.index.create),
    onSuccess: () => toast.success("Chat created"),
  });
  return { createChat: createMutation.mutateAsync };
}
```

### Routing
File-based TanStack Router:
- `(public)/` — unauthenticated routes
- `(protected)/` — wrapped in `<AuthBoundary>`

### Path Aliases
```
@/*        → ./src/*
@convex/*  → ../../packages/backend/convex/*
```

## Skills to Reference
- `emilkowal-animations` — animation timing/easing best practices
- `vercel-react-best-practices` — re-render optimization patterns

## Common Issues

| Issue | Fix |
|-------|-----|
| Vite 504 (Outdated Optimize Dep) | Restart dev server |
| CORS with OpenRouter | Use server-side proxy |
| Streaming disconnects on nav | Implement graceful reconnection |
| Message list re-renders | Isolate streaming component, memoize aggressively |

## UI Notes
- Don't use base UI wrappers — modify raw components directly
- Shadow preference: `inset 0 3px 0 0 rgb(0 0 0 / 0.2)`
- Animation timing matters — if it feels slow, it probably is
