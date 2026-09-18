# Deploying free on Vercel + Neon

A complete walkthrough from an empty account to a live, free, HTTPS deployment — then how to
operate it.

The app runs on Vercel's free Hobby tier with a free Neon Postgres database. **No paid services,
no code changes.** The data layer runs on Postgres and pgvector precisely so this works.

**Time required:** about 15 minutes.

---

## Table of contents

1. [What you are building](#1-what-you-are-building)
2. [Why this works](#2-why-this-works-and-what-had-to-change)
3. [What you need before starting](#3-what-you-need-before-starting)
4. [Create the Neon database](#4-create-the-neon-database)
5. [Get your API keys](#5-get-your-api-keys)
6. [Generate your secrets](#6-generate-your-secrets)
7. [Push the code to GitHub](#7-push-the-code-to-github)
8. [Deploy to Vercel](#8-deploy-to-vercel)
9. [Fix NEXTAUTH_URL and redeploy](#9-fix-nextauth_url-and-redeploy)
10. [Verify it works](#10-verify-it-works)
11. [Add a custom domain](#11-add-a-custom-domain-optional)
12. [Operating it](#12-operating-it)
13. [Limits to know about](#13-limits-to-know-about)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. What you are building

```
                        Internet
                            │
                      HTTPS (automatic)
                            │
            ┌───────────────▼────────────────┐
            │      Vercel (Hobby — free)     │
            │                                │
            │   Next.js: the UI *and* the    │
            │   API routes, one deployment   │
            └───────────────┬────────────────┘
                            │  DATABASE_URL (pooled)
                            ▼
            ┌────────────────────────────────┐
            │       Neon (free tier)         │
            │                                │
            │  Postgres 0.5 GB:              │
            │   • accounts, documents, chats │
            │   • encrypted API keys, logs   │
            │   • pgvector embeddings        │
            └────────────────────────────────┘
```

**Two services, one database.** Embeddings live in pgvector inside the same Neon database as
everything else — there is no separate vector service to run, pay for, or back up.

> **A note on "frontend, backend and database".** This app has **no separate backend**. The API
> routes in `app/api/` are part of the same Next.js deployment, so Vercel hosts both the UI and
> the API. You do not need a third service such as Render.

---

## 2. Why this works, and what had to change

Worth understanding, because it explains several of the settings below.

The app originally used **SQLite** (a database in a file on disk) and **Chroma** (a separate
always-running service). Neither can work on Vercel: serverless functions get a fresh, empty
filesystem on every invocation, so a SQLite file written during one request is **gone by the
next** — users would register and find their accounts missing minutes later.

The data layer was therefore ported:

| Was | Now | Why it mattered |
| --- | --- | --- |
| `better-sqlite3`, a file on disk | `pg` talking to Postgres | Serverless has no persistent filesystem |
| Synchronous database calls | Fully `async` | `pg` is async — ~60 functions and every call site |
| Chroma, an always-running service | **pgvector**, inside Postgres | Nothing long-running to host; one datastore instead of two |
| In-memory rate limiter | Postgres-backed, atomic | Per-process counters never accumulate when every request may get a new process |
| Schema loaded from a `.sql` file | Inlined in TypeScript | Bundlers do not reliably ship loose files, and `__dirname` is unreliable |
| 10-second function limit | `maxDuration` raised on heavy routes | Ingestion and the agent loop legitimately take longer |
| Native compilation (`node-gyp`) | Pure JavaScript | `pg` needs no compiler; builds stopped failing on newer Node |

You do not need to do any of this — it is already done. It is described so the pooling and
dimension settings below make sense.

---

## 3. What you need before starting

| Thing | Cost | Where |
| --- | --- | --- |
| GitHub account | Free | [github.com](https://github.com) |
| Vercel account | Free | [vercel.com](https://vercel.com) — sign in with GitHub |
| Neon account | Free | [neon.tech](https://neon.tech) — sign in with GitHub |
| Groq API key (chat) | Free | [console.groq.com](https://console.groq.com) |
| Google Gemini API key (embeddings) | Free | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| *(Optional)* Resend account | Free tier | [resend.com](https://resend.com) |

You need **two** AI keys because Groq has no embeddings endpoint. Chat and embeddings are
configured separately.

---

## 4. Create the Neon database

1. Go to [neon.tech](https://neon.tech) and sign in with GitHub.
2. **Create a project.**
   - **Name**: `igniteai-studio`
   - **Postgres version**: 16
   - **Region**: pick the one nearest your users, and remember it — you will match Vercel's
     region to it in step 8. Every request crosses this gap, so mismatched regions add latency
     to every page.
3. When it finishes, the **Connection Details** panel appears.
4. **Select "Pooled connection"** from the dropdown, then copy the string. It looks like:

   ```
   postgres://neondb_owner:xxxxx@ep-cool-name-12345678-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

> ### Use the POOLED string. This is the most common mistake.
>
> Notice **`-pooler`** in the hostname. Neon offers two endpoints:
>
> - **Direct** — one TCP connection per client. Every serverless invocation opens its own pool,
>   and Postgres runs out of connection slots under even modest traffic. You get
>   `too many connections` errors that appear only under load.
> - **Pooled** — connections are multiplexed through PgBouncer. This is what serverless needs.
>
> If your copied string does **not** contain `-pooler`, you have the wrong one. Go back and
> change the dropdown.

**You do not need to create any tables.** The app creates its own schema, indexes, and the
`vector` extension on its first request — all guarded by `IF NOT EXISTS` and serialised behind a
Postgres advisory lock, so several cold-starting instances cannot corrupt each other.

---

## 5. Get your API keys

**Groq (chat)** — [console.groq.com](https://console.groq.com) → sign in → **API Keys** →
**Create API Key**. Copy it now; it is shown only once. Starts with `gsk_`.

**Google Gemini (embeddings)** — [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
→ **Create API key**. Copy it.

**Resend (email, optional)** — [resend.com](https://resend.com) → **API Keys** → **Create**.
Starts with `re_`. Without it the app still works, but password-reset links are written to the
Vercel logs instead of being emailed — fine for testing, useless for real users.

---

## 6. Generate your secrets

Two random secrets are required. On your own machine:

```bash
openssl rand -base64 32     # run this TWICE
```

Keep both results. One becomes `NEXTAUTH_SECRET`, the other `ENCRYPTION_KEY`. They must be
different.

> **`ENCRYPTION_KEY` cannot be changed later.** It encrypts every provider API key your users
> save. Change it and all of them become permanently unreadable — everyone must re-enter their
> keys. Store a copy in a password manager now.

On Windows without `openssl`, use PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```

---

## 7. Push the code to GitHub

If the code is not on GitHub yet:

```bash
cd /path/to/ignite-ai-studio
git remote -v                  # check where it points
git push origin main
```

For a brand-new repository: create an empty one at [github.com/new](https://github.com/new)
(no README), then:

```bash
git remote add origin git@github.com:YOUR_USERNAME/ignite-ai-studio.git
git push -u origin main
```

`.env` files are gitignored, so no secrets are pushed. Confirm with `git status` before pushing.

---

## 8. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. **Import** your `ignite-ai-studio` repository. (First time, authorise Vercel to read your
   GitHub repos.)
3. Vercel detects **Next.js** automatically. **Do not change** the build command, output
   directory or install command.
4. Expand **Environment Variables** and add each of the following. Add them **now** — a deploy
   without them will fail.

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Your **pooled** Neon string from step 4 |
| `PG_POOL_MAX` | `3` |
| `VECTOR_DB_PROVIDER` | `pgvector` |
| `EMBEDDING_DIMENSIONS` | `768` |
| `NEXTAUTH_SECRET` | Your first generated secret |
| `ENCRYPTION_KEY` | Your second generated secret |
| `NEXTAUTH_URL` | `https://placeholder.vercel.app` — corrected in step 9 |
| `GROQ_API_KEY` | Your Groq key |
| `EMBEDDINGS_PROVIDER` | `gemini` |
| `GOOGLE_GEMINI_API_KEY` | Your Gemini key |
| `RESEND_API_KEY` | Your Resend key *(optional)* |
| `EMAIL_FROM` | `IgniteAI Studio <onboarding@resend.dev>` *(optional)* |

5. Under **Settings → Functions**, set the region to **match your Neon region** from step 4.
   Every database query crosses this distance.

6. Click **Deploy** and wait 2–4 minutes.

### About `PG_POOL_MAX`

Each Vercel instance opens its own pool. With many concurrent instances, a high value exhausts
even a pooled endpoint. `3` is a sensible ceiling for the free tier; raise it only if you see
queries queueing, and only alongside monitoring Neon's connection count.

### About `EMBEDDING_DIMENSIONS`

The pgvector column is `VECTOR(n)`, fixed when the table is first created. **It must match your
embeddings model:**

| Model | Value |
| --- | --- |
| Gemini (the default here) | **768** |
| HuggingFace `all-MiniLM-L6-v2` | 384 |
| OpenAI `text-embedding-3-small` | 1536 |
| OpenAI `text-embedding-3-large` | 3072 |
| Ollama `nomic-embed-text` | 768 |

Get it wrong and your first upload fails with an error naming both numbers. To change it later,
run `DROP TABLE document_chunks;` in the Neon SQL editor and re-upload — the app recreates the
table at the new width. Changing embeddings model requires re-ingesting anyway, since vectors
from different models are not comparable.

---

## 9. Fix `NEXTAUTH_URL` and redeploy

Vercel has now assigned your real domain, something like
`ignite-ai-studio-abc123.vercel.app`.

1. **Settings → Environment Variables** → edit `NEXTAUTH_URL`.
2. Set it to your actual URL, **with `https://` and no trailing slash**:
   ```
   https://ignite-ai-studio-abc123.vercel.app
   ```
3. **Deployments** → the most recent one → **⋯** → **Redeploy**.

> **Why this matters.** `NEXTAUTH_URL` is what password-reset links, email-verification links and
> OAuth callbacks are built from. Leave it as the placeholder and every reset email points
> somewhere that does not exist — and the failure is silent until a user tries it.

Environment variable changes **only take effect on a new deployment**. Editing without
redeploying does nothing.

---

## 10. Verify it works

1. Open your Vercel URL. The login page should load.
2. **Register an account.** The first request creates the entire schema, so it may take a second
   or two.
3. Check the database actually received it — in Neon, open **SQL Editor**:

   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
   ```

   You should see around twenty tables. Then:

   ```sql
   SELECT id, email, created_at FROM users;
   ```

   Your new account should be there.

4. **Upload a document** on the Documents page. When it reaches **ready**, confirm the
   embeddings landed:

   ```sql
   SELECT COUNT(*) FROM document_chunks;
   ```

   A non-zero count means the whole pipeline — Postgres, embeddings, pgvector — is working.

5. **Ask a question** in Grounded mode and check the Sources panel shows the passages used.

If all five steps pass, you are done.

---

## 11. Add a custom domain (optional)

1. Vercel → your project → **Settings → Domains** → **Add**.
2. Enter your domain and follow the DNS instructions (usually a `CNAME` to
   `cname.vercel-dns.com`).
3. Wait for it to verify. HTTPS is automatic.
4. **Update `NEXTAUTH_URL` to the new domain and redeploy** — same reason as step 9.
5. If you use OAuth sign-in, update the callback URLs at Google/GitHub too.

---

## 12. Operating it

### Deploying changes

Push to `main`; Vercel builds and deploys automatically. Pull requests get their own preview
deployments.

Schema changes apply themselves on the next request — the DDL is idempotent and new columns use
`ADD COLUMN IF NOT EXISTS`. There is no migration step.

### Logs

Vercel → your project → **Logs**. Filter by function to find a specific route. This is also
where password-reset links appear if `RESEND_API_KEY` is not set.

### Backups

Neon's free tier keeps 7 days of point-in-time history — **Restore** in the Neon console rolls
the branch back to any moment within it.

For your own copy:

```bash
pg_dump "postgres://...your pooled url..." -Fc -f igniteai-$(date +%F).dump
```

One file contains everything, embeddings included — the practical benefit of a single datastore.
Restore with:

```bash
pg_restore -d "postgres://...your pooled url..." --clean --if-exists igniteai-2026-09-18.dump
```

> Back up `ENCRYPTION_KEY` **separately**. A dump restored without the original key leaves every
> stored provider API key permanently unreadable.

### Maintenance mode

Set `MAINTENANCE_MODE=true` in Vercel and redeploy. Every page serves the maintenance screen;
every API route returns 503. Remove it and redeploy to come back.

### Housekeeping

The logging tables grow forever. Occasionally, in the Neon SQL editor:

```sql
DELETE FROM request_logs   WHERE created_at < now() - interval '30 days';
DELETE FROM error_logs     WHERE created_at < now() - interval '30 days';
DELETE FROM activity_events WHERE created_at < now() - interval '90 days';
```

This matters more here than on a VM, because Neon's free tier is only 0.5 GB.

---

## 13. Limits to know about

| Limit | Value | What it means in practice |
| --- | --- | --- |
| Neon storage | 0.5 GB | Embeddings dominate — roughly 3 KB per chunk at 768 dimensions. A few hundred documents approaches it. |
| Vercel function duration | 60s (Hobby) | A very large PDF can still time out during ingestion. Split it. |
| Vercel bandwidth | 100 GB/month | Generous for this workload. |
| Neon compute | Scales to zero | The first query after idle takes a second or two. Normal. |
| Vercel Hobby licence | **Non-commercial only** | Commercial use requires a paid plan. Check the terms. |

### Cold starts

Both Neon and Vercel scale to zero when idle, so the first request after a quiet period is slow.
Subsequent requests are fast. This is the main visible cost of a free tier, and it is not a
misconfiguration.

### Growing beyond the free tier

- **Storage** → Neon's paid tiers start around $19/month.
- **Function duration** → Vercel Pro raises it to 300s (the app already requests this).
- **Prefer a fixed monthly cost** → the [single VM guide](./ec2-docker.md) runs the whole stack
  for roughly $6–15/month, or free on Oracle Cloud Always Free.

---

## 14. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Build fails immediately | Environment variables missing | Add them all, then redeploy |
| `DATABASE_URL is not set` | Not added, or added after deploying | Add it and **redeploy** — edits alone do nothing |
| `too many connections` under load | Using the **direct** Neon endpoint, or `PG_POOL_MAX` too high | Switch to the `-pooler` string; set `PG_POOL_MAX=3` |
| `The pgvector extension is not available` | The role lacks permission | Neon allows it by default. Elsewhere, run `CREATE EXTENSION vector;` once as a superuser |
| Upload fails with a dimension error | `EMBEDDING_DIMENSIONS` does not match the model | Fix it, `DROP TABLE document_chunks;`, re-upload |
| Reset emails link to a placeholder domain | `NEXTAUTH_URL` never corrected | Step 9 |
| Reset emails never arrive | `RESEND_API_KEY` not set | The link is in the Vercel logs instead |
| Function timeout during ingestion | Document too large for one invocation | Split the document, or upgrade the plan |
| First request of the day is slow | Neon and Vercel cold starts | Expected on a free tier |
| Stored API keys stopped working | `ENCRYPTION_KEY` changed | Restore the previous value |
| "Encryption is not configured" | `ENCRYPTION_KEY` missing or under 16 characters | Set it and redeploy |
| 503 everywhere | `MAINTENANCE_MODE` still true | Remove it and redeploy |

### Checking the database directly

Most problems are answerable from Neon's **SQL Editor**:

```sql
-- Did the schema get created?
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1;

-- Is the vector extension installed?
SELECT extname FROM pg_extension WHERE extname = 'vector';

-- How wide is the embedding column? (must match EMBEDDING_DIMENSIONS)
SELECT atttypmod FROM pg_attribute
WHERE attrelid = 'document_chunks'::regclass AND attname = 'embedding';

-- Are documents being ingested?
SELECT status, COUNT(*) FROM documents GROUP BY status;

-- How much storage are embeddings using?
SELECT pg_size_pretty(pg_total_relation_size('document_chunks'));
```
