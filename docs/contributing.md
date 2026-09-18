# Contributing

## Local loop

```bash
npm install          # Node 20 LTS; see the note below
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run build        # full production build
```

> **`better-sqlite3` native build.** On Node 24+ no prebuilt binary exists and `node-gyp` may
> fail, which rolls back the entire install. Use **Node 20 LTS**. If you only need to typecheck,
> `npm install --ignore-scripts` skips the native build — enough for `tsc`, not enough to run
> the app.

There is **no test suite**. `npm run typecheck` and `npm run build` are the gate; both must pass
before committing. The build catches server/client boundary errors that `tsc` alone will not.

## Conventions

**TypeScript**
- Strict mode. No `any` in new code; prefer a narrow type or `unknown` plus a guard.
- Validate every external input with zod at the boundary.
- Import via the `@/` alias, not deep relative paths.

**Comments**
- Explain **why**, not what. The codebase's existing comments are the model: they record the
  reasoning and the constraint that forced a decision, not a paraphrase of the line below.
- When something looks odd, say why it is that way — future readers will otherwise "fix" it.

**React**
- Server components by default; `'use client'` only when you need state, effects or browser APIs.
- Keep client bundles lean — import shared constants from a plain module rather than pulling in a
  server component (see `components/legal/constants.ts`).

**UI**
- Follow [ui-design-system](./ui-design-system.md). Tokens only, no `dark:` variants, no native
  `<select>`, `.focus-ignite` on every interactive element.

**API routes**
- Session check → rate limit → validate → authorise → act.
- Return `{ error: string }` with a human-readable message.
- Return 404, not 403, for resources owned by someone else.

## Common tasks

### Adding a database column
Two places, always:
1. The `CREATE TABLE` in [`schema.sql`](../lib/db/sql/schema.sql) — for fresh databases.
2. An `ensureColumn(...)` in `migrateExistingTables()` in
   [`client.ts`](../lib/db/sql/client.ts) — for deployed ones.

Miss the second and existing databases silently lack the column.

### Adding an owner-scoped table
Do the above, **and** add the table to the list in `deleteUserData()`, or account deletion
leaves orphaned rows.

### Adding an AI provider
See [providers § adding a provider](./providers.md#adding-a-provider) — seven steps, including
two UI lists that are easy to miss.

### Adding an agent tool
See [agent-tools § adding a tool](./agent-tools.md#adding-a-tool). Write a `ToolDefinition`,
append it to the registry. Get `sideEffect` right: it is a security boundary.

### Adding a page
- Authenticated → it renders inside `ProtectedShell` automatically.
- Public → add a layout using `PublicShell`, **and** add the prefix to `PUBLIC_PREFIXES` in
  [`middleware.ts`](../middleware.ts). Middleware fails closed, so a missed prefix means the page
  redirects to login.

### Adding an env var
1. Read it through [`lib/env.ts`](../lib/env.ts) where it is general configuration.
2. Document it in [`.env.example`](../.env.example) with a comment.
3. Add a row to [configuration](./configuration.md).

## Spec-first

[`/specs`](../specs) holds the original design documents: `constitution.md` (guardrails),
`clarify.md` (resolved decisions), feature specs, `plan/architecture.md`, `tasks/`, and
`lessons-learned.md`. For a substantial feature, update the spec alongside the code. Record
bugs and deviations in `lessons-learned.md`.

`docs/` describes the system **as built**; `specs/` records how it was **designed**. When they
disagree, `docs/` is what a reader should trust — and the disagreement is worth resolving.

## Commits

- Present-tense summary line under ~72 characters, prefixed `feat:`, `fix:`, `docs:`, `refactor:`
  or `chore:`.
- A body explaining **why** the change was made and any consequence a reviewer should know.
- Do not add AI co-authorship trailers.

## Before opening a PR

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] New env vars documented in `.env.example` and `docs/configuration.md`
- [ ] New DB columns added in **both** `schema.sql` and `migrateExistingTables()`
- [ ] New owner-scoped tables added to `deleteUserData()`
- [ ] New public routes added to `PUBLIC_PREFIXES`
- [ ] UI works in light *and* dark, and at phone width
- [ ] Interactive elements are keyboard-reachable and carry `.focus-ignite`
- [ ] Docs updated where behaviour changed
