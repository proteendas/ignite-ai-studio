# Spec — RAG Chat & Intent Routing

## User stories
- As a user, I upload documents and ask questions answered strictly from those documents, with citations.
- As a user, I always know whether retrieval is active: a visible **Grounded / General / Agent** mode toggle, with a badge on every answer.
- As a user, I cannot chat "with" a document until its ingestion status is **ready** — no silently ungrounded answers.
- As a user, I see a citations panel per answer showing exactly which document chunks (with similarity scores) were used.
- As a user, I attach a document mid-conversation from the chat input bar and watch its ingestion progress inline.
- As a user, I ask questions about structured data (products/orders) and get a natural-language answer routed through SQL.
- As a user, I have multiple named conversation threads I can rename, pin, and delete, each retaining its own context; new threads auto-title from my first message.
- As a user, vague questions get a clarifying follow-up instead of a hallucinated answer.
- As a user, I can pick a tone (professional/casual/technical/persuasive/formal/playful).

## Acceptance criteria
- [ ] Ingestion: parse (PDF/DOCX/TXT/MD) → chunk (~500–800 tokens, 10–15% overlap) → embed (via `embeddingsAdapter`, cache-first) → upsert to vector store with `{ownerId, documentId, filename, chunkIndex}` metadata; document status transitions processing → ready/failed with chunk count.
- [ ] **Grounding is enforced**: in Grounded mode, retrieval (top-k=5 cosine similarity) runs before *every* response; the system prompt forbids outside knowledge and requires an explicit "not in the documents" refusal when retrieval comes up empty.
- [ ] Chat on a specific document is **blocked (409)** until that document's status is `ready`; grounded chat with zero ready documents returns an actionable prompt to upload or switch modes.
- [ ] General mode skips retrieval entirely and is visibly labeled "General" on every answer.
- [ ] Chat routes each query: `document` (vector RAG), `structured-data` (guarded NL→SQL), `compound` (decompose → per-sub route → synthesize), `general`.
- [ ] Answers stream token-by-token (SSE) with a `meta` event carrying `{provider, route, citations}` (citations include similarity scores) and a `done` event carrying token counts for the live session counter.
- [ ] Citations render as `filename#chunkIndex` chips plus an expandable Sources panel (filename, chunk, score, snippet).
- [ ] Retrieval scores are logged per query in dev (`NODE_ENV!=='production'` or `DEBUG_RETRIEVAL=1`) to debug low-relevance matches.
- [ ] Threads persist per user (role, content, timestamps, token counts, document refs); last 8 messages verbatim + rolling summary of older history form the context window; pinned threads sort first; auto-title from the first user message.
- [ ] In-chat upload: paperclip in the input bar → `/api/ingest` → inline status card (uploading → ingesting → ready/failed) → auto-selected as the grounding document.
- [ ] Ambiguous queries return `needsClarification` + a single follow-up question.
- [ ] Provider auto-failover: on chat/embedding failure, try the next configured provider; surface a non-blocking "switched provider" notice.

## Edge cases
- No embedding provider configured → ingestion fails with an actionable message; document marked `failed` with the reason.
- Vector store unreachable → clear error, no crash.
- NL→SQL: only `SELECT` on allow-listed tables (`products`, `orders`); reject multi-statement/DML; enforce `LIMIT`.
- Empty retrieval → model must answer "I don't have that information in the provided documents."

## Status / lessons
- Prior bug: chromadb@1.9.2 (v1 API) vs `chromadb/chroma:latest` (v1 removed) → `410 Gone`. Fixed by pinning server to `chromadb/chroma:0.5.23`. See [lessons-learned.md](./lessons-learned.md) L2.
