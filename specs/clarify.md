# Clarify — Resolved Ambiguities

Decisions made before implementation. Each is now binding; changing one requires updating this file and the affected specs.

| # | Ambiguity | Decision | Rationale |
|---|-----------|----------|-----------|
| C1 | Max upload file size for ingestion | **20 MB** per file | Large enough for real docs, small enough to bound memory/parse time on a single-instance deploy. Enforced in `lib/ingest/sanitize.ts`. |
| C2 | Allowed upload types | **PDF, DOCX, TXT, MD** + pasted text | Matches "upload any document" while keeping the parser surface small and safe. |
| C3 | Session timeout | **JWT, 30-day maxAge, 24-hour rolling update** | NextAuth JWT default; long enough for a studio tool, refreshed on activity. |
| C4 | Per-provider API key management | **Encrypted per-user in DB (AES-256-GCM)** | User decision. Keys pasted in Settings, encrypted with a server `ENCRYPTION_KEY`, decrypted server-side only at call time. Enables multi-user/BYO-key without editing env. |
| C5 | Observability scope | **Per-user only, no global admin view** | User decision. Each user sees their own request logs, error logs, and usage/cost. No admin role or `/admin` route. |
| C6 | Default embeddings provider | **Google Gemini (`gemini-embedding-001`, falls back to `text-embedding-004`)**; HuggingFace sentence-transformers as fallback | Generous free tier, strong multilingual quality, large context. Both behind `lib/ai/embeddingsAdapter.ts`, switched via `EMBEDDINGS_PROVIDER`. |
| C7 | Default chat provider | **Groq** (unchanged from prior spec) | Free, fast; auto-failover to next configured provider. |
| C8 | Usage/cost tracking for free tiers | **Track token counts + request counts per provider**; cost shown as estimate (or "free tier") using a static per-provider rate table | Free tiers have no billing API; token/request counting still gives quota-consumption visibility. |
| C9 | Chat thread history retention | **Unbounded per user**, last 5 exchanges used as live context window | Threads persist until the user deletes them; context window stays bounded for prompt size. |
| C10 | Onboarding tour trigger | **First login only** (a `onboarded_at` timestamp on the user); re-triggerable from Settings | Non-intrusive; discoverable later. |
| C11 | Default chat mode | **Grounded** (retrieval always on); General and Agent are explicit opt-ins with visible badges | The core promise is document-grounded answers; ungrounded output must never be silent. |
| C12 | Chunking parameters | **~2800 chars (~700 tokens) per chunk, ~350 chars (12%) overlap, top-k=5** | Inside the 500–800-token / 10–15%-overlap window that retrieval quality guidance calls for. |
| C13 | Agent step limit | **6 ReAct steps** per turn | Bounds token spend and runaway loops. |
| C14 | Auto-approve scope | **Read-only tools only, per-tool, off by default**; `email_send` and all write tools always require explicit approval | HITL safety default; user opt-in for trusted low-risk reads only. |
| C15 | Email agent backend | **Gmail API via user OAuth (gmail.send, offline refresh token)**; Microsoft Graph deferred | One well-tested path first; connection stored AES-256-GCM encrypted like API keys. |
| C16 | Local AI | **Ollama** as a first-class provider; Connection Type = cloud / local / auto (per-user pref over env) | Removes hard dependency on external API keys; auto mode prefers local and falls back to cloud. |
| C17 | History window | **Last 8 messages verbatim + rolling summary** of older history (`thread_summaries`) | Replaces resending full history; summary regenerates only when messages age out of the window. |

> C6 amendment (2026-07-19): the Gemini embeddings **primary** is now `text-embedding-004` (universally available) with `gemini-embedding-001` as fallback — the original order 404s on many free keys.
