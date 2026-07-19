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
