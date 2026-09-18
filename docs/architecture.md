# Architecture

How IgniteAI Studio is put together, and why.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS with CSS-variable theme tokens |
| Auth | NextAuth (JWT sessions, credentials + optional Google/GitHub) |
| Relational store | SQLite via `better-sqlite3` (synchronous, single file) |
| Vector store | Chroma (FAISS and Azure AI Search are pluggable stubs) |
| AI | Provider-agnostic adapter over 12 cloud providers plus Ollama |
| Email | Resend over plain HTTPS, no SDK |

There is no separate backend service. API routes in `app/api/` are the backend; the same
deployment serves both.

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
    sql/          SQLite client, schema, NL→SQL
    vector/       Vector store interface + Chroma/FAISS/Azure implementations
  ingest/         parse, sanitize, chunk
  intent/         Intent router
  auth/           NextAuth config, password hashing, auth tokens
  email/          Resend mailer
  crypto.ts       AES-256-GCM encrypt/decrypt for stored secrets
  env.ts          Centralised environment access
  rateLimit.ts    In-memory token bucket
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
  │  embed(query) → Chroma similarity        generate read-only SQL
  │  search scoped to owner's docs           run against products/orders
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
  ├─ vectorStore.add()       one Chroma record per chunk, owner-tagged
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

## Notable design decisions

- **SQLite, synchronously.** `better-sqlite3` is synchronous, which suits Next.js route handlers
  and removes a class of async bugs. The cost is that it binds the app to a single instance with
  a real filesystem — the central constraint in [deployment](./deployment/README.md).
- **Schema is idempotent.** `schema.sql` uses `CREATE TABLE IF NOT EXISTS` and runs on every
  startup. Since that cannot add a column to an existing table, `migrateExistingTables()` in
  [`client.ts`](../lib/db/sql/client.ts) back-fills new columns behind a `PRAGMA table_info`
  guard. Add new columns in both places.
- **The vector store is behind an interface.** `getVectorStore()` returns a `VectorStore`, so
  swapping Chroma for something else is one module, not a refactor.
- **Embeddings are decoupled from chat.** Groq, the default chat provider, has no embeddings
  endpoint. Treating them as separate adapters is what makes "fast free chat + free embeddings
  from a different vendor" work.
- **The rate limiter is in-memory.** Deliberately simple, and explicitly a single-instance
  assumption. Multiple replicas need a shared store.
- **Middleware works from a public-route allowlist.** Legal pages must be readable signed out,
  so the gate is an explicit list of public prefixes rather than a list of protected routes —
  failing closed for anything new.
