# Deployment

Two documented paths, and an honest account of which suits what.

| | [Single VM](./ec2-docker.md) | [Free tier](./serverless-free-tier.md) |
| --- | --- | --- |
| **Code changes** | None | None (Option A/B) · **Postgres port** (Option C) |
| **Cost** | ~$6–15/month, or free on Oracle Always Free | Free |
| **Persistence** | Full | Full (A) · **wiped on spin-down** (B) · full (C) |
| **Setup effort** | ~30 minutes | ~30 minutes (A) · a project (C) |
| **Scales out** | No — single instance by design | Yes, after the port |
| **Best for** | Anything real | Evaluation, hobby, or a clean rewrite |

## The constraint that drives everything

The app stores state in two places that assume a persistent filesystem:

- **`better-sqlite3`** — a synchronous, file-backed database
- **Chroma** — a long-running service with a volume

and the rate limiter holds counters in process memory.

Together these make IgniteAI Studio a **single-instance application**. That is a deliberate
trade — synchronous SQLite removes a whole class of async bugs and needs no separate database
server — but it means:

- **Serverless hosting does not work unstyled.** No persistent filesystem, so SQLite data is lost
  between invocations.
- **Horizontal scaling does not work.** Two replicas would each hold their own SQLite file and
  their own rate-limit counters.

Everything in both guides follows from this.

## Recommendations

**For production: [a single VM](./ec2-docker.md).** Docker Compose, Caddy for automatic TLS, two
named volumes for data. Matches how the repo is built, and needs no code changes.

**For free: [Oracle Cloud Always Free](./serverless-free-tier.md#option-a--best-free-tier-that-works-today-unchanged)**
— 4 Arm cores and 24 GB RAM, no expiry — following the VM guide. This is the best zero-cost
answer and the one to pick if you just want it running.

**For a serverless architecture: [Vercel + Neon](./serverless-free-tier.md#option-c--vercel--neon--render-after-porting-to-postgres)**,
after porting the data layer to Postgres and pgvector. Architecturally cleaner and genuinely
scalable, but the port is a project in its own right.

## Pre-flight checklist

Whatever the target:

- [ ] `NEXTAUTH_SECRET` set to a strong random value — **never** the shipped default
- [ ] `ENCRYPTION_KEY` set, at least 16 characters, and **backed up separately from the
      database** (rotating it invalidates every stored provider key)
- [ ] `NEXTAUTH_URL` is the real public URL, or OAuth callbacks and password-reset links break
- [ ] At least one AI provider key, or a reachable Ollama
- [ ] `EMBEDDINGS_PROVIDER` configured with its key — separate from the chat provider
- [ ] `RESEND_API_KEY` and `EMAIL_FROM` set, or password-reset links only reach the server log
- [ ] HTTPS, not plain HTTP
- [ ] Chroma **not** publicly reachable — it has no authentication
- [ ] Backups cover the SQLite file **and** the vector store together
- [ ] `.env*` files out of version control

## Operational notes

- **Schema migrations are automatic.** `schema.sql` is idempotent and `migrateExistingTables()`
  adds new columns behind a `PRAGMA` guard, both on startup. There is no manual migration step.
- **Maintenance mode** is `MAINTENANCE_MODE=true` — every page serves `/maintenance`, every API
  route returns 503.
- **Telemetry grows without bound.** `usage_events`, `request_logs`, `error_logs` and
  `activity_events` have no retention job. Prune them on a long-lived deployment.
- **Chroma is pinned to 0.5.23.** The `chromadb@1.9.2` client speaks `/api/v1`, which Chroma
  removed in 0.6.0+. Do not bump the image without upgrading the client and
  `lib/db/vector/chroma.ts`.
