# IgniteAI Studio — Constitution

Non-negotiable guardrails. Every task, PR, and generated file must comply. Violations are logged in [lessons-learned.md](./lessons-learned.md).

## Engineering
1. **TypeScript strict mode** — no `any` without a written justification comment; no `@ts-ignore` without an issue reference.
2. **No hardcoded secrets** — all secrets come from env (`.env.local` / Docker `.env`). User-supplied API keys are AES-256 encrypted at rest, never logged, never returned to the client in plaintext.
3. **Server-only secrets** — provider keys and the encryption key are read server-side only. The client only ever receives a provider *id*, a masked key preview, and a health status.
4. **Spec-first** — no feature exists without a corresponding entry in `/specs/*.md` and a task in `/specs/tasks/`. If a file doesn't map to a task, it is not created.
5. **File hygiene** — one `.env.example`, one `tailwind.config.ts`, one `tsconfig.json`. No placeholder pages, dummy tests, or scaffolding comments in production code.

## Design system
6. **Bootstrap Icons only** — `bi bi-*` classes via the `bootstrap-icons` package. No mixed icon libraries (no lucide, heroicons, react-icons, inline SVG icon sets).
7. **Red/black theme tokens only** — all color comes from the defined tokens (Ignite Red `#ed1515` + charcoal/surface shades + neutral text). Success/warning/error are red-black-derived tints; the only permitted non-red/black hues are minimal status dots (a muted green/red dot for provider health).
8. **Dark-mode-first** — black base, red highlights. A light theme is offered via toggle but dark is the default and the design is tuned for it.
9. **Accessibility (WCAG AA)** — every icon-only control has an `aria-label`; interactive elements are keyboard reachable; red-on-black text/controls meet AA contrast.

## Data & providers
10. **Provider-agnostic** — business logic imports only the adapter interfaces (`lib/ai/providerAdapter.ts`, `lib/ai/embeddingsAdapter.ts`), never a concrete SDK.
11. **Graceful degradation** — a missing key, dead provider, or unreachable vector store produces a clear, actionable error (never a stack trace to the user) and, where possible, auto-failover to the next configured provider.
