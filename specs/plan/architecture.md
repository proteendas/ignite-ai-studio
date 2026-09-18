# Plan — Architecture

## Stack (retained + added)
- Next.js 14 App Router, TS strict, Tailwind. Retained: NextAuth (JWT), multi-provider LLM adapter. **Postgres (`pg`) + pgvector** replaced better-sqlite3 + Chroma in Upgrade 3 — see below.
- **Added deps**: `bootstrap-icons` (icons), `framer-motion` (minimal transitions), `docx` (content export). No other icon/UI libraries (constitution #6).

## Theme tokens (Tailwind + CSS variables)
```
--ignite-red:#ed1515  --ignite-red-dark:#b30f0f  --ignite-red-light:#ff4d4d
--base:#000000  --surface-1:#0a0a0a  --surface-2:#1a1a1a  --surface-3:#262626
--text:#f5f5f5  --text-muted:#737373
success/warning/error = red-black-derived tints; status dots the only extra hues.
```
Tailwind exposes these as `ignite.*`, `surface.*`, `text.*`. `darkMode: 'class'`; `<html class="dark">` default, toggle flips it and persists to localStorage.

## Data model (additions)
- `users`: + `onboarded_at TEXT NULL`.
- `user_preferences`: ownerId PK, default_provider, default_model, default_tone, theme.
- `user_api_keys`: id, ownerId, provider, ciphertext, iv, auth_tag, key_preview, created_at (UNIQUE ownerId+provider). AES-256-GCM via `lib/crypto.ts` keyed off `ENCRYPTION_KEY`.
- `chat_threads` (rename/extend prior chat_sessions): id, ownerId, title, pinned INTEGER, created_at, updated_at.
- `chat_messages`: unchanged (FK → chat_threads).
- `generated_content`: id, ownerId, documentId, content_type, tone, channel, output, created_at.
- `usage_events`: id, ownerId, provider, kind ('chat'|'embed'|'generate'), prompt_tokens, completion_tokens, created_at.
- `request_logs`: id, ownerId, route, status, latency_ms, provider, created_at.
- `error_logs`: id, ownerId, route, message, created_at.
- `activity_events`: id, ownerId, type, summary, created_at (feeds dashboard activity feed).

## API contracts (new/changed)
- `POST /api/ingest` (retained) — now also writes a `usage_events` embed row + `activity_events`.
- `POST /api/chat` (retained, extended) — takes `threadId`; writes messages, usage, request_logs.
- `GET/POST/PATCH/DELETE /api/threads[/:id]` — list/create/rename-pin/delete threads.
- `POST /api/generate-content` (extended) — accepts `channels: []` for batch; `variation: boolean`.
- `GET/POST/DELETE /api/content-library[/:id]` — saved generated content.
- `GET/POST/DELETE /api/keys[/:provider]` — encrypted per-user provider keys (never returns plaintext).
- `GET/PUT /api/preferences` — user defaults.
- `GET /api/provider-health` — per-provider `{configured, ok, source: 'user'|'env'}` with live probe.
- `GET /api/usage` — per-user usage/cost summary + recent request/error logs.
- `POST /api/account/delete` — cascade delete all user data (SQL + vector).
- `POST /api/onboarding/complete` — set `onboarded_at`.

## Upgrade 2 additions (2026-07-19)

### Data model
- `chat_messages`: + `token_count INTEGER`, `document_refs TEXT` (JSON doc-id array). Idempotent `ALTER TABLE` migrations in `client.ts` cover pre-existing databases.
- `thread_summaries`: thread_id PK, summary, through_message_count, updated_at — rolling compression of history older than the 8-message verbatim window.
- `agent_actions`: id, thread_id, owner_id, tool, summary, payload_json, status ('proposed'→'approved'/'rejected'→'executed'/'failed'), result_json, state_json (paused ReAct loop), decided_at, created_at.
- `user_connections`: id, owner_id, service ('github'|'google-gmail'), ciphertext/iv/auth_tag (AES-256-GCM), label, UNIQUE(owner_id, service).
- `embedding_cache`: (content_hash, provider, model) PK → vector_json. Never re-embed identical text.
- `user_preferences`: + `connection_type` ('cloud'|'local'|'auto'), `auto_approve_json`.

### API contracts
- `POST /api/chat` — + `mode: 'grounded'|'general'` (grounded default; retrieval mandatory), `documentId` gated on ingestion status `ready` (409 otherwise); SSE `done` now carries token counts; citations carry similarity scores.
- `POST /api/agent` — agent-mode turn; SSE `meta | step | action_request | token | done | error`; stream closes on `action_request` awaiting decision.
- `GET /api/agent/actions?threadId=` / `POST /api/agent/actions/:id {decision, payload?}` — activity log + HITL decision; approval resumes the loop in a fresh SSE stream.
- `GET/POST /api/connections`, `DELETE /api/connections/:service`, `GET /api/connections/google/{start,callback}` — encrypted tool credentials (GitHub PAT, Gmail OAuth).
- `POST /api/auth/change-password` — credentials accounts only.
- `GET /api/provider-health` — + `local {reachable, baseUrl, models[]}` (Ollama detection) and effective `connectionType`.
- `GET /api/documents/:id` — single-document status (drives the in-chat ingestion card polling).

### Module map
- `lib/ai/tools/` (registry + github + email), `lib/ai/agent/` (ReAct loop + prompts, max 6 steps).
- `lib/ai/providers/ollama.ts` — local provider behind the same `AIProvider` interface; `lightModelFor()` routes small internal calls to cheap models.
- `components/agent/` (AgentApprovalCard, AgentActivityLog), `components/chat/CitationsPanel`, mode toggle, in-chat upload card, session token counter.
- `app/icon.svg` — browser tab icon (flame on dark rounded square), auto-served by Next.

## Provider key resolution (updated)
`resolveProvider()` / `embeddingsAdapter` now check, in order: (1) the requesting user's decrypted `user_api_keys` for the provider, (2) `process.env`. This makes BYO-key per-user work while keeping env fallback. Key material is fetched server-side at call time only.

## Component tree (high level)
- `AppShell` = Sidebar (bi icons, active state) + Topbar (theme toggle, provider health pill, user menu) + Toaster.
- Pages: `/dashboard` (StatTiles, ActivityFeed, QuickActions), `/chat` (ThreadSidebar + ChatWindow + TypingIndicator), `/documents` (Library w/ search), `/content-generator` (Picker → Selector → BatchOutputs), `/settings` (Keys, Defaults, Providers health, Danger zone), `/observability` (usage + logs).
- Cross-cutting: `Toaster`/`useToast`, `ThemeToggle`, `Skeleton`, `OnboardingTour`, `hoverGlow` utility class.

## Upgrade 3 — Postgres + pgvector (2026-09-18)

### Why
The data layer assumed a persistent local filesystem: `better-sqlite3` wrote to a file and
Chroma ran as a long-lived service with a volume. That made the app a single-instance
application and ruled out serverless hosting entirely — on Vercel, a SQLite file written during
one invocation is gone by the next. Porting to Postgres was the prerequisite for the free
Vercel + Neon deployment path.

### Stack changes
- **`better-sqlite3` → `pg`.** Synchronous calls became async: ~60 exported functions in
  `lib/db/sql/client.ts` and every call site. No native dependency remains, which also removed
  the `node-gyp` build failures on newer Node.
- **Chroma → pgvector (default).** `document_chunks` holds `embedding VECTOR(n)` with an HNSW
  index under `vector_cosine_ops`. Chroma stays supported behind `VECTOR_DB_PROVIDER=chroma`;
  the existing `VectorStore` interface meant this was one new module, not a refactor.
- **Schema `.sql` file → `lib/db/sql/schema.ts`.** Serverless bundlers do not reliably ship
  loose non-JS assets beside the handler and `__dirname` is unreliable, so the DDL is a string
  constant and is part of the bundle by construction.
- **Rate limiter: in-memory Map → `rate_limits` table.** A per-process counter never accumulates
  when every invocation may get a fresh process, and multiple replicas each enforced their own
  copy. Now one atomic upsert per check; fails **open** on database unavailability.

### Schema bootstrap
Applied lazily on a process's first query, behind a memoised promise on `globalThis` (concurrent
callers in one container share a run) and a Postgres **advisory lock** (concurrent cold-starting
instances cannot race on `CREATE TABLE IF NOT EXISTS`). A failed bootstrap clears the promise so
the next request retries. New columns use `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.

### Type coercion
`node-postgres` returns `TIMESTAMPTZ` as `Date` and `BIGINT` — including `SUM()` over an integer
column — as a **string**. All mappers funnel through `toIso()` / `toNum()` so driver types never
reach the application's record types.

### Hardening gained
- `runReadOnlyQuery` now wraps NL→SQL execution in a `READ ONLY` transaction, so even a bypassed
  validator cannot write. SQLite could not enforce this.
- `consumeAuthToken` uses `SELECT … FOR UPDATE`, so a single-use token cannot be redeemed twice
  by concurrent requests.
- Rate limits now hold across instances rather than per process.

### Config
- **Added**: `DATABASE_URL` (required), `PG_POOL_MAX` (default 5), `EMBEDDING_DIMENSIONS`
  (default 768, must match the embeddings model — `VECTOR(n)` is fixed at table creation).
- **Removed**: `SQLITE_PATH`.
- **Changed**: `VECTOR_DB_PROVIDER` now defaults to `pgvector`.
- `maxDuration` set on ingest, chat, agent, agent-decision and generate-content routes, which
  legitimately exceed the serverless default.

### Deployment
Two supported targets, neither needing code changes: a single VM with Docker Compose (app +
Postgres + Caddy), and **Vercel + Neon** on free tiers. Compose gained a `postgres` service on
the `pgvector/pgvector:pg16` image; Chroma moved behind a `chroma` profile.
