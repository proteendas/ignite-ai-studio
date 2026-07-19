# Plan — Architecture

## Stack (retained + added)
- Next.js 14 App Router, TS strict, Tailwind. Retained: NextAuth (JWT), better-sqlite3, Chroma vector store, multi-provider LLM adapter.
- **Added deps**: `bootstrap-icons` (icons), `framer-motion` (minimal transitions), `docx` (content export). No other icon/UI libraries (constitution #6).

## Theme tokens (Tailwind + CSS variables)
```
--ignite-red:#ed1515  --ignite-red-dark:#b30f0f  --ignite-red-light:#ff4d4d
--base:#000000  --surface-1:#0a0a0a  --surface-2:#1a1a1a  --surface-3:#262626
--text:#f5f5f5  --text-muted:#737373
success/warning/error = red-black-derived tints; status dots the only extra hues.
```
Tailwind exposes these as `ignite.*`, `surface.*`, `text.*`. `darkMode: 'class'`; `<html class="dark">` default, toggle flips it and persists to localStorage.

## Data model (SQLite additions)
- `users`: + `onboarded_at TEXT NULL`.
- `user_preferences`: ownerId PK, default_provider, default_model, default_tone, theme.
- `user_api_keys`: id, ownerId, provider, ciphertext, iv, auth_tag, key_preview, created_at (UNIQUE ownerId+provider). AES-256-GCM via `lib/crypto.ts` keyed off `ENCRYPTION_KEY`.
- `chat_threads` (rename/extend prior chat_sessions): id, ownerId, title, pinned INTEGER, created_at, updated_at.
- `chat_messages`: unchanged (FK → chat_threads).
- `generated_content`: id, ownerId, documentId, content_type, tone, channel, output, created_at.
- `usage_events`: id, ownerId, provider, kind ('chat'|'embed'|'generate'), prompt_tokens, completion_tokens, created_at.
- `request_logs`: id, ownerId, route, status, latency_ms, provider, created_at.
- `error_logs`: id, ownerId, route, message, created_at.
- `activity_events`: id, ownerId, type, summary, created_at (feeds dashboard activity feed).

## API contracts (new/changed)
- `POST /api/ingest` (retained) — now also writes a `usage_events` embed row + `activity_events`.
- `POST /api/chat` (retained, extended) — takes `threadId`; writes messages, usage, request_logs.
- `GET/POST/PATCH/DELETE /api/threads[/:id]` — list/create/rename-pin/delete threads.
- `POST /api/generate-content` (extended) — accepts `channels: []` for batch; `variation: boolean`.
- `GET/POST/DELETE /api/content-library[/:id]` — saved generated content.
- `GET/POST/DELETE /api/keys[/:provider]` — encrypted per-user provider keys (never returns plaintext).
- `GET/PUT /api/preferences` — user defaults.
- `GET /api/provider-health` — per-provider `{configured, ok, source: 'user'|'env'}` with live probe.
- `GET /api/usage` — per-user usage/cost summary + recent request/error logs.
- `POST /api/account/delete` — cascade delete all user data (SQL + vector).
- `POST /api/onboarding/complete` — set `onboarded_at`.

## Provider key resolution (updated)
`resolveProvider()` / `embeddingsAdapter` now check, in order: (1) the requesting user's decrypted `user_api_keys` for the provider, (2) `process.env`. This makes BYO-key per-user work while keeping env fallback. Key material is fetched server-side at call time only.

## Component tree (high level)
- `AppShell` = Sidebar (bi icons, active state) + Topbar (theme toggle, provider health pill, user menu) + Toaster.
- Pages: `/dashboard` (StatTiles, ActivityFeed, QuickActions), `/chat` (ThreadSidebar + ChatWindow + TypingIndicator), `/documents` (Library w/ search), `/content-generator` (Picker → Selector → BatchOutputs), `/settings` (Keys, Defaults, Providers health, Danger zone), `/observability` (usage + logs).
- Cross-cutting: `Toaster`/`useToast`, `ThemeToggle`, `Skeleton`, `OnboardingTour`, `hoverGlow` utility class.
