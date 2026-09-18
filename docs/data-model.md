# Data model

Everything lives in **one Postgres database** — application tables and vector embeddings alike.
The schema is a string constant in [`lib/db/sql/schema.ts`](../lib/db/sql/schema.ts); all access
goes through [`lib/db/sql/client.ts`](../lib/db/sql/client.ts).

## How the schema is applied

The DDL is inlined in TypeScript rather than kept in a `.sql` file: serverless bundlers do not
reliably ship loose non-JS assets beside the compiled handler, and there is no dependable
`__dirname` at runtime.

It is applied lazily on the first query a process makes, behind a memoised promise on
`globalThis` (so concurrent callers in one container share a single run) and a Postgres
**advisory lock** (so several cold-starting instances cannot race on `CREATE TABLE IF NOT
EXISTS`). If bootstrap fails the promise is cleared, so the next request retries instead of the
container staying permanently broken.

Everything in it is idempotent — `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and
`ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `migrateExistingTables()`.

> **Adding a column means editing two places:** the `CREATE TABLE` in `schema.ts` (for fresh
> databases) *and* an `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `migrateExistingTables()` (for
> existing ones). Miss the second and deployed databases silently lack the column.

The connection pool is likewise memoised on `globalThis`, so Next.js hot reload does not open a
new pool on every edit and warm serverless containers reuse theirs.

## Driver type coercion

`node-postgres` returns some column types as JavaScript values you would not expect:

| Postgres type | Comes back as | Handled by |
| --- | --- | --- |
| `TIMESTAMPTZ`, `DATE` | `Date` object | `toIso()` → ISO string |
| `BIGINT`, and `SUM()` over an integer | **string** (to avoid precision loss) | `toNum()` |
| `BOOLEAN` | real `true`/`false` (not `0`/`1` as in SQLite) | direct |

Every mapper funnels through these, so driver types never leak into the application's record
types — which are all plain strings, numbers and booleans.

## Ownership and isolation

Almost every table carries an `owner_id` referencing `users.id`, and **every read is filtered by
the session user's id**. Rows keyed by thread (`chat_messages`, `thread_summaries`) inherit
ownership through `chat_threads`. A resource belonging to someone else returns 404 rather than
403, so ids cannot be probed.

## Tables

### Identity

**`users`** — `id` (uuid, PK), `email` (unique, lowercased), `password_hash` (bcrypt; null for
OAuth-only accounts), `name`, `provider` (`credentials` | `oauth`), `onboarded_at`,
`email_verified_at`, `created_at`.

**`auth_tokens`** — single-use, expiring links for the email flows.
`token_hash` (PK, **sha256 of the token — the token itself is never stored**), `owner_id`,
`kind` (`password_reset` | `email_verification`), `expires_at`, `consumed_at`, `created_at`.
Issuing a token deletes any outstanding token of the same kind for that user, and redemption
happens inside a transaction so a token cannot be claimed twice concurrently.

### Documents and retrieval

**`documents`** — `id`, `owner_id`, `filename`, `mime_type`, `size_bytes`,
`status` (`processing` | `ready` | `failed`), `chunk_count`, `error`, `created_at`.
Indexed on `owner_id`.

**`embedding_cache`** — PK `(content_hash, provider, model)`, plus `vector_json`, `created_at`.
`content_hash` is sha256 of the chunk text. Identical text is never embedded twice for the same
provider and model. Changing embeddings provider or model produces different keys, so old
entries are simply never hit again.

**`document_chunks`** *(pgvector only)* — `id` (PK), `owner_id`, `document_id`, `filename`,
`chunk_index`, `content`, `embedding VECTOR(n)`.

This is the vector store. It is created separately from the main schema, because
`CREATE EXTENSION vector` needs privileges a managed role may lack and a Chroma-backed
deployment should not fail to boot over an extension it never uses.

Indexes: an HNSW index on `embedding` using `vector_cosine_ops` for similarity search, plus a
btree on `(owner_id, document_id)` for scoped lookups and deletion.

> **`VECTOR(n)` is fixed when the table is created** and must match the embeddings model's output
> width (`EMBEDDING_DIMENSIONS`; 768 for Gemini, 384 for all-MiniLM-L6-v2, 1536 for OpenAI
> text-embedding-3-small). A mismatch fails loudly on insert with a message naming both numbers.
> To change it: `DROP TABLE document_chunks;` and re-ingest.

### Conversations

**`chat_threads`** — `id`, `owner_id`, `title`, `pinned`, `created_at`, `updated_at`.

**`chat_messages`** — `id`, `thread_id`, `role`, `content`, `meta_json` (citations, provider),
`token_count`, `document_refs`, `created_at`. Indexed on `thread_id`.

**`thread_summaries`** — `thread_id` (PK), `summary`, `through_message_count`, `updated_at`.
A rolling summary of older history so prompts carry only the last few turns verbatim.
`through_message_count` records how much the summary covers, so it is regenerated only when new
messages age out of the verbatim window — not on every turn.

### Agent

**`agent_actions`** — `id`, `thread_id`, `owner_id`, `tool`, `summary`, `payload_json`,
`status` (`proposed` | `approved` | `rejected` | `executed` | `failed`), `result_json`,
**`state_json`**, `decided_at`, `created_at`.

`state_json` carries the serialised, paused ReAct loop. This is what lets a proposal survive the
gap — possibly minutes, possibly a page reload — between the agent asking and the human
answering, and then resume exactly where it stopped.

**`user_connections`** — `id`, `owner_id`, `service`, `ciphertext`, `iv`, `auth_tag`, `label`,
`created_at`. Unique on `(owner_id, service)`. Encrypted exactly like `user_api_keys`; `label`
is a display-safe hint such as a repo or email address.

### Settings

**`user_preferences`** — `owner_id` (PK), `default_provider`, `default_model`, `default_tone`,
`theme`, `connection_type` (`cloud` | `local` | `auto`), `auto_approve_json` (a JSON map of tool
name → true; read-only tools only, off by default).

**`user_api_keys`** — `id`, `owner_id`, `provider`, `ciphertext`, `iv`, `auth_tag`,
`key_preview`, `created_at`. Unique on `(owner_id, provider)`, so saving replaces.
**Plaintext is never stored.** AES-256-GCM, see [`lib/crypto.ts`](../lib/crypto.ts).

### Generated content

**`generated_content`** — `id`, `owner_id`, `document_id`, `content_type`, `tone`, `channel`,
`output`, `created_at`. Indexed on `owner_id`.

### Telemetry

**`usage_events`** — `id`, `owner_id`, `provider`, `kind` (`chat` | `embed` | `generate`),
`prompt_tokens`, `completion_tokens`, `created_at`.

**`request_logs`** — `id`, `owner_id`, `route`, `status`, `latency_ms`, `provider`, `created_at`.

**`error_logs`** — `id`, `owner_id`, `route`, `message`, `created_at`.

**`activity_events`** — `id`, `owner_id`, `type` (`upload` | `chat` | `generate` | `delete` | …),
`summary`, `created_at`.

> These grow without bound. There is no retention job; on a long-lived deployment, prune them —
> especially on Neon's 0.5 GB free tier.

### Rate limiting

**`rate_limits`** — `bucket_key` (PK), `hits`, `window_start`.

One row per limiter bucket. `consumeRateLimit()` increments it in a **single atomic upsert** that
either starts a fresh window (when the stored one has aged out) or increments the current one, so
concurrent requests landing in different processes cannot both read a stale count and both be
allowed.

### Demo data

**`products`** and **`orders`** back the natural-language → SQL routing demo. They are seeded
programmatically by `seedDemoDataIfEmpty()` only when `products` is empty, not from `schema.sql`.

## Vector store

The store sits behind the `VectorStore` interface in [`lib/db/vector/`](../lib/db/vector/);
`getVectorStore()` picks the implementation from `VECTOR_DB_PROVIDER`.

| Provider | Status | Notes |
| --- | --- | --- |
| `pgvector` | **Default, fully wired** | Embeddings in the same Postgres database. Works on serverless. |
| `chroma` | Fully wired | Separate long-running service. Self-hosted only. |
| `faiss` | Stub | Documented placeholder |
| `azure-ai-search` | Stub | Documented placeholder |

Every chunk is tagged with its owning user, and similarity search filters on `owner_id` — that
filter is the isolation boundary between accounts.

Search uses cosine distance:

```sql
SELECT …, 1 - (embedding <=> $1::vector) AS score
FROM document_chunks
WHERE owner_id = $2
ORDER BY embedding <=> $1::vector
LIMIT $3;
```

`<=>` returns **distance** (0 = identical), so similarity is `1 - distance`.

## Account deletion

`deleteUserData(ownerId)` runs one transaction that deletes thread-keyed rows first (messages and
summaries, via a subquery over the owner's threads), then every `owner_id`-keyed table, then the
user row. It is called by `POST /api/account/delete`.

Document chunks are removed separately, when each document is deleted, through
`vectorStore.deleteDocument()`.

**When you add an owner-scoped table, add it to that list too** — otherwise deletion silently
leaves orphaned rows behind.
