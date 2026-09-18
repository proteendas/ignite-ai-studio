# Getting started

## Prerequisites

| Requirement | Notes |
| --- | --- |
| Docker + Docker Compose | The supported path. Nothing else needs installing. |
| Node.js 20 LTS | Only for the manual, non-Docker setup. |
| An AI provider key **or** Ollama | At least one. See [providers](./providers.md). |

> **Node version note.** `better-sqlite3` 11.3.0 compiles a native binding. On very new Node
> releases (24+) no prebuilt binary exists and `npm install` falls back to `node-gyp`, which can
> fail. Use Node 20 LTS for local development, or run under Docker where the version is pinned.
> To install dependencies for typechecking only, `npm install --ignore-scripts` skips the native
> build.

## Quick start with Docker

1. **Create your environment file.**

   ```bash
   cp .env.example .env
   ```

   Docker Compose reads a plain `.env` from the project root. For manual setup use `.env.local`
   instead. Both are gitignored.

2. **Set the required values.** At minimum:

   ```bash
   # A chat provider — Groq is free and fast
   GROQ_API_KEY=gsk_...

   # Embeddings run through a separate adapter; Groq has no embeddings endpoint
   EMBEDDINGS_PROVIDER=gemini
   GOOGLE_GEMINI_API_KEY=...

   # Both must be strong random values
   NEXTAUTH_SECRET=...
   ENCRYPTION_KEY=...
   ```

   Generate the two secrets:

   ```bash
   openssl rand -base64 32   # run twice, once for each
   ```

   `ENCRYPTION_KEY` must be at least 16 characters. **Rotating it invalidates every stored
   provider key**, which then has to be re-entered — that is deliberate, not a bug.

3. **Start it.**

   ```bash
   docker compose up -d --build
   ```

   This brings up the Next.js app on <http://localhost:3000> and a Chroma vector store on port
   8000.

4. **Create an account** at <http://localhost:3000/login>, then follow the onboarding tour.

### Development mode with hot reload

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Production mode

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

This keeps the app and Chroma internal and puts Caddy in front as the only public entrypoint.
See the [EC2 deployment guide](./deployment/ec2-docker.md).

## Manual setup without Docker

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`, then run Chroma yourself and point the app at it:

```bash
docker run -p 8000:8000 chromadb/chroma
```

Set `CHROMA_URL=http://localhost:8000` and `SQLITE_PATH=./data/app.db` (the Docker defaults
assume container paths), then:

```bash
npm run dev
```

## Fully offline with Ollama

No API key, and nothing leaves your machine:

```bash
ollama serve
ollama pull llama3.2
ollama pull nomic-embed-text
```

In your env file:

```bash
CONNECTION_TYPE=local
OLLAMA_BASE_URL=http://localhost:11434   # http://host.docker.internal:11434 from Docker
OLLAMA_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
EMBEDDINGS_PROVIDER=ollama
```

`CONNECTION_TYPE=local` switches embeddings to Ollama automatically. `CONNECTION_TYPE=auto`
prefers local when reachable but keeps the cloud embeddings default unless you set
`EMBEDDINGS_PROVIDER=ollama` explicitly.

## First run walkthrough

1. **Register** at `/login`. The first account is created with credentials auth.
2. **Upload a document** at `/documents` — PDF, DOCX, TXT or Markdown. It shows as *processing*
   while text is extracted, chunked and embedded, then flips to *ready*.
3. **Chat** at `/chat` in Grounded mode. Answers cite the passages they came from; open the
   Sources panel to see the exact chunks and similarity scores.
4. **Generate content** at `/content-generator` — pick the document, a content type, a tone and
   one or more channels.
5. **Review usage** at `/dashboard` and `/observability`.

Chatting with a document is blocked until its ingestion finishes, so an answer is never built on
a half-indexed file.

## Verifying a change

```bash
npm run typecheck    # tsc --noEmit
npm run build        # full production build
```

There is no test suite in the repo; the build and typecheck are the gate.

## Common problems

| Symptom | Cause and fix |
| --- | --- |
| `Encryption is not configured` in Settings | `ENCRYPTION_KEY` unset or under 16 chars. Set it and restart. |
| Ingestion fails immediately | Chroma unreachable. Check `CHROMA_URL` and that the container is up. |
| `No provider configured` (503) | No provider key present, and no reachable Ollama. See [providers](./providers.md). |
| Scanned PDF ingests with zero chunks | The file has no text layer. OCR it first; the app does not do OCR. |
| Password reset link never arrives | `RESEND_API_KEY` unset. The link is written to the server log instead — see [configuration](./configuration.md#email). |
| `npm install` fails building better-sqlite3 | Node too new. Use Node 20 LTS, or `--ignore-scripts` if you only need to typecheck. |
