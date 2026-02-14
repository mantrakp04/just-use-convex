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
Always run `bun check-types` after code changes before finalizing. If it fails, re-run until it passes.

### On Finish

Always play `finish.wav` when done working to notify me. This is mandatory before your final response.
Run from repo root and do not skip silently on failure.
```bash
test -f finish.wav && paplay finish.wav
```
If playback fails, explicitly report that in the final response with the command error.

## Communication Style

**Be concise and direct. No fluff. Match the energy.**

User uses casual language ("bro", "dawg", "ugh"). Keep responses terse and actionable. When something breaks, diagnose fast, fix faster.

---

## DO

- **Infer and derive types from existing packages** — avoid new types; use `Pick`, `Omit`, and built-in TS utilities
- **Check existing patterns** in codebase before implementing
- **Cross-check server/client impact** — if you edit server-side code, verify client usage, and vice versa
- **Use Context7 for third-party SDK API verification** before integrating
- **Keep responses terse** and actionable
- **Use memo with custom comparison** for streaming optimization
- **Use `useSyncExternalStore`** for shared mutable state
- **Prefer Jotai atoms** for shared in-memory UI state instead of ad-hoc React context/provider wiring when possible
- **Reference skills** when available (`emilkowal-animations`, `vercel-react-best-practices`)
- **Use skeleton loaders**, not spinners
- **Use GitHub CLI efficiently** — prefer `gh` subcommands over manual API calls, and reuse existing auth/config without re-authing
- **Match Tailwind patterns exactly** — don't modify unrelated classes
- **DRY the code** — reuse existing utilities
- **Clean up after approach changes** — remove stale paths/helpers when method changes
- **Split oversized modules** — break complex files into focused, manageable units
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
- Each Daytona sandbox gets a dedicated volume mounted at `/home/daytona/volume`

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
- Don't use base UI wrappers — replace with plain HTML + `motion/react` for animated components
- If animation feels slow, it is
- Always prefer using existing shadcn components, i have added em all
---

## Code Patterns

- always run the typecheck at the end and iterate over it until finished
- do not shy away from refactoring bad patterns, be proactive
- avoid defining new types; infer and derive from existing types/packages (use `Pick`/`Omit` and TS utility types)
- keep shared/custom types centralized in `types.ts` files (avoid inline object type blocks in implementation files)
- if you change server-side code, always verify affected client-side usage (and vice versa)
- keep codebase DRY
- cleanup stale code when changing methods/approach
- keep helper functions at the bottom of the file
- always use convex ents for convex related stuff
- whenever implementing something for convex, analyze adjecent and relevant files for similar pattern implementation
- whenever working with external libraries always query context7 for their relevant docs

## Background & Subagents

- for anything related to implementation or research make use of background subagents
- parallelize as much stuff you can, todos -> each todo is a subagent, make them background whenever possible

## Review Flow

- fetch all PR comments from `greptile`, `cubic`, and `codex`
- normalize comments into a single actionable list with file + line context
- spawn a background subagent to validate each comment (real issue vs noise/outdated)
- fix every validated comment in code, following existing project patterns
- run required checks after fixes (`bun check-types` minimum)
- post a concise end summary with:
  - validated + fixed comments
  - rejected comments with reason
  - checks run and status

## Shadcn → Framer Motion Flow

### 1. Audit
- read the target shadcn component and `Grep` all consumer files for its imports
- catalog every base-ui primitive used, its props, and data attributes it injects
- note which props consumers actually rely on (controlled value, variants, callbacks, `keepMounted`, etc.)

### 2. Replace primitives
- swap each base-ui primitive for a plain HTML element (`div`, `button`, `span`)
- extract all Tailwind classes verbatim onto the replacement elements
- replicate stateful behavior (controlled/uncontrolled, open/closed, active selection) via React context
- re-add every data attribute base-ui injected (`data-active`, `data-open`, `data-orientation`, `data-variant`, `data-horizontal`, etc.) so existing Tailwind `group-data-*` selectors keep working
- for CVA variant checks, use negative guards (`variant !== "x"`) instead of strict equality to handle `null | undefined` from `VariantProps`

### 3. Add motion
- identify the state-change visual (active indicator, expand/collapse, enter/exit) and decide the animation primitive:
  - **position transitions** (tabs, nav indicators): `layoutId` on a `motion.span` with `layout` prop + `initial={false}`
  - **presence transitions** (modals, drawers, dropdowns): `AnimatePresence` + `motion.div` with `animate`/`exit`
  - **height/collapse transitions**: `collapseVariants` from `@/lib/motion`
- use `isolate` on the parent + `-z-10` on the indicator to layer behind content without wrapper spans
- pick the right preset from `@/lib/motion`:
  - `springSnappy` — position indicators (tabs, nav)
  - `springBouncy` — attention-grabbing elements
  - `springExpand` — height/accordion animations
  - `transitionDefault` — hover/general UI
  - `transitionInstant` — press feedback
- invoke `emilkowal-animations` skill and cross-check the animation against relevant rules

### 4. Gotchas
- do NOT use `useReducedMotion` to set `duration: 0` — it silently kills `layoutId` animations
- `keepMounted` panels: use inline `style={{ display: "none" }}` when inactive (not Tailwind `hidden` class, which can be overridden)
- `layoutId` requires exactly ONE element with that ID in the tree at a time — conditional render, don't toggle opacity
- always add `layout` prop alongside `layoutId` for reliability

### 5. Verify
- confirm all consumer files still type-check (`bun check-types`)
- test every variant and orientation the component supports
- verify no visual regression in static state (same colors, spacing, borders)

## Self-Updating Scratchpad

- treat this `AGENTS.md` as a living scratchpad
- on every new user input, evaluate whether it contains durable guidance worth remembering:
  - instruction/preference
  - implementation pattern
  - workflow/process rule
  - recurring project context
- if the input is durable and non-conflicting, update `AGENTS.md` in the same task
- if it conflicts with existing rules, keep the newest explicit user instruction and remove/adjust the conflicting older rule
- keep updates concise and structured (avoid noisy or one-off notes)

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
