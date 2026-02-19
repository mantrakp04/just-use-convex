---
name: flow
description: Consolidated execution flows for this repo. Use when Codex needs step-by-step process rules for auth context propagation, PR review comment handling, large refactors, or shadcn-to-framer-motion component migrations.
---

# Flow

## Auth Flow

Apply this auth path when implementing or debugging authenticated agent flows:

```text
Client -> Better Auth (JWT with org context) -> WebSocket -> Agent
Agent -> ConvexAdapter (JWT or external token) -> Convex
```

- Use session fields: `activeOrganizationId`, `activeTeamId`, `organizationRole`, `memberId`.
- Respect roles: `member`, `admin`, `owner`.
- Respect permissions: `create`, `read`, `readAny`, `update`, `updateAny`, `delete`, `deleteAny`.

## Review Flow

- Fetch unresolved PR comments.
- Normalize comments into one actionable list with file + line context.
- Spawn a background subagent to validate each comment (real issue vs noise/outdated).
- Present a detailed summary with priority and wait for further instructions
- Fix every validated comment in code.
- Run required checks after fixes (`bun check-types` minimum).
- Mark the appropriate comments as resolved using the gh cli
- Post an end summary with:
  - validated + fixed comments
  - rejected comments with reason
  - checks run and status

## Refactor Flow

- Scope first: read target files and `Grep` imports/usages across the repo before edits.
- Map dependencies: catalog consumers, re-exports, and type references (file + line).
- Apply refactoring principles: config-driven, one init path, thin handlers, no forked methods, derive types.
- Spawn parallel subagents per independent module; block dependent files until upstream changes finish.
- Preserve public API unless explicitly asked to change it.
- Migrate all consumers in the same pass when API changes are required.
- Delete dead code completely after consolidation (no `_deprecated` suffixes).
- Centralize types in `types.ts` and derive with `Pick`/`Omit`/`Extract`.
- Run `bun check-types` after each logical unit, not only at the end.
- Post an end summary with:
  - files changed (moved/split/deleted)
  - public API changes
  - dead code removed
  - checks run and status

## Shadcn -> Framer Motion Flow

### 1. Audit
- Read the target shadcn component and `Grep` all consumer imports.
- Catalog every base-ui primitive, props used, and injected data attributes.
- Note which props consumers rely on (`value`, variants, callbacks, `keepMounted`, etc.).

### 2. Replace primitives
- Replace each base-ui primitive with plain HTML (`div`, `button`, `span`).
- Preserve Tailwind classes verbatim on replacements.
- Rebuild state behavior (controlled/uncontrolled, open/closed, selection) with React context.
- Re-add base-ui data attributes (`data-active`, `data-open`, `data-orientation`, `data-variant`, `data-horizontal`) so `group-data-*` selectors still work.
- For CVA variant checks, use negative guards (`variant !== "x"`) to handle `null | undefined`.

### 3. Add motion
- Pick the correct animation primitive for the state change:
  - position transitions: `layoutId` on `motion.span` with `layout` + `initial={false}`
  - presence transitions: `AnimatePresence` + `motion.div` with `animate`/`exit`
  - collapse transitions: `collapseVariants` from `@/lib/motion`
- Use `isolate` on parent + `-z-10` on indicator for layering.
- Pick motion presets from `@/lib/motion`:
  - `springSnappy` (position indicators)
  - `springBouncy` (attention-grabbing elements)
  - `springExpand` (height/accordion)
  - `transitionDefault` (hover/general UI)
  - `transitionInstant` (press feedback)
- Invoke `emilkowal-animations` and cross-check animation rules.

### 4. Gotchas
- Do not set `useReducedMotion` to `duration: 0`; it breaks `layoutId` animations.
- For `keepMounted` panels, hide inactive panels with inline `style={{ display: "none" }}` (not Tailwind `hidden`).
- Ensure only one element with a given `layoutId` exists at a time (conditional render, no opacity toggles).
- Always pair `layoutId` with `layout`.

### 5. Verify
- Type-check all consumers with `bun check-types`.
- Test every supported variant and orientation.
- Confirm static visuals match existing spacing/colors/borders.
