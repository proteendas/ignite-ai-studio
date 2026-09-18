# Deploying to a single server (AWS EC2, Oracle Cloud, any VM)

A complete walkthrough: from an empty cloud account to a working HTTPS deployment, then how to
back it up, update it and fix it when it breaks.

Every command below is meant to be copied and run in order. Where you must substitute your own
value, it looks `like_this` and the text says what to put there.

**Time required:** about 30 minutes, most of it waiting for installs.

---

## Table of contents

1. [What you are building](#1-what-you-are-building)
2. [What you need before starting](#2-what-you-need-before-starting)
3. [Create the server](#3-create-the-server)
4. [Open the right network ports](#4-open-the-right-network-ports)
5. [Connect to the server](#5-connect-to-the-server)
6. [Install Docker](#6-install-docker)
7. [Add swap space](#7-add-swap-space)
8. [Get the code onto the server](#8-get-the-code-onto-the-server)
9. [Create the configuration file](#9-create-the-configuration-file)
10. [Point a domain at the server](#10-point-a-domain-at-the-server)
11. [Configure HTTPS](#11-configure-https)
12. [Start the application](#12-start-the-application)
13. [Verify it works](#13-verify-it-works)
14. [Back it up](#14-back-it-up)
15. [Update to a new version](#15-update-to-a-new-version)
16. [Day-to-day operations](#16-day-to-day-operations)
17. [Troubleshooting](#17-troubleshooting)
18. [Security checklist](#18-security-checklist)

---

## 1. What you are building

Three containers on one machine, managed by Docker Compose:

```
                    Internet
                        │
                   ports 80/443
                        │
            ┌───────────▼───────────┐
            │        Caddy          │  The only container reachable from
            │  (reverse proxy,      │  outside. Terminates HTTPS and
            │   automatic HTTPS)    │  forwards to the app.
            └───────────┬───────────┘
                        │ internal network only
            ┌───────────▼───────────┐
            │      app              │  Next.js — the UI and the API.
            │   (Next.js, port 3000)│  Not published to the internet.
            └───────────┬───────────┘
                        │ internal network only
            ┌───────────▼───────────┐
            │      postgres         │  All data: accounts, documents,
            │  (pgvector, port 5432)│  chats, keys, AND the embeddings.
            └───────────────────────┘
                        │
                  postgres-data
                (a Docker volume —
                 this is your data)
```

**Why only one machine?** The app is designed to run as a single instance. Nothing here needs a
load balancer or a cluster, and adding one would break the assumptions the app makes. If you
outgrow one machine, the [Vercel + Neon guide](./serverless-free-tier.md) is the path that
scales.

**Where is the data?** One Docker volume, `postgres-data`. Since embeddings moved into pgvector,
this single volume holds everything — there is no second store to keep in sync.

---

## 2. What you need before starting

| Thing | Why | Cost |
| --- | --- | --- |
| A cloud account | To create the server | AWS/Oracle both have free tiers |
| A domain name | For HTTPS. Without one you are stuck on plain HTTP | ~$10/year, or use a free subdomain |
| An AI provider API key | The app cannot answer anything without one | Groq is free — [console.groq.com](https://console.groq.com) |
| An embeddings API key | Separate from chat; Groq has no embeddings endpoint | Gemini is free — [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| *(Optional)* A Resend account | To send password-reset emails | Free tier — [resend.com](https://resend.com) |

Get the two API keys now; you will paste them in at step 9.

---

## 3. Create the server

### Choosing a size

| Your situation | Instance type | Disk |
| --- | --- | --- |
| Trying it out, a handful of users | `t3.small` — 2 vCPU, 2 GB RAM | 20 GB |
| Real use, a team | `t3.medium` — 2 vCPU, 4 GB RAM | 30 GB |
| Lots of document ingestion | `t3.large` — 2 vCPU, 8 GB RAM | 50 GB |

> **Do not use a 1 GB instance** (`t2.micro`, `t3.micro`) if you plan to build on it. Postgres
> plus a Next.js build will run out of memory. Step 7 adds swap, which makes 2 GB workable. If
> you are tied to a 1 GB free-tier instance, build the Docker image on your laptop and push it
> to a registry instead of building on the server.

### On AWS EC2

1. Sign in to the AWS Console → **EC2** → **Launch instance**.
2. **Name**: `igniteai-studio`
3. **Application and OS Images**: **Ubuntu Server 22.04 LTS** (64-bit x86).
4. **Instance type**: `t3.small` or larger, per the table above.
5. **Key pair**: **Create new key pair** → name it `igniteai` → type **ED25519** → format
   **.pem**. It downloads once. Save it; you cannot download it again.
6. **Network settings**: click **Edit**, then configure the ports as in
   [step 4](#4-open-the-right-network-ports).
7. **Configure storage**: set the size from the table, type **gp3**.
8. **Launch instance**.

**Then give it a fixed IP address.** By default a stopped instance gets a new IP on restart,
which breaks your DNS:

1. **EC2** → **Elastic IPs** → **Allocate Elastic IP address** → **Allocate**.
2. Select it → **Actions** → **Associate Elastic IP address** → choose your instance →
   **Associate**.

Write down this IP. You need it at steps 5 and 10.

### On Oracle Cloud (Always Free)

Oracle's free tier is far more generous — 4 Arm cores and 24 GB RAM, with no expiry.

1. **Compute** → **Instances** → **Create instance**.
2. **Image**: Ubuntu 22.04. **Shape**: `VM.Standard.A1.Flex`, 4 OCPUs, 24 GB RAM (all free).
3. Add your SSH public key.
4. Create, then **reserve a public IP** so it survives a restart.

Oracle blocks ports at *two* levels. As well as the VCN security list (step 4), you must open
them in the instance's own firewall once you are connected:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Forgetting this is the single most common Oracle Cloud mistake — everything looks correct and
nothing connects.

---

## 4. Open the right network ports

In AWS: **EC2** → **Security Groups** → your instance's group → **Edit inbound rules**.

| Type | Port | Source | Why |
| --- | --- | --- | --- |
| SSH | 22 | **My IP** | So you can administer it. Not `0.0.0.0/0`. |
| HTTP | 80 | `0.0.0.0/0` | Caddy needs it to obtain the TLS certificate |
| HTTPS | 443 | `0.0.0.0/0` | The actual site |

**Do not open ports 3000 or 5432.**

- **3000** is the app. Exposing it lets people bypass HTTPS entirely.
- **5432** is Postgres — **all of your data**, behind one password. Never expose it.

The production configuration already keeps both off the public network. Opening them in the
security group undoes that protection.

Port 80 must stay open even for an HTTPS-only site: Let's Encrypt validates domain ownership
over plain HTTP before it will issue a certificate.

---

## 5. Connect to the server

On your own machine, in a terminal:

```bash
chmod 400 ~/Downloads/igniteai.pem          # the key file must not be world-readable
ssh -i ~/Downloads/igniteai.pem ubuntu@YOUR_SERVER_IP
```

Replace `YOUR_SERVER_IP` with the Elastic IP from step 3. On Oracle the username is also
`ubuntu`; on Amazon Linux it is `ec2-user`.

The first connection asks you to confirm the host fingerprint — type `yes`.

**If it hangs**, your security group is not allowing SSH from your current IP. Home IPs change;
re-check the **My IP** rule.

Everything from here runs **on the server**.

---

## 6. Install Docker

Copy this whole block and paste it in one go:

```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

The last line lets you run Docker without `sudo`, but **it only takes effect on a new login**:

```bash
exit
```

Then SSH back in (step 5) and confirm:

```bash
docker compose version
```

You should see something like `Docker Compose version v2.x.x`. If you get "permission denied",
you did not log out and back in.

---

## 7. Add swap space

Building the app is memory-hungry. Swap turns "the build was killed" into "the build was slow":

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

The last line makes it survive a reboot. Check it worked:

```bash
free -h
```

The `Swap:` row should show 2.0Gi. Skip this only if your server has 8 GB RAM or more.

---

## 8. Get the code onto the server

```bash
sudo apt-get install -y git
sudo mkdir -p /opt/igniteai
sudo chown $USER:$USER /opt/igniteai
git clone https://github.com/YOUR_USERNAME/ignite-ai-studio.git /opt/igniteai
cd /opt/igniteai
```

Replace the URL with your repository. For a private repo, either use a deploy key or clone over
HTTPS with a personal access token.

Stay in `/opt/igniteai` for the rest of this guide.

---

## 9. Create the configuration file

The production setup reads **`.env.production`** (not `.env`).

### Generate your secrets first

Run this three separate times and keep each result — they must all be different:

```bash
openssl rand -base64 32
```

You need one for `NEXTAUTH_SECRET`, one for `ENCRYPTION_KEY`, and one for `POSTGRES_PASSWORD`.

### Create the file

```bash
cp .env.example .env.production
chmod 600 .env.production      # readable only by you
nano .env.production
```

Set the following. Everything else can stay commented out.

```bash
# ---- Database ----
# Only the password goes here; the app's connection string is assembled by
# docker-compose.prod.yml and points at the postgres container.
POSTGRES_PASSWORD=paste_your_third_generated_secret_here

# ---- Vector store ----
VECTOR_DB_PROVIDER=pgvector
EMBEDDING_DIMENSIONS=768        # 768 is correct for Gemini — see the note below

# ---- Public URL ----
# MUST be your real domain, with https://. Password-reset links and OAuth
# callbacks are built from this. Getting it wrong sends your users to localhost.
NEXTAUTH_URL=https://studio.yourdomain.com

# ---- Secrets ----
NEXTAUTH_SECRET=paste_your_first_generated_secret_here
ENCRYPTION_KEY=paste_your_second_generated_secret_here

# ---- AI providers ----
GROQ_API_KEY=gsk_your_groq_key
EMBEDDINGS_PROVIDER=gemini
GOOGLE_GEMINI_API_KEY=your_gemini_key

# ---- Email (optional, but password reset does not work without it) ----
RESEND_API_KEY=re_your_resend_key
EMAIL_FROM="IgniteAI Studio <noreply@yourdomain.com>"
```

Save with `Ctrl+O`, `Enter`, then exit with `Ctrl+X`.

### Two things that will hurt later if you get them wrong

> **`ENCRYPTION_KEY` cannot be changed.** It encrypts every API key your users store. Change it
> and all of them become permanently unreadable — everyone has to re-enter their keys. **Save a
> copy somewhere other than this server**, such as a password manager. If the server dies and you
> restore a backup without this key, the backup's stored keys are useless.

> **`EMBEDDING_DIMENSIONS` must match your embeddings model**, and is fixed once the first
> document is ingested:
>
> | Model | Value |
> | --- | --- |
> | Gemini (the default) | **768** |
> | HuggingFace `all-MiniLM-L6-v2` | 384 |
> | OpenAI `text-embedding-3-small` | 1536 |
> | Ollama `nomic-embed-text` | 768 |
>
> Wrong value → the first upload fails with an error naming both numbers. Fixing it means
> `DROP TABLE document_chunks;` and re-uploading everything.

---

## 10. Point a domain at the server

At your domain registrar (Namecheap, Cloudflare, GoDaddy…), add one DNS record:

| Field | Value |
| --- | --- |
| Type | **A** |
| Name / Host | `studio` (for `studio.yourdomain.com`), or `@` for the root domain |
| Value | Your Elastic IP from step 3 |
| TTL | Automatic, or 300 |

If you use Cloudflare, set the proxy status to **DNS only** (grey cloud) for now. The orange
cloud interferes with Caddy obtaining its certificate.

DNS takes a few minutes to propagate. Check from the server:

```bash
dig +short studio.yourdomain.com
```

**Wait until this prints your server's IP** before continuing. Caddy cannot get a certificate
until it does, and failed attempts are rate-limited by Let's Encrypt.

---

## 11. Configure HTTPS

Out of the box the `Caddyfile` serves plain HTTP, because a certificate cannot be issued for an
`amazonaws.com` hostname you do not own.

```bash
nano Caddyfile
```

Replace the entire contents with your domain:

```caddy
studio.yourdomain.com {
	reverse_proxy app:3000
	encode gzip
}
```

That is all. Caddy obtains the certificate from Let's Encrypt on first start and renews it
automatically forever. There is no certbot to configure and no renewal cron job to forget.

> **Running without a domain?** Leave the `Caddyfile` as `:80`. Everything works, but over plain
> HTTP — session cookies travel unencrypted and anyone on the network path can read them. Fine
> for a private test, **not acceptable for real accounts**.

---

## 12. Start the application

```bash
cd /opt/igniteai
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Breaking that down:

- `-f docker-compose.yml -f docker-compose.prod.yml` — the base file plus the production
  overrides. The second file removes the published ports from `app` and `postgres` and adds
  Caddy. **Always pass both.** Using only the base file exposes your database to the internet.
- `up -d` — start in the background.
- `--build` — build the app image from source first.

The first build takes 3–8 minutes. Watch it:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
```

Press `Ctrl+C` to stop watching (this does not stop the app).

The app creates its own database tables on the first request, so there is no migration command
to run.

---

## 13. Verify it works

Check all three containers are up:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

You want `running` for `app`, `postgres` and `caddy`. `postgres` should also show `(healthy)`.

Check the app responds internally:

```bash
curl -I http://localhost
```

`HTTP/1.1 200 OK` or a `307` redirect to `/login` both mean success.

Confirm the database accepted the schema:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
  psql -U igniteai -d igniteai -c '\dt'
```

You should see about twenty tables. If you see none, the app has not served its first request
yet — load the site once and try again.

Then **open `https://studio.yourdomain.com` in a browser**, register an account, and upload a
document. If the document reaches **ready**, the whole pipeline — database, embeddings, pgvector
— is working.

---

## 14. Back it up

Everything lives in one Postgres database, so one dump captures all of it: accounts, documents,
chats, generated content, encrypted keys, and every embedding.

### Create the backup script

```bash
nano /opt/igniteai/backup.sh
```

Paste:

```bash
#!/usr/bin/env bash
set -euo pipefail

STAMP=$(date +%F-%H%M)
DEST=/opt/backups
mkdir -p "$DEST"

cd /opt/igniteai
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U igniteai -Fc igniteai > "$DEST/igniteai-$STAMP.dump"

# Keep a fortnight of daily backups
find "$DEST" -name 'igniteai-*.dump' -mtime +14 -delete

echo "Backed up to $DEST/igniteai-$STAMP.dump"
```

Make it executable and test it **now**, not when you need it:

```bash
chmod +x /opt/igniteai/backup.sh
/opt/igniteai/backup.sh
ls -lh /opt/backups
```

### Run it nightly

```bash
crontab -e
```

Add this line (3 a.m. daily):

```
0 3 * * * /opt/igniteai/backup.sh >> /var/log/igniteai-backup.log 2>&1
```

### Copy backups off the server

A backup on the same disk as the data protects you from almost nothing. Send it elsewhere:

```bash
sudo apt-get install -y awscli
# then append to the cron line:
#   && aws s3 sync /opt/backups s3://your-bucket/igniteai/
```

> **Also back up `ENCRYPTION_KEY`, separately.** A database dump restored without the original
> key leaves every stored provider API key permanently unreadable.

### Restoring

```bash
cd /opt/igniteai
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop app

cat /opt/backups/igniteai-2026-09-18-0300.dump | \
  docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U igniteai -d igniteai --clean --if-exists

docker compose -f docker-compose.yml -f docker-compose.prod.yml start app
```

`--clean --if-exists` drops the existing objects first, so this replaces rather than merges.
**Practise a restore once**, onto a throwaway server, before you are relying on it.

---

## 15. Update to a new version

```bash
cd /opt/igniteai
./backup.sh                                                    # always first
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker image prune -f                                          # reclaim disk
```

Database schema changes apply themselves on the next request — the DDL is idempotent and new
columns use `ADD COLUMN IF NOT EXISTS`. There is nothing to run by hand.

### Updating with a visible notice

For an update where you want users to see an explanation rather than errors:

```bash
echo 'MAINTENANCE_MODE=true' >> .env.production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
# ... do the update ...
sed -i '/MAINTENANCE_MODE=true/d' .env.production
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

While it is on, every page shows the maintenance screen and every API call returns 503.

---

## 16. Day-to-day operations

### Viewing logs

```bash
cd /opt/igniteai
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

$COMPOSE logs -f app          # application
$COMPOSE logs -f caddy        # HTTPS / certificate issues
$COMPOSE logs -f postgres     # database
$COMPOSE logs --tail=100 app  # last 100 lines only
```

Save yourself the typing by adding the alias permanently:

```bash
echo "alias dc='docker compose -f /opt/igniteai/docker-compose.yml -f /opt/igniteai/docker-compose.prod.yml'" >> ~/.bashrc
source ~/.bashrc
```

### Stop log files eating the disk

```bash
sudo nano /etc/docker/daemon.json
```

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

```bash
sudo systemctl restart docker
```

### Restart / stop

```bash
$COMPOSE restart app     # just the app
$COMPOSE down            # stop everything (data is safe in the volume)
$COMPOSE up -d           # start again
```

All services use `restart: unless-stopped`, so they come back automatically after a reboot.

### Watching disk usage

```bash
df -h                    # whole disk
docker system df         # what Docker is using
```

The logging tables (`request_logs`, `error_logs`, `usage_events`, `activity_events`) grow
forever — nothing prunes them. On a busy deployment, trim them periodically:

```bash
$COMPOSE exec postgres psql -U igniteai -d igniteai -c \
  "DELETE FROM request_logs WHERE created_at < now() - interval '90 days';"
```

### Opening a database shell

```bash
$COMPOSE exec postgres psql -U igniteai -d igniteai
```

Useful commands inside: `\dt` lists tables, `\d users` describes one, `\q` quits.

---

## 17. Troubleshooting

### The site does not load at all

Work outwards from the app:

```bash
$COMPOSE ps                      # 1. are the containers running?
curl -I http://localhost         # 2. does the app answer locally?
$COMPOSE logs --tail=50 caddy    # 3. is Caddy failing?
dig +short studio.yourdomain.com # 4. does DNS point here?
```

Whichever step fails first tells you where the problem is.

### Common problems

| Symptom | Cause | Fix |
| --- | --- | --- |
| Build killed / exit 137 | Out of memory | Add swap (step 7) or use a bigger instance |
| `DATABASE_URL is not set` | `POSTGRES_PASSWORD` missing from `.env.production` | Add it and restart |
| App restarts repeatedly | It started before Postgres was ready | Usually self-heals; check `$COMPOSE logs postgres` |
| `password authentication failed` | `POSTGRES_PASSWORD` changed after the volume was created | The volume keeps the original password. Restore the old value, or delete the volume and start fresh (**destroys all data**) |
| `The pgvector extension is not available` | Not using the `pgvector/pgvector` image | Check `docker-compose.yml` — the image must be `pgvector/pgvector:pg16` |
| Upload fails with a dimension error | `EMBEDDING_DIMENSIONS` does not match the model | Fix the value, then `DROP TABLE document_chunks;` and re-upload |
| Caddy will not get a certificate | Port 80 closed, DNS not propagated, or `Caddyfile` still says `:80` | Fix, then `$COMPOSE restart caddy` |
| Password-reset emails link to `localhost` | `NEXTAUTH_URL` wrong | Set the real domain, restart |
| Reset emails never arrive | `RESEND_API_KEY` not set | The link is written to `$COMPOSE logs app` instead |
| "Encryption is not configured" in Settings | `ENCRYPTION_KEY` missing or under 16 characters | Set it, restart |
| Stored API keys stopped working | `ENCRYPTION_KEY` changed | Restore the previous value |
| OAuth returns "redirect_uri_mismatch" | Callback URL does not match `NEXTAUTH_URL` exactly | Update it at Google/GitHub, including `https://` |
| Everything returns 503 | `MAINTENANCE_MODE` still true | Remove it from `.env.production`, restart |

### Starting completely over

This **permanently deletes all data**:

```bash
$COMPOSE down -v      # -v also removes the volumes
$COMPOSE up -d --build
```

---

## 18. Security checklist

Before you let real users in:

- [ ] SSH is restricted to your IP, key-based only
- [ ] Ports **3000 and 5432 are not open** in the security group
- [ ] The site is on HTTPS with a real domain
- [ ] `NEXTAUTH_SECRET`, `ENCRYPTION_KEY` and `POSTGRES_PASSWORD` are all separate
      `openssl rand -base64 32` values, never the examples from `.env.example`
- [ ] `ENCRYPTION_KEY` is backed up somewhere other than this server
- [ ] `.env.production` is `chmod 600` and is not committed to git
- [ ] Backups run nightly, are copied off the server, and you have **tested a restore**
- [ ] Docker log rotation is configured
- [ ] Unattended security updates are on:
      `sudo apt-get install -y unattended-upgrades && sudo dpkg-reconfigure -plow unattended-upgrades`
