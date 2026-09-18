# Security

The engineering view. The user-facing statement lives at `/legal/security`; keep the two
consistent.

## Authentication

- **Passwords** — bcrypt, 10 salt rounds ([`lib/auth/password.ts`](../lib/auth/password.ts)).
  Never stored or logged in plaintext.
- **Sessions** — NextAuth JWT strategy, signed with `NEXTAUTH_SECRET`, carried in an HTTP-only
  cookie that JavaScript cannot read.
- **CSRF** — NextAuth's own token protects sign-in and sign-out.
- **OAuth** — Google and GitHub registered **only** when both of their env vars are present.
  Constructing a provider with empty credentials makes NextAuth throw at sign-in, so partial
  configuration is ignored entirely rather than half-enabled.
- **OAuth account linking** — an OAuth sign-in looks up or creates a local `users` row keyed by
  email, so every user has a stable local id usable as `ownerId`.

> `NEXTAUTH_SECRET` defaults to `dev-insecure-secret-change-me` so development does not crash.
> **Any real deployment must override it.**

## Secrets at rest

Provider API keys and service connection tokens are encrypted with **AES-256-GCM**
([`lib/crypto.ts`](../lib/crypto.ts)) before reaching the database. Stored: ciphertext, IV, auth
tag, and a short display preview. Never stored: the secret itself.

- Requires `ENCRYPTION_KEY` (min 16 chars). Without it the key manager **refuses to store**
  rather than falling back to plaintext.
- GCM gives authenticated encryption — tampering is detected on decrypt, not silently accepted.
- **Rotating `ENCRYPTION_KEY` invalidates every stored secret.** Intended behaviour; users
  re-enter their keys.

## Email-flow tokens

`auth_tokens` stores **only the SHA-256 hash** of each password-reset and verification token. A
database leak cannot be replayed against the endpoints.

- Password reset expires in **1 hour**; verification in **24 hours**.
- Issuing a new token deletes any outstanding token of the same kind for that user, so an old
  link stops working the moment a new one is requested.
- Redemption is a **single transaction** that checks expiry and `consumed_at` and marks the
  token used, so concurrent requests cannot redeem the same token twice.

### Account enumeration

`POST /api/auth/forgot-password` returns an identical 200 body for registered and unregistered
addresses, and the UI wording matches. OAuth-only accounts (no password to reset) are treated
like unknown addresses. **When changing this endpoint, preserve that property** — divergent
responses, or divergent timing, turn it into an enumeration oracle.

`POST /api/auth/resend-verification` is session-scoped and sends only to the signed-in user's
own address, so it cannot be aimed at an arbitrary inbox.

## Authorisation and isolation

- [`middleware.ts`](../middleware.ts) gates everything from an **explicit public-prefix
  allowlist**. Anything not listed requires a session — so a newly added route fails closed.
- Every handler re-checks the session itself. Middleware is defence in depth, not the only gate.
- Every query is filtered by `owner_id` from the session. Vector retrieval is scoped to the
  requester's own documents, so one account's content cannot surface in another's answers.
- A resource owned by someone else returns **404, not 403**, so ids cannot be probed for
  existence.

## Input handling

- **Request bodies** are validated with zod before use; the first issue is surfaced as a clean
  message rather than dumping the raw error object.
- **Uploads** are checked for type, size and filename by
  [`lib/ingest/sanitize.ts`](../lib/ingest/sanitize.ts), and document text is sanitised during
  ingestion to reduce prompt-injection risk.
- **NL→SQL output** is constrained by a validator (single `SELECT`, allow-listed tables and
  columns, no multi-statement) **and** executed inside a Postgres `READ ONLY` transaction
  ([`runReadOnlyQuery`](../lib/db/sql/client.ts)). Even a bypassed validator cannot write —
  a guarantee the previous SQLite implementation could not make.
- **All database access** uses parameterised queries (`$1, $2, …`); no SQL is built by string
  concatenation with user input.

### Prompt injection

Sanitisation reduces the risk that instructions embedded in an uploaded document steer the
model. It is not a complete defence, and should not be treated as one. **The real backstop is
the approval gate:** injected text cannot cause a side effect without a human clicking Approve.
That is why `sideEffect: 'write'` can never be auto-approved.

## Agent safety

- Every write or side-effecting tool call requires explicit human approval. No setting bypasses
  it.
- Auto-approve is opt-in, per tool, per user, and available **only** for `sideEffect: 'read'`
  tools.
- Every proposal, decision and result is recorded in `agent_actions` as an audit trail.
- The ReAct loop is capped at 6 steps, bounding runaway cost and looping.
- Tools run server-side only; credentials never reach the browser.

## Rate limiting

[`lib/rateLimit.ts`](../lib/rateLimit.ts) is backed by the `rate_limits` table. Limits are listed
in [configuration](./configuration.md#rate-limits).

Each check is a **single atomic upsert** that either starts a fresh window or increments the
current one, so concurrent requests — which on a serverless platform land in *different
processes* — cannot both read a stale count and both be allowed. The limit therefore holds
however many instances are running.

> **It fails open.** If the database is unreachable, requests are allowed rather than the whole
> app returning 429 — a database outage should not present as a rate-limit wall. The trade-off is
> that a database outage also suspends rate limiting.

This replaced an in-memory counter, which was ineffective on serverless (a fresh process per
invocation meant the counter never accumulated) and wrong on multi-replica deployments (each
replica enforced its own copy, multiplying the effective ceiling).

## Account deletion

`POST /api/account/delete` runs `deleteUserData()` — one transaction removing thread-keyed rows,
then every `owner_id`-keyed table, then the user. Add new owner-scoped tables to that list, or
deletion silently orphans rows.

Content already transmitted to a third-party AI provider is outside our control and subject to
that provider's retention policy. The privacy policy says so explicitly.

## Deployment hardening

- Serve over HTTPS only. The VM guide uses Caddy, which obtains and renews certificates
  automatically.
- Keep the app and Postgres off public ports — `docker-compose.prod.yml` exposes only Caddy.
  **Port 5432 is your entire dataset behind one password; never open it.**
- Use a strong, unique `POSTGRES_PASSWORD`. Note the Postgres volume keeps the password it was
  initialised with — changing the env var afterwards locks the app out.
- On serverless, use a **pooled** connection string, and require TLS (`sslmode=require`).
- Set `NEXTAUTH_URL` to the real public URL, or emailed reset links point at localhost.
- One `pg_dump` now covers the whole dataset, embeddings included. Back up `ENCRYPTION_KEY`
  **separately** — a restore without it leaves every stored provider key unreadable.
- If you use Chroma instead of pgvector: it has **no authentication**, so never expose it.
- Keep `.env*` out of version control — all variants are gitignored.

## Known limitations

Worth stating plainly:

- **No 2FA / MFA.**
- **No session revocation list.** JWT sessions remain valid until expiry; changing a password
  does not invalidate existing sessions.
- **No audit log for account actions** beyond agent actions and request/error logs.
- **Rate limiting fails open** on database unavailability.
- **Telemetry tables grow without bound** — no retention job ships with the app.
- **No row-level security.** Isolation is enforced in application code (every query filters by
  `owner_id`), not by Postgres RLS. A missing filter in new code is a data-leak bug; RLS would
  make it fail closed instead.
- **Email verification is not enforced.** It is a prompt, not a gate.

## Reporting

`/legal/responsible-disclosure` documents the process, scope, and safe-harbour commitment.
