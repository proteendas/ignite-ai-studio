# Deployment

Two documented paths, and an honest account of which suits what.

Both paths work today, with no code changes. Pick by how you want to pay and operate it.

| | [Single VM](./ec2-docker.md) | [Vercel + Neon](./serverless-free-tier.md) |
| --- | --- | --- |
| **Cost** | ~$6–15/month, or free on Oracle Always Free | **Free** |
| **Setup time** | ~30 minutes | ~15 minutes |
| **You manage** | The OS, Docker, backups, TLS renewal | Nothing |
| **Scales out** | No — one machine | Yes, automatically |
| **Cold starts** | None | Yes (Neon and Vercel both scale to zero) |
| **Storage** | Whatever the disk holds | 0.5 GB free tier |
| **Commercial use** | Fine | **Vercel Hobby is non-commercial** |
| **Best for** | Steady traffic, full control, larger corpora | Getting started, hobby projects, zero ops |

## One database either way

Both deployments run the same architecture: **Postgres holds everything**, application tables and
vector embeddings alike, with pgvector providing similarity search.

That means one connection string, one backup, and one thing to keep alive. It is also what makes
the serverless path possible at all — there is no file on disk and no long-running vector service
to host.

Chroma is still supported (`VECTOR_DB_PROVIDER=chroma`) for self-hosted deployments that already
run it, but it is no longer the default and is not needed.

## Recommendations

**Just want it running, for free?** → [Vercel + Neon](./serverless-free-tier.md). Nothing to
administer, HTTPS included, roughly fifteen minutes.

**Production with steady traffic?** → [a single VM](./ec2-docker.md). Predictable cost, no cold
starts, no storage ceiling, and commercial use is unrestricted.

**Free *and* self-hosted?** → [Oracle Cloud Always Free](./ec2-docker.md#on-oracle-cloud-always-free)
gives 4 Arm cores and 24 GB RAM with no expiry. Follow the VM guide; it is platform-agnostic.

## Pre-flight checklist

Whatever the target:

- [ ] `NEXTAUTH_SECRET` set to a strong random value — **never** the shipped default
- [ ] `DATABASE_URL` set — and on serverless, the **pooled** connection string
- [ ] `EMBEDDING_DIMENSIONS` matches your embeddings model (768 for the Gemini default)
- [ ] `ENCRYPTION_KEY` set, at least 16 characters, and **backed up separately from the
      database** (rotating it invalidates every stored provider key)
- [ ] `NEXTAUTH_URL` is the real public URL, or OAuth callbacks and password-reset links break
- [ ] At least one AI provider key, or a reachable Ollama
- [ ] `EMBEDDINGS_PROVIDER` configured with its key — separate from the chat provider
- [ ] `RESEND_API_KEY` and `EMAIL_FROM` set, or password-reset links only reach the server log
- [ ] HTTPS, not plain HTTP
- [ ] Postgres **not** publicly reachable (port 5432 closed)
- [ ] Backups run, are stored off-box, and a restore has been **tested**
- [ ] `.env*` files out of version control

## Operational notes

- **Schema migrations are automatic.** The DDL is idempotent and new columns use
  `ADD COLUMN IF NOT EXISTS`, applied on the first request after a deploy behind a Postgres
  advisory lock. There is no manual migration step.
- **Maintenance mode** is `MAINTENANCE_MODE=true` — every page serves `/maintenance`, every API
  route returns 503.
- **Telemetry grows without bound.** `usage_events`, `request_logs`, `error_logs` and
  `activity_events` have no retention job. Prune them on a long-lived deployment.
- **One backup covers everything.** `pg_dump` captures accounts, documents, chats, encrypted
  keys and embeddings in a single file. Back up `ENCRYPTION_KEY` separately, or the restored
  keys are unreadable.
- **Chroma, if you use it, is pinned to 0.5.23.** The `chromadb@1.9.2` client speaks `/api/v1`,
  which Chroma removed in 0.6.0+. Do not bump the image without upgrading the client and
  `lib/db/vector/chroma.ts`.
