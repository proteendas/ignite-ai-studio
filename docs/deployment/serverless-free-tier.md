# Deploying on a free tier

You asked for the **best possible** free-tier deployment. This page gives it straight, because
there is a real constraint to work around first.

## The constraint

IgniteAI Studio stores state in two places that both assume a persistent filesystem:

| Component | What it needs |
| --- | --- |
| `better-sqlite3` | A writable file that survives between requests |
| Chroma | A long-running process with a persistent volume |

Plus the rate limiter keeps counters in process memory.

Serverless platforms give you neither. On Vercel, each function invocation gets an ephemeral
filesystem — **a SQLite file written during one request is gone by the next**. Users would
register and find their account missing minutes later.

So the honest position is:

> **Vercel + Neon cannot host this app as the code stands.** It needs the data layer ported from
> SQLite to Postgres first. That is a real piece of work, not a config change.

Below: what works today at zero cost, and what the port involves if you want the serverless path.

---

## Option A — Best free tier that works today, unchanged

**Oracle Cloud Always Free**, or **AWS EC2 free tier** for the first 12 months.

| Platform | Free allowance | Verdict |
| --- | --- | --- |
| **Oracle Cloud Always Free** | 4 Arm cores, **24 GB RAM**, 200 GB storage, *no expiry* | **Best free option.** Comfortably runs the whole stack. |
| AWS EC2 free tier | `t3.micro`, 1 GB RAM, 30 GB, **12 months only** | Works, but 1 GB is tight — build the image elsewhere. |
| Google Cloud `e2-micro` | 1 GB RAM, always free, US regions | Same tightness as EC2. |

Oracle's Always Free tier is dramatically more generous than anything else and does not expire.
With 24 GB of RAM it runs the app, Chroma and Caddy without strain.

**How:** follow the [EC2 guide](./ec2-docker.md) verbatim. It is platform-agnostic — provision an
Ubuntu 22.04 VM, open ports 22/80/443, and every step applies. On Oracle, also open the ports in
the VCN security list *and* in the instance's own `iptables`, which Oracle images configure
restrictively by default:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

**Why this is the best free-tier answer:** zero code changes, full feature parity, real
persistence, and a free tier that does not expire.

---

## Option B — Render free tier, no code changes

Runs today, with one significant caveat.

| Service | Plan | Role |
| --- | --- | --- |
| Web service (Docker) | Free | The Next.js app |
| Private service | Free | Chroma |

**The caveat:** Render's free tier has **no persistent disk** and **spins down after 15 minutes
of inactivity**. On spin-up the container filesystem is fresh, so *the SQLite database and the
Chroma data are wiped*. Every user, document and chat disappears.

That makes it usable for a demo you re-seed each time, and unusable for anything real. Render's
persistent disks start at a paid tier. First request after a spin-down also takes 30–50 seconds.

---

## Option C — Vercel + Neon + Render, after porting to Postgres

This is the architecture you asked about, and it is genuinely good once the port is done — but
the port comes first.

```
┌──────────────────────┐
│  Vercel (Hobby)      │   Next.js app: UI + API routes
│  free                │   (frontend and backend are one deployment)
└──────────┬───────────┘
           │
    ┌──────┴────────────────────────┐
    ▼                               ▼
┌─────────────────────┐   ┌──────────────────────┐
│ Neon (free)         │   │ Chroma on Render     │
│ Postgres 0.5 GB     │   │ OR pgvector in Neon  │
│ + pgvector          │   │                      │
└─────────────────────┘   └──────────────────────┘
```

### First, a correction on the shape

You described Vercel for frontend, Render for backend, Neon for database. **This app has no
separate backend** — the API routes in `app/api/` are part of the same Next.js deployment. So
Vercel hosts both, and Render is only needed if you want Chroma as a separate service.

**Better still: skip Chroma entirely.** Neon supports the `pgvector` extension, so the
relational data *and* the vectors live in one free Postgres database. That removes a whole
service, removes Render from the picture, and removes the spin-down problem.

### Free allowances

| Service | Free tier | Watch out for |
| --- | --- | --- |
| Vercel Hobby | 100 GB bandwidth, serverless functions | **10s function timeout.** Non-commercial use only. |
| Neon | 0.5 GB storage, 1 project, pgvector included | Scales to zero; first query after idle is slow |

> **The 10-second timeout is the sharpest edge.** Ingesting a large PDF — parse, chunk, embed
> every chunk, write vectors — routinely exceeds it. Ingestion must be moved to a background job
> or chunked across requests. This is the single biggest practical obstacle after the port.

### What the port involves

**1. Replace the driver.** `better-sqlite3` is synchronous; `pg` is not. Every function in
`lib/db/sql/client.ts` — roughly 60 exported functions — becomes `async`, and every call site
must `await`. This is the bulk of the work, and it is mechanical but wide-reaching.

**2. Translate the schema.** SQLite → Postgres:

| SQLite | Postgres |
| --- | --- |
| `TEXT PRIMARY KEY` | `TEXT PRIMARY KEY` (unchanged) |
| `INTEGER` used as boolean | `BOOLEAN` |
| `TEXT NOT NULL DEFAULT (datetime('now'))` | `TIMESTAMPTZ NOT NULL DEFAULT now()` |
| `datetime('now', '-1 day')` | `now() - interval '1 day'` |
| `INTEGER PRIMARY KEY` autoincrement | `GENERATED ALWAYS AS IDENTITY` |

Also replace `PRAGMA table_info` in `migrateExistingTables()` with a query against
`information_schema.columns`, and drop the `journal_mode`/`foreign_keys` pragmas.

**3. Move the vectors into pgvector.**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  embedding   VECTOR(768)          -- must match your embedding model's dimensions
);

CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON document_chunks (owner_id, document_id);
```

Then write a `VectorStore` implementation in `lib/db/vector/pgvector.ts` and register it in
`getVectorStore()`. **This part is genuinely easy** — the vector store already sits behind a
clean interface precisely so it can be swapped. Similarity search becomes:

```sql
SELECT content, 1 - (embedding <=> $1) AS score
FROM document_chunks
WHERE owner_id = $2
ORDER BY embedding <=> $1
LIMIT $3;
```

Set `VECTOR(n)` to your model's dimension — 768 for Gemini's default, 384 for
`all-MiniLM-L6-v2`. Getting this wrong fails at insert time.

**4. Use a pooled connection.** Serverless functions open many short-lived connections. Use
Neon's **pooled** connection string (it has `-pooler` in the host), or `@neondatabase/serverless`
which speaks HTTP and avoids connection exhaustion entirely.

**5. Move ingestion off the request path.** Because of the 10-second timeout.

**6. Replace the rate limiter.** In-memory counters are meaningless across serverless instances.
Upstash Redis has a free tier and is the usual pairing.

### Deploying once ported

1. **Neon** — create a project, run the translated schema plus `CREATE EXTENSION vector`, copy
   the **pooled** connection string.
2. **Vercel** — import the repo, framework auto-detects as Next.js.
3. **Environment variables** in Vercel:
   ```
   DATABASE_URL=postgres://...-pooler.../neondb?sslmode=require
   NEXTAUTH_URL=https://your-app.vercel.app
   NEXTAUTH_SECRET=...
   ENCRYPTION_KEY=...
   GROQ_API_KEY=...
   EMBEDDINGS_PROVIDER=gemini
   GOOGLE_GEMINI_API_KEY=...
   RESEND_API_KEY=...
   EMAIL_FROM="IgniteAI Studio <noreply@yourdomain.com>"
   VECTOR_DB_PROVIDER=pgvector
   ```
4. **Deploy**, then set `NEXTAUTH_URL` to the real assigned domain and redeploy — OAuth
   callbacks and password-reset links both depend on it being exact.

---

## Recommendation

| If you want… | Do this |
| --- | --- |
| **Free, working today, zero code changes** | **Oracle Cloud Always Free** + the [EC2 guide](./ec2-docker.md). This is the best free-tier answer. |
| A throwaway demo you re-seed | Render free tier, accepting that data is wiped on spin-down |
| The serverless architecture | Port to Postgres/pgvector first, then Vercel + Neon |
| Production without the port | A small paid VM, ~$6/month |

**For most people: Oracle Cloud Always Free.** It costs nothing, never expires, needs no code
changes, and gives you more RAM than the paid tiers being compared against it. The Vercel + Neon
path is architecturally cleaner and worth doing if you are prepared for the port — but it is a
project, not a deployment step.

## Things that will bite you on any free tier

- **Cold starts.** Scale-to-zero means a slow first request. Neon and Render both do this.
- **Provider rate limits.** Free AI tiers throttle aggressively; failover across several
  configured providers helps.
- **Neon's 0.5 GB.** Embeddings are the bulk of it — roughly 3 KB per chunk at 768 dimensions.
  A few hundred documents will approach the limit.
- **Vercel Hobby is non-commercial.** Commercial use requires a paid plan; check the terms.
- **`ENCRYPTION_KEY` must be stable.** Changing it between deploys invalidates every stored
  provider key.
