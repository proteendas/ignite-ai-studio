# Configuration

Every environment variable the application reads, where it is read, and what happens when it is
absent.

Most values are centralised in [`lib/env.ts`](../lib/env.ts). Provider API keys are resolved
through [`lib/ai/keyResolver.ts`](../lib/ai/keyResolver.ts), which prefers a user's own encrypted
key over the env value. OAuth and encryption secrets are read directly from `process.env` at the
point of use.

**Where to put these:** `.env` for Docker Compose, `.env.local` for manual `npm run dev`,
`.env.production` for the production Compose overlay. All are gitignored.

---

## Required

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | Postgres connection string. **Required** — the app refuses to start without it. Any Postgres works: the compose-managed container, Neon, Supabase, RDS. |
| `NEXTAUTH_SECRET` | `dev-insecure-secret-change-me` | Signs session JWTs. **Change it.** The default is insecure and exists only so dev does not crash. Generate with `openssl rand -base64 32`. |
| `ENCRYPTION_KEY` | — | AES-256-GCM key for per-user provider keys and service connections. Minimum 16 characters. Without it the Settings key manager reports encryption unconfigured and refuses to store keys. **Rotating it invalidates every stored secret.** |

> **On serverless, use a *pooled* connection string.** Neon's pooled host contains `-pooler`.
> Every instance opens its own pool, and a direct endpoint exhausts Postgres's connection limit
> under even modest traffic — producing `too many connections` errors that appear only under
> load.

You also need **at least one** way to reach a model: a provider key below, or a reachable Ollama
server with `CONNECTION_TYPE=local` or `auto`.

---

## Core

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXTAUTH_URL` | `http://localhost:3000` | Public base URL. Used for OAuth callbacks and to build password-reset and verification links. **Must be the real public URL in production** or emailed links point at localhost. |
| `PG_POOL_MAX` | `5` | Max pool connections **per instance**. Keep small on serverless — the platform runs many instances and Postgres limits connections per server, not per instance. |
| `VECTOR_DB_PROVIDER` | `pgvector` | `pgvector` (default), `chroma`, `faiss` or `azure-ai-search`. `pgvector` and `chroma` are fully wired; the other two are documented stubs in [`lib/db/vector/`](../lib/db/vector/). |
| `EMBEDDING_DIMENSIONS` | `768` | Width of the pgvector column. **Must match your embeddings model** — see below. |
| `CHROMA_URL` | `http://localhost:8000` | Only used with `VECTOR_DB_PROVIDER=chroma`. Under Compose this is `http://chroma:8000`. |
| `NODE_ENV` | — | Standard Next.js behaviour. |
| `MAINTENANCE_MODE` | `false` | `true` rewrites every page to `/maintenance` and returns 503 from every API route. Enforced in [`middleware.ts`](../middleware.ts). |

### `EMBEDDING_DIMENSIONS`

The `document_chunks.embedding` column is `VECTOR(n)`, and `n` is fixed when the table is first
created. It must match the output width of your embeddings model:

| Model | Value |
| --- | --- |
| Gemini *(default)* | **768** |
| HuggingFace `all-MiniLM-L6-v2` | 384 |
| OpenAI `text-embedding-3-small` | 1536 |
| OpenAI `text-embedding-3-large` | 3072 |
| Ollama `nomic-embed-text` | 768 |

A mismatch fails on the first insert with an error naming both numbers. To change it:
`DROP TABLE document_chunks;` and re-ingest — which you would have to do anyway, since vectors
from different models are not comparable.

---

## AI provider selection

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_PROVIDER` | — | Preferred chat provider id. If unset, or if the named provider has no key, the app falls back to the first provider in a fixed priority order that does have one. |
| `CONNECTION_TYPE` | `cloud` | `cloud` (key-based providers), `local` (Ollama only, fully offline), or `auto` (prefer Ollama when reachable, else cloud). |

### Chat provider keys

Set one or more. Users can also add their own key per provider in Settings, which takes
precedence over the env value for that user.

| Provider id | Variable | Extra configuration |
| --- | --- | --- |
| `groq` | `GROQ_API_KEY` | — |
| `openai` | `OPENAI_API_KEY` | — |
| `azure-openai` | `AZURE_OPENAI_API_KEY` | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_CHAT_DEPLOYMENT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` |
| `mistral` | `MISTRAL_API_KEY` | — |
| `cerebras` | `CEREBRAS_API_KEY` | — |
| `openrouter` | `OPENROUTER_API_KEY` | — |
| `together` | `TOGETHER_API_KEY` | — |
| `github-models` | `GITHUB_MODELS_TOKEN` | — |
| `gemini` | `GOOGLE_GEMINI_API_KEY` | `GEMINI_CHAT_MODEL` (default `gemini-2.5-flash`) |
| `cohere` | `COHERE_API_KEY` | — |
| `huggingface` | `HUGGINGFACE_API_KEY` | `HUGGINGFACE_CHAT_MODEL` |
| `cloudflare-workers-ai` | `CLOUDFLARE_WORKERS_AI_TOKEN` | `CLOUDFLARE_ACCOUNT_ID` |
| `ollama` | *(none needed)* | See local AI below |

### Embeddings

Embeddings are a separate adapter, because several chat providers (Groq among them) have no
embeddings endpoint.

| Variable | Default | Purpose |
| --- | --- | --- |
| `EMBEDDINGS_PROVIDER` | `gemini` | `gemini`, `huggingface`, `openai`, `azure-openai`, `cohere` or `ollama`. |
| `GOOGLE_GEMINI_API_KEY` | — | Key for the default embeddings provider. Free tier available. |
| `GEMINI_EMBED_MODEL` | provider default | Override the embedding model. |
| `HUGGINGFACE_EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Used when the provider is `huggingface`. |

> **Changing the embeddings provider or model invalidates existing vectors.** Embeddings from
> different models are not comparable, so re-ingest your documents after switching.

### Local AI (Ollama)

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | From inside Docker use `http://host.docker.internal:11434`. |
| `OLLAMA_MODEL` | `llama3.2` | Chat model. |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model. |

`CONNECTION_TYPE=local` switches embeddings to Ollama automatically. `CONNECTION_TYPE=auto`
keeps the cloud embeddings default unless you set `EMBEDDINGS_PROVIDER=ollama` explicitly.

---

## Email

Transactional email for password reset and email verification, via
[Resend](https://resend.com). Implemented in [`lib/email/mailer.ts`](../lib/email/mailer.ts).

| Variable | Default | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | — | Resend API key. **When absent the mailer does not fail** — it writes the message, including the action link, to the server console and reports success. |
| `EMAIL_FROM` | `IgniteAI Studio <onboarding@resend.dev>` | Sender identity. Resend's shared `onboarding@resend.dev` works for testing; use your own verified domain in production. |

The console fallback keeps both flows fully exercisable locally without a mail account. In
production, set both variables — otherwise users will never receive their reset links.

---

## OAuth (optional)

Providers are registered only when both variables of a pair are present. Constructing them with
empty values makes NextAuth throw at sign-in, so partial configuration is ignored entirely.

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google sign-in. Also used by the Gmail agent connection. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub sign-in. Note these names differ from NextAuth's own docs (`GITHUB_ID` / `GITHUB_SECRET`) for consistency with the Google pair. |

---

## Debugging

| Variable | Purpose |
| --- | --- |
| `DEBUG_RETRIEVAL` | Logs retrieval scores and selected chunks to the server console. Verbose; development only. |

---

## Rate limits

Not configurable by environment — they are compiled in via
[`lib/rateLimit.ts`](../lib/rateLimit.ts). Current values, all per authenticated user unless
noted:

| Endpoint | Limit |
| --- | --- |
| `POST /api/chat` | 30 / minute |
| `POST /api/agent`, `POST /api/agent/actions/[id]` | 10 / minute |
| `POST /api/generate-content` | 15 / minute |
| `POST /api/ingest` | 10 / minute |
| `POST /api/auth/change-password` | 5 / minute |
| `POST /api/auth/forgot-password` | 5 / 15 minutes, per IP |
| `POST /api/auth/reset-password` | 10 / 15 minutes, per IP |
| `POST /api/auth/verify-email` | 10 / 15 minutes, per IP |
| `POST /api/auth/resend-verification` | 3 / 15 minutes, per user |

The limiter is **backed by Postgres** (`rate_limits` table), incremented atomically in a single
statement, so the limit holds however many instances are running — including across serverless
invocations, where each request may get a fresh process.

It fails **open**: if the database is unreachable, requests are allowed rather than the whole app
returning 429. A database outage should not present as a rate-limit wall.

The cost is one round-trip per limited request, which is why only expensive and
security-sensitive endpoints are limited.
