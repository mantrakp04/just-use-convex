# AGENTS.md

## Project Overview
AI-powered agentic chat platform — multi-tenant, real-time, with org/team support. Features multi-step planning agents with sub-agents, Daytona sandbox code execution (PTY terminals, file ops), vector search (RAG), and tool approval workflows. Cloudflare Workers + Durable Objects for persistent agent state, Convex for reactive backend, TanStack Start for SSR.
THIS APP HAS NO USERS, thers no real data yet make whatever changes u want dont worry about it we will figure it out when we ship, this is super greenfield, its ok u can change the schema compleatly we are trying to get it in a good shape.

## Tech Stack
| Layer | Stack |
|-------|-------|
| **Runtime** | Bun |
| **Frontend** | React 19, TanStack Start/Router/Query, Tailwind v4, shadcn/ui (base-mira), Jotai, Motion 12, Xterm, Streamdown, Rive |
| **Backend** | Convex 1.31, Convex Ents (relationships), Better Auth 1.4 (org plugin), Convex Helpers (triggers, aggregates) |
| **Agent** | Cloudflare Workers, Alchemy (IaC), Durable Objects (sqlite), VoltAgent Core (planning/sub-agents), OpenRouter, Daytona SDK (sandboxes), Exa (web search), Composio (integrations), Cloudflare Vectorize (RAG) |
| **Build** | Turborepo, Vite 7 |

## Monorepo Structure
```
apps/web/              # TanStack Start frontend (React 19 SSR)
  src/
    components/        # UI — chat/, sandboxes/, todos/, dashboard/, auth/, ai-elements/, ui/
    providers/         # Context providers (agent.tsx — isolated React roots per chat)
    routes/            # File-based routing — (public)/, (protected)/
    store/             # Jotai atoms (chatSettings, favoriteModels, dashboard, sandbox)
    hooks/             # useChats, useSandbox, useAttachments, useOpenrouterModels, usePaginatedQuery
    lib/               # Utilities, motion presets
packages/
  agent/               # Cloudflare Workers agent (Alchemy-managed)
    src/
      agent/           # AgentWorker (AIChatAgent), ConvexAdapter, prompts
      tools/           # web_search, ask_user, sandbox/ (file ops, PTY terminals, code interpreter)
    alchemy.run.ts     # Alchemy IaC — DurableObject, Vectorize, secrets
  backend/             # Convex backend
    convex/
      tables/          # Ent definitions (chats, sandboxes, todos, attachments)
      chats/           # Chat CRUD, search, stats
      sandboxes/       # Sandbox CRUD, Daytona lifecycle triggers
      todos/           # Todo CRUD with member assignment
      lib/             # ConvexAdapter, auth helpers, custom functions (zQuery/zMutation)
  config/              # Shared tsconfig.base.json
  env/                 # T3 Env — exports ./web, ./backend, ./agent
```

## Commands
```bash
bun run dev            # Start everything (Vite + Convex + Alchemy)
bun run dev:web        # Frontend only
bun run dev:server     # Convex backend only
bun run build          # Production build
bun run check-types    # Turborepo type check (MANDATORY)
```

### Agent Commands
```bash
cd packages/agent
bunx alchemy dev alchemy.run.ts      # Local dev
bunx alchemy deploy alchemy.run.ts   # Deploy to Cloudflare
bunx alchemy destroy alchemy.run.ts  # Tear down infrastructure
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

### Clarification Gate (Mandatory)

- before implementing any non-trivial change, ask for confirmation if scope/intent is not explicitly specified
- do not assume architectural behavior for stateful flows (worker lifecycle, mode switching, persistence, auth propagation, background execution)
- if multiple reasonable implementations exist, present options briefly and wait for selection before coding
- when a change can affect cross-context behavior (chat vs workflow, server vs client, trigger vs interactive path), ask first and get approval
- default to asking one targeted clarifying question rather than executing on inferred intent

---

## DO

- **Infer and derive types from existing packages** — avoid new types; use `Pick`, `Omit`, and built-in TS utilities
- **Check existing patterns** in codebase before implementing
- **Cross-check server/client impact** — if you edit server-side code, verify client usage, and vice versa
- **Use Context7 for third-party SDK API verification** before integrating
- **For Convex deployment config (especially Vercel build commands), follow official Convex docs as source of truth**
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

- Custom `zQuery`/`zMutation` wrappers inject auth context (baseIdentity)
- `zExternalQuery`/`zExternalMutation` for agent-side external token auth
- `zInternalMutation` for internal operations
- Search indexes for paginated queries (chats, sandboxes)
- Ent relationships: chats → sandboxes (many-to-one), todos ↔ members (many-to-many)
- Sandbox lifecycle triggers: auto-provision Daytona on insert, auto-destroy on delete
- Each Daytona sandbox gets a dedicated volume mounted at `/home/daytona/volume`

### Tables
- **chats** — organizationId, memberId, title, isPinned, sandboxId (optional ref to sandbox)
- **sandboxes** — organizationId, userId, name, description (Daytona-backed)
- **todos** — organizationId, memberId, title, description, completed, priority, dueDate
- **attachments** — globalAttachments (org-wide) + orgMemberAttachments (per-member)

### Agent Architecture
```
AgentWorker (AIChatAgent / Durable Object)
  ├── ConvexAdapter — JWT + external token auth, unified Convex HTTP client
  ├── PlanAgent — multi-step task decomposition with sub-agents
  │   └── Daytona filesystem sub-agent (list, read, write, edit, glob, grep, exec, stateful Python)
  ├── Tools
  │   ├── web_search (Exa neural search)
  │   ├── ask_user (structured questions with options)
  │   └── sandbox/ (file ops, PTY terminal sessions, code interpreter)
  ├── Vectorize — chat message indexing (768 dims, cosine)
  └── Streaming — text-delta, reasoning-delta, tool-input, tool-result, errors
```

- Default model: `openai/gpt-5.2-chat` (configurable per chat via OpenRouter)
- Reasoning effort: low/medium/high
- Background tasks with configurable timeout (default 1hr)
- Tool result truncation for large outputs

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

### Agent Connection Management (providers/agent.tsx)
- Isolated React root instances per chat (hidden divs)
- `useSyncExternalStore` for external state subscriptions
- Get-or-create pattern — maintains connections across route changes
- Instance data: chat, agent, settings, setSettings
- Handles SSR/hydration concerns with token passing

### React Performance (Critical)
Heavy focus on preventing re-renders during AI streaming:
- Custom memo comparisons (`areMessageItemPropsEqual`)
- `useSyncExternalStore` for shared state
- Isolate `useChat`/`useAgent` hooks
- Content-based comparison vs reference equality
- Derive state during render, not in effects
- Functional setState for stable callbacks

### Routing
File-based TanStack Router:
- `(public)/` — unauthenticated routes (auth, docs)
- `(protected)/` — wrapped in `<AuthBoundary>` (chats, settings, dashboard)

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
- when adding runtime validation, define/export the schema in `types.ts` and infer the type from it; import both instead of local guards/schemas
- if you change server-side code, always verify affected client-side usage (and vice versa)
- keep codebase DRY
- cleanup stale code when changing methods/approach
- keep helper functions at the bottom of the file
- always use convex ents for convex related stuff
- whenever implementing something for convex, analyze adjacent and relevant files for similar pattern implementation
- whenever working with external libraries always query context7 for their relevant docs
- workflow execution namespace rule: `isolated` mode uses the workflow namespace (`workflow-${workflowId}`); `latestChat` mode uses the member's most recently updated chat id

## Background & Subagents

- for anything related to implementation or research make use of background subagents
- parallelize as much stuff you can, todos -> each todo is a subagent, make them background whenever possible

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
- `flow` — structured execution flows for auth/review/refactor/shadcn-to-motion migrations
