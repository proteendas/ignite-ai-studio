# Data model

The relational schema lives in [`lib/db/sql/schema.sql`](../lib/db/sql/schema.sql); all access
goes through [`lib/db/sql/client.ts`](../lib/db/sql/client.ts).

## How the schema is applied

`schema.sql` uses `CREATE TABLE IF NOT EXISTS` throughout and is executed on **every** startup,
so it is safe to re-run. Because that cannot add a column to a table that already exists,
columns introduced after the initial release are back-filled by `migrateExistingTables()`,
guarded by `PRAGMA table_info` so it is idempotent.

> **Adding a column means editing two places:** the `CREATE TABLE` in `schema.sql` (for fresh
> databases) *and* an `ensureColumn(...)` call in `migrateExistingTables()` (for existing ones).
> Miss the second and deployed databases silently lack the column.

SQLite runs with `journal_mode = WAL` and `foreign_keys = ON`. The connection is a singleton
stashed on `globalThis` under a symbol, so Next.js hot reload does not reopen the file or
re-seed on every edit.

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

> Chunk **vectors** live in Chroma, not SQLite. SQLite holds document metadata and the cache;
> the vector store holds the embeddings. Deleting a document must clear both — `DELETE
> /api/documents/[id]` does.

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

> These grow without bound. There is no retention job; on a long-lived deployment, prune them.

### Demo data

**`products`** and **`orders`** back the natural-language → SQL routing demo. They are seeded
programmatically by `seedDemoDataIfEmpty()` only when `products` is empty, not from `schema.sql`.

## Vector store

Chunks are stored in Chroma, one record per chunk, tagged with the owning user and document so
similarity search can be filtered to the requester's own documents. The store sits behind the
`VectorStore` interface in [`lib/db/vector/`](../lib/db/vector/); `getVectorStore()` picks the
implementation from `VECTOR_DB_PROVIDER`. FAISS and Azure AI Search are documented stubs.

## Account deletion

`deleteUserData(ownerId)` runs one transaction that deletes thread-keyed rows first (messages,
summaries), then every `owner_id`-keyed table, then the user row. It is called by
`POST /api/account/delete`.

**When you add an owner-scoped table, add it to that list too** — otherwise deletion silently
leaves orphaned rows behind.
