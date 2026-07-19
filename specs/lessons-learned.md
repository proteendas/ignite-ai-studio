# Lessons Learned

Running log of bugs, deviations from spec, and decisions made during implementation.

## L1 — Case-sensitive email login (auth)
**Symptom:** Users reported "wrong password" when signing in with the same password used at signup.
**Root cause:** Email lookup was case-sensitive; mobile keyboards/autofill change email casing between signup and login, so the lookup found no user and returned a generic credentials failure that surfaces as "incorrect password".
**Fix:** `normalizeEmail()` (trim + lowercase) applied inside `getUserByEmail` and `createUser` in `lib/db/sql/client.ts`, plus `.trim()` in the register zod schema. Verified via server logs (`password valid: true`) and a mixed-case round-trip.
**Deviation:** none from spec; hardening.

## L2 — Chroma client/server API version mismatch (rag-chat)
**Symptom:** Ingestion failed with `Failed to fetch http://chroma:8000/api/v1/tenants/default_tenant status 410: Gone`.
**Root cause:** `chromadb@1.9.2` npm client uses the `/api/v1` REST API; `chromadb/chroma:latest` (0.6.0+) removed v1.
**Fix:** Pinned the server image to `chromadb/chroma:0.5.23` (last line with v1). Documented in `docker-compose.yml` with a warning not to bump without upgrading the client. Verified `/api/v1/heartbeat` and `/api/v1/tenants/default_tenant` return 200.
**Deviation:** none; the `:latest` tag was itself a violation of good practice (unpinned) — now pinned.

## L3 — Register error surfaced raw zod JSON
**Fix:** Register route now returns the first zod issue as a human-readable `"<field>: <message>"` string.

## L4 — `.md` uploads rejected by the sanitizer (content hygiene)
**Symptom:** The document dropzone accepts `.md` (per C2), but browsers report markdown files with inconsistent MIME types (`text/markdown`, `text/plain`, or empty), and the original MIME-keyed allow-list in `sanitize.ts` rejected them.
**Fix:** Made `sanitize.ts` extension-driven (`.pdf/.docx/.txt/.md`), with the reported MIME as a tolerant secondary check (accepts empty/`application/octet-stream` for text). `parse.ts` now treats any text-MIME/`.txt`/`.md` as UTF-8 text. `/api/ingest` passes the filename through for the fallback signal. Verified end-to-end: a `.md` upload passes sanitize+parse+chunk and only stops at the embedding step when no embeddings key is set.
**Deviation:** none; aligns implementation with C2.

## Validation summary (V1/V2)
- **V1** `tsc --noEmit` clean; `next build` compiles all 27 routes (12 pages + 15 API handlers) with `output: 'standalone'`.
- **V2** `docker compose up --build` verified end-to-end on a fresh volume: rebrand renders ("IgniteAI Studio" / "Spark intelligence" / `bi-fire`); Chroma 0.5.23 serves the v1 API (200); register (case-normalized email) + credentials login + session; thread create/list; **per-user API key stored as ciphertext (no plaintext leak), returned only masked, and picked up by provider-health as `source: 'user'`**; `.md` ingest passes parse/chunk; onboarding false→complete→true; all 6 authenticated pages return 200; 13 tables + seeded demo data; and users/threads/keys/onboarding **persist across an app-container restart**.
- **Not runtime-verified (no API key in the sandbox):** live LLM chat/embeddings/content generation. All such paths fail closed with clear, actionable messages (verified). Provide `GOOGLE_GEMINI_API_KEY` (embeddings) + any chat key to exercise them.
