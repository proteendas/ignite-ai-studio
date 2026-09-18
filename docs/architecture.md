# Architecture

How IgniteAI Studio is put together, and why.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS with CSS-variable theme tokens |
| Auth | NextAuth (JWT sessions, credentials + optional Google/GitHub) |
| Relational store | Postgres via `pg` (async connection pool) |
| Vector store | pgvector, in the same Postgres database (Chroma, FAISS and Azure AI Search are alternatives) |
| AI | Provider-agnostic adapter over 12 cloud providers plus Ollama |
| Email | Resend over plain HTTPS, no SDK |

There is no separate backend service. API routes in `app/api/` are the backend; the same
deployment serves both.

**One datastore.** Application tables and vector embeddings live in the same Postgres database,
so a deployment has one connection string, one backup and one thing to keep alive. That is also
what makes serverless hosting possible — see [deployment](./deployment/README.md).

## Module map

```
app/
  api/              Route handlers — the entire HTTP API
  (pages)           Route segments: chat, documents, content-generator,
                    dashboard, observability, settings, legal, auth flows
components/
  ui/               Primitives: Button, Card, Badge, Select, Spinner, Toaster…
  states/           Empty / NoResults / Loading / Error / Success / StatusPage
  layout/           Sidebar, Navbar, ProtectedShell, PublicShell, SiteFooter
  chat/ documents/ content-generator/ settings/ agent/   Feature components
  legal/            Policy page shell and shared constants
lib/
  ai/
    providerAdapter.ts    Provider selection, failover, chat calls
    keyResolver.ts        Resolves effective key per provider (user key > env)
    embeddingsAdapter.ts  Embeddings, independent of the chat provider
    prompts.ts            System prompts
    providers/            One module per provider
    agent/                ReAct loop + agent prompts
    tools/                Tool registry and tool implementations
  db/
    sql/          Postgres pool + query helpers, schema (as TS), NL→SQL
    vector/       Vector store interface + pgvector/Chroma/FAISS/Azure implementations
  ingest/         parse, sanitize, chunk
  intent/         Intent router
  auth/           NextAuth config, password hashing, auth tokens
  email/          Resend mailer
  crypto.ts       AES-256-GCM encrypt/decrypt for stored secrets
  env.ts          Centralised environment access
  rateLimit.ts    Postgres-backed distributed rate limiter
middleware.ts     Maintenance mode, public routes, auth gate
```

## Request flow: grounded chat

```
POST /api/chat
  │
  ├─ Session check (401 if absent)
  ├─ Rate limit (429 if exceeded)
  ├─ Validate body (400)
  ├─ If documentId: check ownership + status is `ready` (404 / 409)
  │
  ├─ classifyIntent() ──► document | structured-data | compound | general
  │                            │
  │      ┌─────────────────────┴──────────────────┐
  │      ▼                                        ▼
  │  Vector retrieval                        NL → SQL
  │  embed(query) → pgvector cosine          generate read-only SQL
  │  search scoped to owner's docs           run in a READ ONLY transaction
  │      │                                        │
  │      └─────────────────┬──────────────────────┘
  │                        ▼
  ├─ Build prompt: system + thread summary + last N turns + retrieved context
  ├─ providerAdapter.chat() with failover across configured providers
  ├─ Stream response (SSE)
  └─ Persist message, citations, token counts, usage + activity events
```

Every retrieval is scoped to the requesting user's own documents, so one account's content can
never surface in another's answers.

## Request flow: ingestion

```
POST /api/ingest  (multipart form)
  │
  ├─ Session + rate limit
  ├─ sanitize(file)         name, size and MIME checks (400)
  ├─ Insert document row     status = 'processing'
  ├─ parse(file)             PDF via pdf-parse, DOCX via mammoth, text as-is
  │                          → 422 if no extractable text
  ├─ chunk(text)             ~2800 chars, 350 overlap, split on
  │                          paragraph → line → sentence → word boundaries
  ├─ embed(chunks)           via embeddingsAdapter, with an embedding cache
  │                          keyed by sha256(text)+provider+model
  ├─ vectorStore.upsert()    one document_chunks row per chunk, owner-tagged
  └─ Update document         status = 'ready', chunk_count set
                             (or 'failed' with the error recorded)
```

The **embedding cache** means identical text is never embedded twice for the same
provider and model — a meaningful cost saving when re-ingesting similar documents.

## Request flow: the agent loop

```
POST /api/agent
  │
  └─ runAgentLoop()  — max 6 steps
       │
       repeat:
         ├─ Model proposes: a tool call, or a final answer
         ├─ If final answer → stream it, done
         ├─ Look up tool in registry
         │
         ├─ sideEffect === 'read' and user auto-approved it?
         │     └─ execute immediately, feed result back as an observation
         │
         └─ otherwise
               ├─ Persist agent_action (status 'proposed') INCLUDING the
               │  serialised loop state
               ├─ Stream the approval card to the UI, and STOP
               │
               └─ later: POST /api/agent/actions/[id]
                     ├─ approve → execute, rehydrate state, resume the loop
                     └─ reject  → record the decision, end
```

Persisting the loop state in `agent_actions.state_json` is what allows the loop to survive the
gap between proposal and human decision — which may be minutes, or a page reload.

## Provider selection and failover

1. Resolve effective keys: the user's own encrypted key wins over the env key
   ([`keyResolver.ts`](../lib/ai/keyResolver.ts)).
2. Build a candidate list from `CONNECTION_TYPE`:
   - `cloud` → configured cloud providers in priority order
   - `local` → Ollama only
   - `auto` → Ollama first, then cloud
3. Honour `AI_PROVIDER` (or the user's default provider) if that provider is configured.
4. Call the first candidate; on failure, fall through to the next.
5. If no candidate is configured at all, return **503** with an actionable message.

See [providers](./providers.md).

## Theming

The theme is a set of CSS custom properties on `:root`, overridden by `html.dark`. Tailwind
colours are defined as `rgb(var(--token) / <alpha-value>)`, so the *same* utility classes
(`bg-surface-1`, `text-content`, `bg-ignite/15`) resolve differently per theme. There are no
per-component `dark:` variants anywhere — flipping one class on `<html>` re-themes the entire
application. Dark is the default; an inline script in the root layout applies a stored light
preference before first paint to avoid a flash.

## Data layer

### Connection pooling

`lib/db/sql/client.ts` holds a `pg.Pool` memoised on `globalThis` under a symbol, so Next.js hot
reload does not open a new pool on every edit and warm serverless containers reuse theirs.

`PG_POOL_MAX` is deliberately small (default 5). Serverless platforms run many concurrent
instances, each with its own pool, while Postgres limits connections **per server**. A pooled
endpoint — Neon's `-pooler` host, or PgBouncer — is what actually makes this safe at scale.

### Schema bootstrap

The schema is a string constant in `lib/db/sql/schema.ts`, not a `.sql` file. Serverless bundlers
do not reliably ship loose non-JS assets next to the compiled handler, and there is no dependable
`__dirname` at runtime; inlining it makes the DDL part of the bundle by construction.

It is applied lazily, on the first query a process makes:

```
query() ──► ready() ──► memoised promise on globalThis
                          │  (concurrent callers await the same run)
                          ▼
                     pg_advisory_lock
                          ├─ CREATE TABLE IF NOT EXISTS …   (idempotent)
                          ├─ ALTER TABLE … ADD COLUMN IF NOT EXISTS
                          └─ seed demo products/orders if empty
                     pg_advisory_unlock
```

The advisory lock matters because several instances can cold-start at once: without it,
concurrent `CREATE TABLE IF NOT EXISTS` can still race and raise a duplicate-object error. The
first instance through applies the schema; the rest wait and find it already there. If bootstrap
fails the memoised promise is cleared, so the next request retries rather than the container
being permanently poisoned.

Adding a column means editing **two** places: the `CREATE TABLE` (for fresh databases) and
`migrateExistingTables()` (for deployed ones).

### Value coercion

`node-postgres` hydrates `TIMESTAMPTZ` as a JS `Date` and `BIGINT` — including `SUM()` over an
integer column — as a **string**, to avoid precision loss. Every mapper funnels through `toIso()`
and `toNum()` so driver types never leak into the application's record types.

### Vector search

`document_chunks` stores the embedding in a `VECTOR(n)` column with an HNSW index under
`vector_cosine_ops`. Search is:

```sql
SELECT …, 1 - (embedding <=> $1::vector) AS score
FROM document_chunks
WHERE owner_id = $2
ORDER BY embedding <=> $1::vector
LIMIT $3;
```

`<=>` is cosine **distance** (0 = identical), so similarity is `1 - distance`. The `owner_id`
filter is the isolation boundary: one account's chunks can never surface in another's results.

`VECTOR(n)` is fixed at table creation, so `EMBEDDING_DIMENSIONS` must match the embeddings
model's output. A mismatch fails loudly on insert with a message naming both numbers.

### Rate limiting

`rate_limits` holds one row per bucket, incremented in a single atomic upsert that either starts
a new window or increments the current one. This replaced an in-memory `Map`, which was
meaningless on serverless (every invocation may get a fresh process, so the counter never
accumulated) and wrong on multi-replica deployments (each replica enforced its own copy,
multiplying the ceiling).

It fails **open**: if the database is unreachable, requests are allowed. A database outage should
not present as a rate-limit wall.

## Provider selection and failover

1. **Resolve effective keys.** [`keyResolver.ts`](../lib/ai/keyResolver.ts) builds a map of
   provider → key, where a user's own encrypted key **overrides** the env key for that user.
   Only the primary key is user-overridable; extra config (Azure endpoint, Cloudflare account
   id) always comes from env.
2. **Build candidates from `CONNECTION_TYPE`:**
   - `cloud` → configured cloud providers in priority order
   - `local` → Ollama only
   - `auto` → Ollama first, then cloud
3. **Honour `AI_PROVIDER`** (or the user's default provider) if that provider is configured.
4. **Call the first candidate**; on failure, fall through to the next.
5. **If nothing is configured at all**, return **503** with an actionable message.

See [providers](./providers.md).

## Theming

The theme is a set of CSS custom properties on `:root`, overridden by `html.dark`. Tailwind
colours are defined as `rgb(var(--token) / <alpha-value>)`, so the *same* utility classes
(`bg-surface-1`, `text-content`, `bg-ignite/15`) resolve differently per theme. There are no
per-component `dark:` variants anywhere — flipping one class on `<html>` re-themes the entire
application. Dark is the default; an inline script in the root layout applies a stored light
preference before first paint to avoid a flash.

## Notable design decisions

- **Postgres, not SQLite.** SQLite was simpler — no server, synchronous calls — but it bound the
  app to one machine with a persistent disk. That ruled out serverless entirely and made
  horizontal scaling impossible. Moving to Postgres cost an async conversion across ~60 functions
  and every call site, and bought deployment portability.
- **pgvector, not a separate vector service.** Chroma works and remains supported, but it needs a
  long-running process with a volume. Keeping vectors in the database that is already there means
  one datastore, one backup, one failure mode — and it is the only option that works on
  serverless.
- **Everything through `query()`/`transaction()`.** Every exported function goes through helpers
  that await schema bootstrap first, so no caller has to think about ordering.
- **The vector store is behind an interface.** `getVectorStore()` returns a `VectorStore`, which
  is exactly why swapping Chroma for pgvector was one new module rather than a refactor.
- **Embeddings are decoupled from chat.** Groq, the default chat provider, has no embeddings
  endpoint. Treating them as separate adapters is what makes "fast free chat + free embeddings
  from a different vendor" work.
- **`runReadOnlyQuery` uses a READ ONLY transaction.** Even if the NL→SQL validator were
  bypassed, Postgres itself refuses the write — a guarantee SQLite could not give.
- **Middleware works from a public-route allowlist.** Legal pages must be readable signed out, so
  the gate is an explicit list of public prefixes rather than a list of protected routes — which
  means anything new fails closed.
