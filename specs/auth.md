# Spec — Authentication & Account

## User stories
- As a visitor, I can create an account with email + password so I can access the studio.
- As a returning user, I can sign in with the same credentials regardless of email casing/whitespace.
- As a user, I can sign in with Google or GitHub when those providers are configured.
- As a user, I can manage my own per-provider API keys, defaults, and delete my account/data.

## Acceptance criteria
- [ ] Registration validates email format + password ≥ 8 chars; errors are human-readable (no raw zod JSON).
- [ ] Email is normalized (trim + lowercase) at both write and read, so signup and login always agree on the key.
- [ ] Passwords stored as bcrypt hashes (10 rounds); never returned to the client.
- [ ] Sessions are JWT (C3). Protected routes (`/dashboard`, `/chat`, `/documents`, `/content-generator`, `/settings`, `/api/*` except `/api/auth/*`) redirect (pages) or 401 (APIs) when unauthenticated.
- [ ] OAuth providers appear only when their env vars are set; unconfigured providers are neither registered nor rendered.
- [ ] Deleting an account removes the user row, their documents (SQL + vector), chat threads, generated content, logs, and encrypted keys.

## Edge cases
- Duplicate email → 409 with a clear message.
- OAuth sign-in auto-provisions a local user row keyed by normalized email so `session.user.id` is always a stable local id.
- Placeholder `NEXTAUTH_SECRET` → app runs but Settings surfaces a "set a real secret" warning.

## Status / lessons
- Prior bug: case-sensitive email lookup caused false "wrong password". Fixed via `normalizeEmail` in the DB layer. See [lessons-learned.md](./lessons-learned.md) L1.
