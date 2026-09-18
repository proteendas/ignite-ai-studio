# Contributing

## Local loop

```bash
docker compose up -d postgres   # a Postgres with pgvector on :5432
npm install                     # no native deps — pg is pure JavaScript
npm run dev                     # http://localhost:3000
npm run typecheck               # tsc --noEmit
npm run build                   # full production build
```

Set `DATABASE_URL` in `.env.local` (see [getting started](./getting-started.md)). The app creates
its own tables on first request — there is no migration command.

### Verifying a change

```bash
npm run typecheck    # types
npm run build        # catches server/client boundary errors tsc misses
npm run verify:db    # integration check against a real Postgres
```

`verify:db` needs `DATABASE_URL` pointing at a pgvector-capable Postgres
(`docker compose up -d postgres` provides one). It exercises what a typecheck cannot: schema
bootstrap and its idempotency, driver type coercion, pgvector similarity ranking and owner
isolation, single-use token redemption under concurrency, the atomicity of the rate limiter, and
that `READ ONLY` transactions really do refuse writes.

There is no unit-test suite; these three commands are the gate.

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
- `checkRateLimit` is **async** — always `await` it.
- Return `{ error: string }` with a human-readable message.
- Return 404, not 403, for resources owned by someone else.
- Long-running routes need `export const maxDuration = N` or they hit the serverless default.

**Database access**
- Every function in `lib/db/sql/client.ts` is async; go through `query()`, `queryOne()` or
  `transaction()` so schema bootstrap is awaited for you.
- Postgres placeholders are `$1, $2, …`, not `?`.
- Multi-statement work belongs in `transaction()`, not several sequential `query()` calls.

## Common tasks

### Adding a database column
Two places, always:
1. The `CREATE TABLE` in [`schema.ts`](../lib/db/sql/schema.ts) — for fresh databases.
2. An `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `migrateExistingTables()` in
   [`client.ts`](../lib/db/sql/client.ts) — for deployed ones.

Miss the second and existing databases silently lack the column.

Remember that `node-postgres` returns `TIMESTAMPTZ` as a `Date` and `BIGINT` (including `SUM()`
over an integer) as a **string** — run new columns through `toIso()` / `toNum()` in the mapper.

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
- [ ] New DB columns added in **both** `schema.ts` and `migrateExistingTables()`
- [ ] New owner-scoped tables added to `deleteUserData()`
- [ ] New public routes added to `PUBLIC_PREFIXES`
- [ ] UI works in light *and* dark, and at phone width
- [ ] Interactive elements are keyboard-reachable and carry `.focus-ignite`
- [ ] Docs updated where behaviour changed
