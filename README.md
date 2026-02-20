# just-use-convex

An AI-powered agentic chat platform built with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack). Multi-tenant, real-time, with Better Auth, Convex, Daytona sandboxes, vector search (RAG), and planning agents with sub-agents.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmantrakp04%2Fjust-use-convex&env=CONVEX_DEPLOY_KEY,VITE_CONVEX_URL,VITE_CONVEX_SITE_URL,VITE_AGENT_URL&envDefaults=%7B%22%3A%22https%3A%2F%2Fyour-project.vercel.app%22%2C%22CONVEX_DEPLOY_KEY%22%3A%22Generate%20at%20dashboard.convex.dev%20-%3E%20Project%20Settings%20-%3E%20Deploy%20Keys%22%2C%22VITE_CONVEX_URL%22%3A%22https%3A%2F%2F%3Cslug%3E.convex.cloud%22%2C%22VITE_CONVEX_SITE_URL%22%3A%22https%3A%2F%2F%3Cslug%3E.convex.site%22%2C%22VITE_AGENT_URL%22%3A%22https%3A%2F%2Fyour-agent.your-subdomain.workers.dev%22%7D&project-name=just-use-convex&demo-title=Just-Use-Convex&demo-description=An%20org%20configured%20template)

## Why This Template?

Skip weeks of boilerplate setup. This template provides:

- **Multi-organization auth out of the box** - Better Auth with org plugin, member invitations, and role-based access
- **Type-safe from database to UI** - Convex Ents for relationships + Zod validation throughout
- **Real-time by default** - Convex reactive queries with TanStack Query integration
- **Production patterns** - Pagination, aggregates, proper error handling, and authorization

## Features

### Authentication & Organizations
- Email/password authentication via Better Auth
- Multi-organization support with automatic personal org creation
- Team management within organizations
- Member invitation system (48-hour expiry)
- Role-based access control (owner/member)
- Session persistence with org/team context

### Backend Patterns
- **Convex Ents** - Entity relationships with type-safe queries
- **Zod validation** - Runtime schema validation on all inputs
- **Custom query helpers** - `zCustomQuery` and `zCustomMutation` with auth context
- **Aggregate system** - Real-time statistics via `@convex-dev/aggregate`
- **Pagination utilities** - Cursor-based pagination with infinite scroll support

### Documentation Site
Built-in documentation powered by Fumadocs:
- MDX content at `apps/web/content/docs/`
- Full-text search via `/api/search`
- Accessible at `/docs` route

### AI Agent
Cloudflare Workers + Durable Objects for persistent chat state:
- **Planning agents** — VoltAgent Core with multi-step task decomposition and sub-agents
- **Daytona sandboxes** — PTY terminals, file ops, code interpreter per chat
- **Tools** — web search (Exa), ask-user (structured questions), vector RAG (Cloudflare Vectorize)
- **Streaming** — text-delta, reasoning-delta, tool-call, tool-result over WebSocket
- **Multi-model** — OpenRouter with configurable reasoning effort

### Demo Application
Includes a fully-featured todo app demonstrating all patterns:
- Kanban, list, and calendar views
- Multi-user assignment
- Priority and status filtering
- Team-scoped data
- Real-time statistics dashboard

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 19 | UI library |
| TanStack Start | SSR framework with file-based routing |
| TanStack Router | Type-safe routing |
| TanStack Query | Server state management with Convex integration |
| TailwindCSS v4 | Utility-first styling |
| shadcn/ui | 53 pre-built UI components |
| Fumadocs | Documentation site with MDX support |

### Backend
| Technology | Purpose |
|------------|---------|
| Convex | Real-time backend-as-a-service |
| Convex Ents | Entity relationship management |
| Zod | Runtime schema validation |
| Better Auth | Authentication with organization plugin |
| @convex-dev/aggregate | Real-time statistics computation |

### Agent
| Technology | Purpose |
|------------|---------|
| Cloudflare Workers | Edge runtime |
| Durable Objects | Persistent agent state per chat |
| VoltAgent Core | Planning, sub-agents, task decomposition |
| OpenRouter | Multi-model LLM access |
| Daytona SDK | Sandboxed code execution (PTY, file ops) |
| Exa | Neural web search |
| Cloudflare Vectorize | RAG over chat messages |

### Build & DX
| Technology | Purpose |
|------------|---------|
| TypeScript | End-to-end type safety |
| Turborepo | Monorepo build optimization |
| Bun | Fast package management and runtime |
| Vite | Frontend build tooling |

## Getting Started

### Prerequisites
- [Bun](https://bun.sh/) v1.3.6 or later
- [Convex](https://convex.dev/) account (free tier available)
- [Cloudflare](https://dash.cloudflare.com/) account (optional, for agent deployment)

### Installation

1. Clone the repository and install dependencies:

```bash
bun install
```

2. Set up Convex:

```bash
bun run dev:setup
```

Follow the prompts to create a new Convex project.

3. Configure environment variables:

Copy environment variables from `packages/backend/.env.local` to `apps/web/.env`:

```bash
cp packages/backend/.env.local apps/web/.env
```

4. Set up JWKS for auth token validation:

```bash
cd packages/backend && bunx convex run auth:getLatestJwks | bunx convex env set JWKS
```

5. Start the development server:

```bash
bun run dev
```

7. Open [http://localhost:3001](http://localhost:3001) in your browser.

## Project Structure

```
just-use-convex/
├── apps/
│   └── web/                    # React + TanStack Start frontend
│       ├── content/
│       │   └── docs/           # Documentation MDX files
│       ├── src/
│       │   ├── components/     # UI components (shadcn/ui + custom)
│       │   ├── hooks/          # Custom React hooks
│       │   ├── lib/            # Utilities and auth client
│       │   └── routes/         # File-based routing
│       │       ├── (public)/   # Auth pages (sign in/up)
│       │       ├── (protected)/ # Dashboard & settings
│       │       └── docs/       # Documentation pages (Fumadocs)
├── packages/
│   ├── agent/                  # Cloudflare Workers AI agent (Alchemy-managed)
│   │   ├── src/agent/          # AgentWorker, ConvexAdapter, prompts, vectorize
│   │   ├── src/tools/          # web_search, ask_user, sandbox (PTY, file ops)
│   │   └── alchemy.run.ts      # IaC — DurableObject, Vectorize, secrets
│   ├── backend/                # Convex backend
│   │   └── convex/
│   │       ├── chats/          # Chat CRUD, search, stats
│   │       ├── sandboxes/      # Sandbox lifecycle (Daytona triggers)
│   │       ├── todos/          # Todo CRUD operations
│   │       ├── statistics/     # Aggregate queries
│   │       ├── schema.ts       # Database schema
│   │       └── auth.ts         # Auth configuration
│   ├── config/                 # Shared configuration
│   └── env/                    # Environment variable schemas (T3 Env)
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all apps in development mode |
| `bun run dev:web` | Start only the web application |
| `bun run dev:server` | Start Convex backend only |
| `bun run dev:setup` | Setup and configure Convex project |
| `bun run check-types` | TypeScript type checking across all packages |

### Agent (Cloudflare)

```bash
cd packages/agent
bunx alchemy dev alchemy.run.ts      # Local dev
bunx alchemy deploy alchemy.run.ts   # Deploy to Cloudflare
bunx alchemy destroy alchemy.run.ts  # Tear down infrastructure
```

## Auth Flow (Built-in)

1. User signs up with email/password
2. Personal organization auto-created with default team
3. Session established with organization context
4. JWT tokens include user info and active org/team
5. Organization preferences persist across sessions


## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT
