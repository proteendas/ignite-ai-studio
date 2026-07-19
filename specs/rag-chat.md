# Spec — RAG Chat & Intent Routing

## User stories
- As a user, I upload documents and ask questions answered strictly from those documents, with citations.
- As a user, I ask questions about structured data (products/orders) and get a natural-language answer routed through SQL.
- As a user, I have multiple named conversation threads I can rename, pin, and delete, each retaining its own context.
- As a user, vague questions get a clarifying follow-up instead of a hallucinated answer.
- As a user, I can pick a tone (professional/casual/technical/persuasive/formal/playful).

## Acceptance criteria
- [ ] Ingestion: parse (PDF/DOCX/TXT/MD) → chunk → embed (via `embeddingsAdapter`) → upsert to vector store with `{ownerId, documentId, filename, chunkIndex}` metadata; document status transitions processing → ready/failed with chunk count.
- [ ] Chat routes each query: `document` (vector RAG), `structured-data` (guarded NL→SQL), `compound` (decompose → per-sub route → synthesize), `general`.
- [ ] Answers stream token-by-token (SSE) with a `meta` event carrying `{provider, route, citations}`.
- [ ] Citations render as `filename#chunkIndex` chips linking to the source snippet.
- [ ] Threads persist per user; last 5 exchanges form the live context window; pinned threads sort first.
- [ ] Ambiguous queries return `needsClarification` + a single follow-up question.
- [ ] Provider auto-failover: on chat/embedding failure, try the next configured provider; surface a non-blocking "switched provider" notice.

## Edge cases
- No embedding provider configured → ingestion fails with an actionable message; document marked `failed` with the reason.
- Vector store unreachable → clear error, no crash.
- NL→SQL: only `SELECT` on allow-listed tables (`products`, `orders`); reject multi-statement/DML; enforce `LIMIT`.
- Empty retrieval → model must answer "I don't have that information in the provided documents."

## Status / lessons
- Prior bug: chromadb@1.9.2 (v1 API) vs `chromadb/chroma:latest` (v1 removed) → `410 Gone`. Fixed by pinning server to `chromadb/chroma:0.5.23`. See [lessons-learned.md](./lessons-learned.md) L2.
