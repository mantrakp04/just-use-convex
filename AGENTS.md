# AGENTS.md

## Project Overview
AI-powered chat SaaS template — multi-tenant, real-time, with org/team support. Cloudflare Agents for WebSocket chat state, Convex for reactive backend, TanStack Start for SSR.

## Tech Stack
| Layer | Stack |
|-------|-------|
| **Runtime** | Bun |
| **Frontend** | React 19, TanStack Start/Router/Query, Tailwind v4, shadcn/ui (base-mira), Jotai |
| **Backend** | Convex, Convex Ents (relationships), Better Auth (org plugin) |
| **Agent** | Cloudflare Workers, Durable Objects, AI SDK, OpenRouter |
| **Build** | Turborepo, Vite 7 |

## Monorepo Structure
```
apps/web/              # TanStack Start frontend + Fumadocs
  src/
    components/        # UI components
    providers/         # Context providers (agent.tsx)
    routes/            # File-based routing
    lib/               # Utilities
packages/
  agent/               # Cloudflare Workers agent
  backend/             # Convex backend
    convex/
      chats/           # Chat-related functions
      sandboxes/       # Sandbox management
  config/              # Shared TS config
  env/                 # T3 Env type-safe env vars
```

## Commands
```bash
bun run dev        # Start everything
bun run build      # Production build
turbo dev          # Turborepo dev
```

### Type Checking
```
// MANDATORY RUN at the end
bun check-types
```
---

## Communication Style

**Be concise and direct. No fluff. Match the energy.**

User uses casual language ("bro", "dawg", "ugh"). Keep responses terse and actionable. When something breaks, diagnose fast, fix faster.

---

## DO

- **Infer types from existing packages** — never create custom types
- **Check existing patterns** in codebase before implementing
- **Keep responses terse** and actionable
- **Use memo with custom comparison** for streaming optimization
- **Use `useSyncExternalStore`** for shared mutable state
- **Reference skills** when available (`emilkowal-animations`, `vercel-react-best-practices`)
- **Use skeleton loaders**, not spinners
- **Use GitHub CLI efficiently** — prefer `gh` subcommands over manual API calls, and reuse existing auth/config without re-authing
- **Match Tailwind patterns exactly** — don't modify unrelated classes
- **DRY the code** — reuse existing utilities
- **Ask clarifying questions** if requirements are unclear

## DON'T

- Over-explain or pad responses
- Create new abstractions when existing ones work
- Touch Tailwind code that isn't directly relevant
- Use virtualization unless absolutely necessary
- Await non-critical operations (like title generation)
- Add "improvements" beyond what's requested
- Cast your own types — infer them

---

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

- Custom `zQuery`/`zMutation` wrappers inject auth context
- Use `zInternalMutation` for internal operations
- Search indexes for paginated queries (chats, sandboxes)
- Ent relationships (1:many between chats and sandboxes)

### Frontend Hooks
```typescript
export function useChats() {
  const createMutation = useMutation({
    mutationFn: useConvexMutation(api.chats.index.create),
    onSuccess: () => toast.success("Chat created"),
  });
  return { createChat: createMutation.mutateAsync };
}
```

### React Performance (Critical)
Heavy focus on preventing re-renders during AI streaming:
- Custom memo comparisons (`areMessageItemPropsEqual`)
- `useSyncExternalStore` for shared state
- Isolate `useChat`/`useAgent` hooks
- Content-based comparison vs reference equality
- Derive state during render, not in effects
- Functional setState for stable callbacks

### Agent Connection Management
- Get-or-create pattern for WebSocket connections
- Maintain connections in memory across route changes
- Context-based token management (SSR/hydration concerns)
- AbortController for streaming cancellation

### Routing
File-based TanStack Router:
- `(public)/` — unauthenticated routes
- `(protected)/` — wrapped in `<AuthBoundary>`

### Path Aliases
```
@/*        → ./src/*
@convex/*  → ../../packages/backend/convex/*
```

---

## UI/Animation Notes

- Emil Kowalski style animations — asymmetric timing (instant press, slow release)
- Keep animations under 300ms
- Shadow preference: `inset 0 3px 0 0 rgb(0 0 0 / 0.2)`
- Don't use base UI wrappers — modify raw components directly
- If animation feels slow, it is
- Always prefer using existing shadcn components, i have added em all
---

## Code Patterns

- always run the typecheck at the end and iterate over it until finished
- do not shy away from refactoring bad patterns, be proactive
- avoid defining new types, infer and reuse exsisting types form other files / by importing them from the relevant package
- always use convex ents for convex related stuff
- whenever implementing something for convex, analyze adjecent and relevant files for similar pattern implementation

## Background & Subagents

- for anything related to implementation or research make use of background subagents
- parallelize as much stuff you can, todos -> each todo is a subagent, make them background whenever possible

## Common Issues

| Issue | Fix |
|-------|-----|
| Vite 504 (Outdated Optimize Dep) | Restart dev server |
| CORS with OpenRouter | Use server-side proxy |
| Streaming disconnects on nav | Implement graceful reconnection, keep connection in memory |
| Message list re-renders | Isolate streaming component, memo with custom comparison |
| Infinite re-renders | Check effect dependencies, derive state during render |
| Connection not preserved | Get-or-create pattern, don't spawn new connections on route change |

---

## Skills to Reference
- `emilkowal-animations` — animation timing/easing
- `vercel-react-best-practices` — re-render optimization
