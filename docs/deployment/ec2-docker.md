# Deploying to a single EC2 instance

The whole stack — app, vector store and TLS terminator — on one box with Docker Compose. This
is the closest match to how the repo is built and the recommended production path.

## Why a single box

The app uses `better-sqlite3`, a file-backed database, and an in-memory rate limiter. Both
assume **one instance with a real, persistent filesystem**. A single VM gives exactly that, with
no code changes. See the [deployment overview](./README.md) for the trade-offs.

## Instance sizing

| Workload | Instance | Storage |
| --- | --- | --- |
| Evaluation, few users | `t3.small` (2 vCPU / 2 GB) | 20 GB gp3 |
| Small production | `t3.medium` (2 vCPU / 4 GB) | 30 GB gp3 |
| Heavy ingestion | `t3.large` (2 vCPU / 8 GB) | 50 GB gp3 |

**`t2.micro` / `t3.micro` (1 GB) is not enough.** Chroma plus a Next.js build will exhaust it —
the build is the spike. If you must use a free-tier micro instance, build the image elsewhere
and pull it rather than building on the box.

AMI: Ubuntu 22.04 LTS or Amazon Linux 2023. Commands below are for Ubuntu.

## Security group

| Type | Port | Source | Why |
| --- | --- | --- | --- |
| SSH | 22 | **Your IP only** | Administration |
| HTTP | 80 | 0.0.0.0/0 | Caddy, and ACME HTTP-01 challenges |
| HTTPS | 443 | 0.0.0.0/0 | Caddy |

**Do not open 3000 or 8000.** The production overlay keeps the app and Chroma off public ports;
opening them defeats that. **Chroma has no authentication** — exposing it publicly exposes every
document chunk in the system.

## 1. Install Docker

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

Log out and back in for the group change, then check:

```bash
docker compose version
```

## 2. Add swap

A `t3.small` can run out of memory during `next build`. Swap turns a hard failure into a slow
build:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Get the code

```bash
sudo apt-get install -y git
git clone <your-repo-url> /opt/igniteai
cd /opt/igniteai
```

## 4. Configure

The production overlay reads **`.env.production`**, not `.env`:

```bash
cp .env.example .env.production
chmod 600 .env.production
nano .env.production
```

Set at minimum:

```bash
# Public URL — MUST be correct, or password-reset links point at localhost
NEXTAUTH_URL=https://studio.example.com

NEXTAUTH_SECRET=<openssl rand -base64 32>
ENCRYPTION_KEY=<openssl rand -base64 32>

GROQ_API_KEY=gsk_...
EMBEDDINGS_PROVIDER=gemini
GOOGLE_GEMINI_API_KEY=...

# Email — without these, reset links only reach the server log
RESEND_API_KEY=re_...
EMAIL_FROM="IgniteAI Studio <noreply@example.com>"

# Set by the overlay; leave them alone
CHROMA_URL=http://chroma:8000
SQLITE_PATH=/app/data/app.db
```

Generate each secret separately:

```bash
openssl rand -base64 32
```

> **`ENCRYPTION_KEY` is not rotatable in place.** Changing it makes every stored provider key and
> connection undecryptable, and users must re-enter them. Decide it once, and back it up
> somewhere you will still have in a year.

## 5. TLS and your domain

The shipped [`Caddyfile`](../../Caddyfile) serves plain **HTTP on :80**, because Let's Encrypt
cannot issue a certificate for an `*.amazonaws.com` hostname you do not control.

**If you have a domain**, point an A record at the instance's Elastic IP, then edit the
`Caddyfile`:

```caddy
studio.example.com {
	reverse_proxy app:3000
	encode gzip
}
```

That is the only change needed — Caddy obtains and renews the certificate automatically over
HTTP-01, which is why port 80 must stay open even for an HTTPS-only site.

**Use an Elastic IP.** A stopped instance otherwise gets a new public IP and your DNS breaks.

> Running without a domain means running over plain HTTP: session cookies travel in the clear.
> Acceptable for a private evaluation, **not** for real accounts.

## 6. Launch

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The overlay ([`docker-compose.prod.yml`](../../docker-compose.prod.yml)):

- removes the app's published port and `expose`s 3000 internally only
- removes Chroma's published port the same way
- adds Caddy as the sole public entrypoint on 80/443
- points the app at `.env.production`

Verify:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
curl -I http://localhost      # via Caddy
```

Then open your domain and register the first account.

## 7. Data and persistence

Two named Docker volumes hold **all** state:

| Volume | Contents |
| --- | --- |
| `sqlite-data` | The SQLite database — users, document metadata, threads, keys, logs |
| `chroma-data` | The vector store — every embedded chunk |

They are **two halves of one dataset**. Restoring one without the other leaves documents whose
chunks are missing, or orphaned vectors. Always back them up together.

### Backup

```bash
#!/usr/bin/env bash
# /opt/igniteai/backup.sh
set -euo pipefail
STAMP=$(date +%F-%H%M)
DEST=/opt/backups
mkdir -p "$DEST"

docker run --rm -v igniteai_sqlite-data:/data -v "$DEST":/backup alpine \
  tar czf "/backup/sqlite-$STAMP.tar.gz" -C /data .
docker run --rm -v igniteai_chroma-data:/data -v "$DEST":/backup alpine \
  tar czf "/backup/chroma-$STAMP.tar.gz" -C /data .

find "$DEST" -name '*.tar.gz' -mtime +14 -delete
```

Check the volume names first — Compose prefixes them with the project directory name:

```bash
docker volume ls
```

Schedule it and copy off-box:

```bash
chmod +x /opt/igniteai/backup.sh
crontab -e
# 0 3 * * * /opt/igniteai/backup.sh && aws s3 sync /opt/backups s3://your-bucket/igniteai/
```

A backup you have never restored is a hypothesis. Test one.

### Restore

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker run --rm -v igniteai_sqlite-data:/data -v /opt/backups:/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/sqlite-2026-09-18-0300.tar.gz -C /data"
docker run --rm -v igniteai_chroma-data:/data -v /opt/backups:/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/chroma-2026-09-18-0300.tar.gz -C /data"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Restore matching timestamps. You also need the **same `ENCRYPTION_KEY`**, or every stored
provider key in the restored database is undecryptable.

## 8. Updating

```bash
cd /opt/igniteai
./backup.sh
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker image prune -f
```

Schema changes apply automatically on startup: `schema.sql` is idempotent and
`migrateExistingTables()` adds new columns behind a `PRAGMA` guard. No manual migration step.

### Maintenance mode

For an update with visible downtime, set `MAINTENANCE_MODE=true` in `.env.production` and
restart. Every page serves `/maintenance` and every API route returns 503. Unset it afterwards.

## 9. Operating

**Logs**

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy
```

Cap log growth in `/etc/docker/daemon.json`:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }
```

then `sudo systemctl restart docker`.

**Restart on boot** — every service declares `restart: unless-stopped`, and Docker's systemd
unit is enabled by default, so the stack returns after a reboot.

**Disk** — `docker system df`, and watch the telemetry tables: `usage_events`, `request_logs`,
`error_logs` and `activity_events` grow without bound and ship with no retention job.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Build killed / OOM | Not enough RAM. Add swap (step 2) or use a larger instance. |
| `410 Gone` from Chroma | The image was bumped past 0.5.23. The `chromadb@1.9.2` client speaks `/api/v1`, removed in Chroma 0.6.0+. Pin it back. |
| Caddy will not get a certificate | Port 80 closed, DNS not pointing at the instance yet, or the `Caddyfile` still says `:80` instead of your domain. |
| Reset emails contain `localhost` links | `NEXTAUTH_URL` is wrong in `.env.production`. |
| "Encryption is not configured" | `ENCRYPTION_KEY` missing or under 16 characters. |
| Stored keys stopped working | `ENCRYPTION_KEY` changed. Restore the old value, or have users re-enter their keys. |
| OAuth redirect mismatch | The provider's callback URL must match `NEXTAUTH_URL` exactly, including scheme. |
| 503 from every route | `MAINTENANCE_MODE` is still `true`. |

## Hardening checklist

- [ ] SSH restricted to your IP; key-based auth only
- [ ] Ports 3000 and 8000 **not** open
- [ ] `NEXTAUTH_SECRET` and `ENCRYPTION_KEY` are strong and unique
- [ ] `ENCRYPTION_KEY` backed up separately from the database
- [ ] A real domain with HTTPS, not plain HTTP
- [ ] `.env.production` is `chmod 600` and not in git
- [ ] Backups scheduled, copied off-box, and **restore-tested**
- [ ] Unattended security upgrades enabled
- [ ] Docker log rotation configured
