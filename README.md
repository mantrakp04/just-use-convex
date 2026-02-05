# just-use-convex

An organization-ready full-stack template built with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack). Pre-configured with Better Auth, Convex, Zod validation, and Convex Ents - everything you need to build multi-tenant SaaS applications.

Deploy to Cloudflare with Alchemy:

```bash
bunx alchemy deploy alchemy.run.ts
```

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
- A Convex account (free tier available)

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

6. Open [http://localhost:3001](http://localhost:3001) in your browser.

## Project Structure

```
just-use-convex/
├── alchemy.run.ts             # Cloudflare deployment config (web + agent)
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
│   ├── backend/                # Convex backend
│   │   └── convex/
│   │       ├── todos/          # Todo CRUD operations
│   │       ├── statistics/     # Aggregate queries
|   |       |── functions.ts    # Wrapped functions with zod and ents injection + auth validation
│   │       ├── schema.ts       # Database schema
│   │       └── auth.ts         # Auth configuration
│   ├── config/                 # Shared configuration
```

## Schema Example

The demo todo app shows typical patterns you'll use:

```typescript
// Entity with org/team scoping
Todo {
  organizationId: string    // Multi-tenant isolation
  userId: string            // Creator reference
  teamId?: string           // Optional team scoping
  title: string
  description?: string
  status: "todo" | "in_progress" | "done"
  priority: "low" | "medium" | "high"
  dueDate?: number
}

// Junction table for many-to-many relationships
TodoAssignedUser {
  todoId: Id<"todos">
  userId: string
  assignedBy: string
}
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all apps in development mode |
| `bun run dev:web` | Start only the web application |
| `bun run dev:setup` | Setup and configure Convex project |
| `bun run check-types` | TypeScript type checking across all packages |

## Auth Flow (Built-in)

1. User signs up with email/password
2. Personal organization auto-created with default team
3. Session established with organization context
4. JWT tokens include user info and active org/team
5. Organization preferences persist across sessions

## Usage Patterns

### Type-safe Backend with Zod

```typescript
// Custom helpers provide auth context + Zod validation
export const list = zCustomQuery({
  args: { status: z.enum(["todo", "in_progress", "done"]).optional() },
  handler: async (ctx, args) => {
    const { user, organizationId } = ctx;  // Auth context injected
    return await ctx.db
      .query("todos")
      .withIndex("organizationId", (q) => q.eq("organizationId", organizationId))
      .collect();
  },
});
```

### Convex Ents Relationships

```typescript
// Define relationships in schema
const todos = defineEnt({...})
  .edges("assignedUsers", { to: "todoAssignedUsers" });

// Query with relationships
const todo = await ctx.table("todos").getX(todoId);
const assignedUsers = await todo.edge("assignedUsers");
```

### Frontend Queries

```typescript
// Real-time reactive queries
const todos = useQuery(api.todos.list, { status: "todo" });
const stats = useQuery(api.statistics.getOrgStats);
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_CONVEX_URL` | Convex deployment URL |
| `VITE_CONVEX_SITE_URL` | Frontend application URL |
| `VITE_AGENT_URL` | Agent service URL |
| `VITE_DATA_BUDDY_CLIENT_ID` | (Optional) DataBuddy analytics client ID |
| `JWKS` | JSON Web Key Set for token validation |

## Customizing the Template

1. **Remove the demo app** - Delete `packages/backend/convex/todos/` and `apps/web/src/routes/(protected)/dashboard/`
2. **Add your entities** - Define schemas in `packages/backend/convex/schema.ts` using Convex Ents
3. **Create your queries** - Use `zCustomQuery`/`zCustomMutation` helpers for type-safe, authenticated endpoints
4. **Build your UI** - 53 shadcn/ui components are pre-installed in `apps/web/src/components/ui/`

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT
