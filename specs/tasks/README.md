# Tasks Index

Each task is independently testable and maps to a spec + the architecture plan. Status: ☐ todo · ◑ in progress · ☑ done. Deviations logged in [../lessons-learned.md](../lessons-learned.md).

## Foundation (shared contracts — build first)
- ☑ **F1** Fix login (email normalization) + remove debug code. `auth.md`
- ☑ **F2** Fix Chroma v1/v2 mismatch (pin `chromadb/chroma:0.5.23`). `rag-chat.md`
- ☑ **F3** Add deps: `bootstrap-icons`, `framer-motion`, `docx`. `plan`
- ☑ **F4** Tailwind red/black tokens + `globals.css` (CSS vars, bootstrap-icons import, dark default). Constitution #6–8
- ☑ **F5** DB schema + client helpers for all new tables. `plan`
- ☑ **F6** `lib/crypto.ts` (AES-256-GCM) for user API keys. C4
- ☑ **F7** `lib/ai/embeddingsAdapter.ts` (Gemini default + HuggingFace fallback), env `EMBEDDINGS_PROVIDER`. C6
- ☑ **F8** Per-user key resolution in `providerAdapter` (`resolveProvider(userId)`) + `keyResolver.ts` + `embeddingsAdapter`. `plan`
- ☑ **F9** Rebrand → "IgniteAI Studio" + tagline; UI primitives: `Toaster`, `ThemeToggle`, `Skeleton`, `TypingIndicator`, shell, login. Branding

## Features (implemented via parallel agents; integrated, typecheck+build clean, Docker-verified)
- ☑ **T1** Dashboard: stat tiles (tokens, docs, content), activity feed, quick-action cards. New feature list
- ☑ **T2** Chat threads: persisted, rename/delete/pin; thread sidebar; wired into `/api/chat` (threadId). `rag-chat.md`
- ☑ **T3** Content Generator: batch channels, regenerate/variation, export .txt/.md/.docx, save-to-library. `content-generator.md`
- ☑ **T4** Settings: encrypted API key management, default provider/model/tone, delete account/data. `auth.md`, C4
- ☑ **T5** Provider health panel: live status dots + auto-failover notice. New feature list
- ☑ **T6** Observability (per-user): request logs, error logs, usage/cost tracker. C5, C8
- ☑ **T7** Document library: search/delete, chunk count + embedding status per doc. New feature list
- ☑ **T8** Onboarding tour (first login, re-triggerable) + accessibility (ARIA, keyboard) baked into each page. New feature list

## Validation
- ☑ **V1** `tsc --noEmit` clean; `next build` compiles all 27 routes.
- ☑ **V2** Docker-verified end-to-end (rebrand, login, threads, encrypted-key round-trip, `.md` ingest, onboarding lifecycle, all pages 200, volume persistence). Live LLM calls not runtime-verified (no key in sandbox); all such paths fail closed with actionable messages. See [../lessons-learned.md](../lessons-learned.md).

## Upgrade 2 — Grounding fix, agentic AI, HITL, local AI (2026-07-19)
- ☑ **U1** Foundations: schema (`agent_actions`, `user_connections`, `embedding_cache`, `thread_summaries`, message `token_count`/`document_refs`, preference `connection_type`/`auto_approve_json`) + idempotent column migrations + client helpers. `agentic.md`, `local-ai.md`
- ☑ **U2** Grounding fix: retrieval before every grounded response, ready-status gate (409), strict context-only prompt, dev retrieval-score logging, Grounded/General/Agent mode toggle, citations panel with scores. `rag-chat.md`, C11–C12
- ☑ **U3** Chat history: token counts + document refs per message, auto-title from first message, last-8 + rolling-summary context window, live session token counter, in-chat upload with inline ingestion card. `rag-chat.md`, C17
- ☑ **U4** Agentic layer: tool registry (`lib/ai/tools/`), GitHub + Gmail tools, ReAct loop (max 6 steps), SSE pause/resume. `agentic.md`, C13, C15
- ☑ **U5** HITL: approval gate on every action, editable email drafts, per-thread Agent Activity Log, per-tool auto-approve (read-only, off by default). `agentic.md`, C14
- ☑ **U6** Local AI: Ollama provider (chat/stream/embed), Connection Type cloud/local/auto, health-panel detection, Docker `host-gateway` wiring. `local-ai.md`, C16
- ☑ **U7** Token efficiency: embedding cache, chunk caps, tool-output truncation, `lightModelFor` routing for internal calls. `local-ai.md`
- ☑ **U8** UX fixes: password visibility toggles (login/signup/change-password), change-password flow, browser tab icon (`app/icon.svg`), rename sweep (no "generic AI" references). Branding
- ☑ **U9** Validation: typecheck + build + Docker end-to-end re-verified.
