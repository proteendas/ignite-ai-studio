# 🔥 IgniteAI Studio

**Spark intelligence from any document.**

A polished, multi-provider AI content and assistant platform. Point it at your own documents
and structured data and it becomes your studio — dark-mode-first, red/black themed, built
spec-first (see [`/specs`](./specs)).

- **RAG Chatbot**: upload PDF/DOCX/TXT/MD documents, embed them into a vector store, and get
  grounded, cited answers. A visible **Grounded / General / Agent** mode toggle shows whether
  retrieval is active; grounded answers include a Sources panel with the exact chunks and
  similarity scores used, and chatting with a document is blocked until its ingestion is ready.
- **Agentic AI with human-in-the-loop**: an extensible tool registry (`lib/ai/tools/`) lets
  IgniteAI act — read GitHub repos/issues/PRs, create issues, draft and send Gmail — via a
  ReAct loop (max 6 steps). Every action is shown for **Approve / Edit / Cancel** before it
  executes; decisions are logged in a per-thread Agent Activity Log. Read-only tools can be
  auto-approved per tool (off by default); write actions always ask.
- **Local AI (Ollama)**: run fully offline with no API key — chat and embeddings through a
  local Ollama server, with a Cloud / Local / Auto connection-type setting (Auto prefers
  local and falls back to cloud).
- **Intent-Aware Routing**: questions are automatically classified and routed to either
  document retrieval or a natural-language-to-SQL query against structured data.
- **Cognitive Assistant**: persisted multi-turn threads (rename/pin/delete), clarification
  logic for vague questions, tone customization, and citation-grounded answers.
- **Content Generator**: turn any ingested document into social posts, blog drafts, ad copy,
  emails, or product descriptions — grounded strictly in that document's facts. Batch-generate
  across channels, regenerate variations, export `.txt`/`.md`/`.docx`, save to a library.
- **Dashboard & Observability**: usage stats (tokens, documents, content pieces), recent
  activity feed, per-user request/error logs and per-provider usage/cost tracking.
- **Provider-agnostic + BYO-key**: swap the chat LLM (Groq, OpenAI, Azure OpenAI, Mistral,
  Cerebras, OpenRouter, Together, GitHub Models, Gemini, Cohere, HuggingFace, Cloudflare
  Workers AI) with automatic failover. Users can store their own API keys per provider,
  **encrypted at rest (AES-256-GCM)**. Embeddings run through a dedicated adapter defaulting to
  **Google Gemini** (free tier) with **HuggingFace** as a fallback.
- **One database**: Postgres holds the application tables *and* the vector embeddings, via
  **pgvector** with an HNSW cosine index. One connection string, one backup. Chroma remains
  supported for self-hosted deployments; FAISS / Azure AI Search are pluggable stubs.
- **Deploys anywhere**: a single VM with Docker Compose, or free on **Vercel + Neon** — no code
  changes either way. See [deployment](./docs/deployment/README.md).

## Documentation

Full documentation lives in [`/docs`](./docs):

| | |
| --- | --- |
| [Getting started](./docs/getting-started.md) | Prerequisites, Docker quick start, first-run walkthrough |
| [Configuration](./docs/configuration.md) | Every environment variable |
| [Features](./docs/features.md) | What the product does |
| [Architecture](./docs/architecture.md) | How it is built, and why |
| [API reference](./docs/api-reference.md) | Every endpoint |
| [Data model](./docs/data-model.md) | Schema, ownership, the vector store |
| [Providers](./docs/providers.md) | Swapping and adding AI providers |
| [Agent & tools](./docs/agent-tools.md) | The ReAct loop, HITL, adding a tool |
| [UI & design system](./docs/ui-design-system.md) | Theme tokens and components |
| [Security](./docs/security.md) | Posture and known limitations |
| [Contributing](./docs/contributing.md) | Local loop and conventions |
| **[Deployment](./docs/deployment/README.md)** | **[Single VM / EC2](./docs/deployment/ec2-docker.md)** · **[Free tier](./docs/deployment/serverless-free-tier.md)** |

## Spec-driven

This upgrade was built spec-first. The [`/specs`](./specs) folder is the source of truth:
`constitution.md` (guardrails), `clarify.md` (resolved decisions), feature specs
(`auth.md`, `rag-chat.md`, `content-generator.md`), `plan/architecture.md`, `tasks/`
(the task checklist), and `lessons-learned.md` (bugs & deviations).

## Quick start (Docker — recommended)

This is the primary, supported way to run the app. No local Node.js or Postgres install
required.

1. **Copy the environment template and add at least one AI provider key:**

   ```bash
   cp .env.example .env
   ```

   In `.env` set:
   - A **chat provider key** — default `GROQ_API_KEY=...` (free/fast; [console.groq.com](https://console.groq.com)), or any other provider below it.
   - An **embeddings key** — default `GOOGLE_GEMINI_API_KEY=...` with `EMBEDDINGS_PROVIDER=gemini` (free tier; [aistudio.google.com](https://aistudio.google.com/app/apikey)). Groq has no embeddings endpoint, so this is separate from the chat provider.
   - `NEXTAUTH_SECRET` and `ENCRYPTION_KEY` — generate each with:

   ```bash
   openssl rand -base64 32
   ```

   `DATABASE_URL` is set for you by Compose and points at its own Postgres container.

2. **Build and start everything:**

   ```bash
   docker compose up --build
   ```

   This starts two containers:
   - `app` — the Next.js application on [http://localhost:3000](http://localhost:3000)
   - `postgres` — Postgres with pgvector on port 5432

   Everything — users, documents, chat history **and** the vector embeddings — lives in one
   Postgres database, persisted in the `postgres-data` Docker volume. The app creates its own
   tables on the first request; there is no migration step.

   To use Chroma instead of pgvector, start it under its profile and set
   `VECTOR_DB_PROVIDER=chroma`:

   ```bash
   docker compose --profile chroma up -d
   ```

3. **Open [http://localhost:3000](http://localhost:3000)**, register an account, upload a
   document on the Documents page, then try Chat and Content Generator.

To stop: `docker compose down` (add `-v` to also wipe the persisted volumes).

> Port already in use? Both host ports are overridable without editing the compose file:
> `APP_PORT=3010 CHROMA_PORT=8010 docker compose up --build`.

### Development mode (hot reload, still via Docker)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

```
### Production mode

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

This mounts your source tree into the container and runs `next dev` instead of a production
build, so edits reload live.

## Manual setup (without Docker)

If you'd rather run Node directly:

```bash
npm install
cp .env.example .env.local
# Edit .env.local: set DATABASE_URL and at least one AI provider key.
npm run dev
```

You need a Postgres database with pgvector. Either start just that container:

```bash
docker compose up -d postgres
```

…or point `DATABASE_URL` at a free [Neon](https://neon.tech) project. Then set in `.env.local`:

```bash
DATABASE_URL=postgres://igniteai:igniteai@localhost:5432/igniteai?sslmode=disable
VECTOR_DB_PROVIDER=pgvector
EMBEDDING_DIMENSIONS=768
```

The app creates its own tables on the first request — there is no migration step. There are no
native dependencies, so `npm install` needs no compiler.

## Choosing providers

Only one provider needs a key to get started. Set `AI_PROVIDER` to your preferred one, or leave
it unset and the app auto-selects the first configured provider from this priority list: `groq →
openai → azure-openai → mistral → cerebras → openrouter → together → github-models → gemini →
cohere → huggingface → cloudflare-workers-ai`.

| Provider | Env var(s) | Notes |
|---|---|---|
| Groq | `GROQ_API_KEY` | Chat only — free, very fast. |
| OpenAI | `OPENAI_API_KEY` | Chat. |
| Azure OpenAI | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT` (+ deployment names) | Chat via your Azure deployment. |
| Mistral | `MISTRAL_API_KEY` | Chat. |
| Cerebras | `CEREBRAS_API_KEY` | Chat. |
| OpenRouter | `OPENROUTER_API_KEY` | Chat; free-tier models available. |
| Together | `TOGETHER_API_KEY` | Chat. |
| GitHub Models | `GITHUB_MODELS_TOKEN` | Chat; free with a GitHub account. |
| Google Gemini | `GOOGLE_GEMINI_API_KEY` | Chat **and embeddings** (default embeddings provider). |
| Cohere | `COHERE_API_KEY` | Chat. |
| HuggingFace | `HUGGINGFACE_API_KEY` | Chat + **embeddings** (fallback embeddings provider). |
| Cloudflare Workers AI | `CLOUDFLARE_WORKERS_AI_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Chat. |

**Chat provider selection**: set `AI_PROVIDER` to your preferred one, or leave it unset and the
app auto-selects the first configured provider in priority order (`groq → openai → azure-openai
→ mistral → cerebras → openrouter → together → github-models → gemini → cohere → huggingface →
cloudflare-workers-ai`). Every configured provider is also a **failover** candidate — if the
active one errors (quota/outage/bad key), the app retries the next before giving up.

**Embeddings** are resolved separately through `lib/ai/embeddingsAdapter.ts` and selected with
`EMBEDDINGS_PROVIDER` (`gemini` default, or `huggingface`). This is independent of the chat
provider, since fast chat providers like Groq have no embeddings endpoint.

**Per-user (BYO) keys**: signed-in users can store their own key per provider in **Settings**,
encrypted at rest with AES-256-GCM (requires `ENCRYPTION_KEY`). A user key takes precedence over
the env key for that provider; the plaintext is never returned to the client or logged.

**Local AI (no API key)**: install [Ollama](https://ollama.com), `ollama pull llama3.2` (and
`ollama pull nomic-embed-text` for local embeddings), then set the Connection Type in Settings
(or `CONNECTION_TYPE` env) to `local` or `auto`. In Docker, set
`OLLAMA_BASE_URL=http://host.docker.internal:11434` so the container can reach the host's
Ollama. Local mode conserves cloud quota — handy for iterative testing.

**Token efficiency**: only top-k chunks are injected (never whole documents), older chat
history is compressed into a rolling summary, embeddings are cached (identical text is never
re-embedded), tool outputs are truncated, small internal calls (classification, summarization)
route to each provider's cheapest model, and a live token counter sits in the chat header.

Check **Settings** in the app to see which provider is actually active at runtime.

## Architecture

```mermaid
flowchart TB
    subgraph Client
        UI[Next.js App Router UI<br/>chat / documents / content-generator]
    end

    subgraph API["Next.js API Routes"]
        AUTH["/api/auth/*<br/>NextAuth (JWT)"]
        INGEST["/api/ingest"]
        CHAT["/api/chat"]
        GEN["/api/generate-content"]
    end

    subgraph Logic["lib/"]
        INTENT["intent/router.ts<br/>classify + clarify"]
        NLSQL["db/sql/nlToSql.ts<br/>NL → SQL (guarded)"]
        PROMPTS["ai/prompts.ts"]
        ADAPTER["ai/providerAdapter.ts<br/>resolve + fallback"]
        KEYS["ai/keyResolver.ts<br/>user key ▸ env key"]
        EMB["ai/embeddingsAdapter.ts<br/>Gemini ▸ HuggingFace"]
        CRYPTO["crypto.ts<br/>AES-256-GCM"]
        PARSE["ingest/parse.ts + chunk.ts + sanitize.ts"]
    end

    subgraph Providers["Chat providers (pluggable, failover)"]
        GROQ[Groq]
        OPENAI[OpenAI]
        OTHERS[Azure / Mistral / Gemini / Cohere / .../]
    end

    subgraph Data["Postgres (one database)"]
        PGVEC[(pgvector<br/>document_chunks<br/>HNSW cosine index)]
        PGTAB[(application tables<br/>users, documents, threads,<br/>generated content, usage/logs,<br/>encrypted keys, rate limits,<br/>demo orders/products)]
    end

    UI -->|upload| INGEST --> PARSE --> EMB --> PGVEC
    INGEST --> PGTAB

    UI -->|ask| CHAT --> INTENT
    INTENT -->|document| EMB
    EMB --> PGVEC --> PROMPTS
    INTENT -->|structured-data| NLSQL --> PGTAB
    NLSQL --> PROMPTS
    PROMPTS --> ADAPTER
    ADAPTER --> KEYS
    KEYS --> CRYPTO
    CRYPTO -.decrypt.-> PGTAB
    ADAPTER --> GROQ & OPENAI & OTHERS
    CHAT -->|SSE stream| UI
    CHAT --> PGTAB

    UI -->|generate / batch| GEN --> CHROMA
    GEN --> ADAPTER

    UI --> AUTH --> SQLITE
```

## Deliverable structure

```
/specs                  Source of truth: constitution, clarify, feature specs, plan, tasks, lessons-learned
/app                    Next.js routes (App Router)
  /login, /dashboard, /chat, /documents, /content-generator, /settings, /observability
  /api/auth, /api/chat, /api/ingest, /api/generate-content, /api/documents,
  /api/threads, /api/content-library, /api/keys, /api/preferences, /api/account,
  /api/usage, /api/activity, /api/observability, /api/provider-health, /api/onboarding
/lib
  /ai/                  providerAdapter.ts + providers/*, embeddingsAdapter.ts (Gemini/HF),
                        keyResolver.ts (per-user keys), prompts.ts
  /db/
    /vector/            VectorStore interface + pgvector (default) and Chroma (both wired),
                        FAISS/Azure AI Search (stubs)
    /sql/               Postgres pool + query/transaction helpers, schema.ts (inlined DDL),
                        seeded demo data, guarded NL→SQL
    chatHistory.ts       multi-turn context window
  /auth/                NextAuth config, password hashing
  /ingest/              Document parsing, chunking, sanitization
  /intent/              intent classifier + clarification check
  crypto.ts             AES-256-GCM for per-user API keys
  export.ts             .txt/.md/.docx content export
  rateLimit.ts, env.ts, types.ts
/components
  /chat, /documents, /content-generator, /dashboard, /settings, /providers,
  /onboarding, /layout, /ui (Button, Card, Badge, Spinner, Skeleton, Toaster, ThemeToggle)
middleware.ts           Route protection (redirect for pages, 401 JSON for APIs)
.env.example
Dockerfile, docker-compose.yml, docker-compose.dev.yml, .dockerignore
```

## Security notes

- Provider API keys are read server-side only (`process.env`) and never sent to the client —
  the UI only receives a provider **id** for the badge/settings display.
- Uploads are size- and type-gated (`lib/ingest/sanitize.ts`) before parsing. A real antivirus
  scan (e.g. ClamAV) is left as a documented hook, not faked, since no AV binary is available
  in this environment — wire it in before handling untrusted uploads in production.
- NL→SQL is guarded: only `SELECT` statements against an allow-listed table/column set are
  permitted, multi-statement queries are rejected, and execution runs inside a Postgres
  `READ ONLY` transaction — so even a bypassed validator cannot write.
- All protected pages and API routes require a valid session (`middleware.ts`); unauthenticated
  API calls get a 401, unauthenticated page loads redirect to `/login`.
- Per-user/IP rate limiting applies to ingest, chat, agent actions, content generation and the
  auth flows. Counters live in Postgres and are incremented atomically, so the limit holds across
  multiple instances and serverless invocations.
- Password-reset and email-verification tokens are stored only as SHA-256 hashes, expire, and are
  single-use — redemption is serialised with `SELECT … FOR UPDATE` so a token cannot be redeemed
  twice.

## Known limitations / extension points

- **FAISS and Azure AI Search** vector stores are stubs (`lib/db/vector/faiss.ts`,
  `azureSearch.ts`) implementing the same `VectorStore` interface as pgvector and Chroma — each
  has inline instructions for wiring up the real client. Set `VECTOR_DB_PROVIDER` to select one
  once implemented.
- **`EMBEDDING_DIMENSIONS` is fixed once the vector table exists.** `VECTOR(n)` is set at table
  creation, so changing the embeddings model means `DROP TABLE document_chunks;` and re-ingesting
  — which is required anyway, since vectors from different models are not comparable.
- Streaming fallback across providers only works for failures that occur **before** the first
  token is produced — once a stream has started emitting partial output, it can't silently hop
  providers without corrupting the response.
- The AV-scan hook in `sanitize.ts` is unimplemented by design (documented, not faked).
