# Spec — Local AI (Ollama) & Token Efficiency

## User stories
- As a user, I run IgniteAI fully offline against a local Ollama server — chat and embeddings — with no API key.
- As a user, I choose a Connection Type: **Cloud API** (key-based), **Local** (Ollama only), or **Auto** (prefer local when detected, fall back to cloud).
- As a user, I see whether Ollama is reachable and which local models are installed in the Provider Health panel.
- As a user, I watch a live token counter in chat so I don't blow through free-tier quotas.

## Local provider
- `lib/ai/providers/ollama.ts` implements the same `AIProvider` interface as every cloud provider — switching is seamless in the UI and streaming uses the same SSE path.
- Env: `OLLAMA_BASE_URL` (default `http://localhost:11434`; in Docker `http://host.docker.internal:11434` — compose adds the `host-gateway` extra host), `OLLAMA_MODEL` (default `llama3.2`), `OLLAMA_EMBEDDING_MODEL` (default `nomic-embed-text`).
- Connection type: per-user preference (`user_preferences.connection_type`) overriding env `CONNECTION_TYPE`, default `cloud`. `auto` puts Ollama first in the fallback chain; an unreachable local server falls through to cloud providers automatically.
- Local embeddings: `EMBEDDINGS_PROVIDER=ollama`, and `local` connection type defaults embeddings to Ollama so offline RAG needs zero keys.

## Token efficiency (all layers)
| Layer | Rule |
|---|---|
| Retrieval | Only top-k (5) chunks injected, each capped ~1200 chars — never whole documents. |
| History | Last 8 messages verbatim; older history compressed into a rolling per-thread summary (`thread_summaries`), regenerated only when messages age out of the window. |
| Embeddings | `embedding_cache` (sha256 of chunk text + provider + model) — a chunk is never re-embedded. |
| Tool output | GitHub files/lists truncated (≤4000 chars) before re-entering the prompt; observations ≤3000 chars. |
| Model routing | Internal small calls (intent classification, clarification check, history summarization) use `lightModelFor(provider)` — the provider's cheapest capable model; the main answer uses the full model. |
| Visibility | Live per-session token counter in the chat header (from SSE `done` events); per-provider totals in Observability. |
| Development | Prefer Local/Auto connection type while iterating to conserve cloud quota. |

## Acceptance criteria
- [ ] With Ollama running and Connection Type = Local, chat + ingestion + grounded answers work with **no** API key configured.
- [ ] Auto mode: local answers when Ollama is up; transparent cloud fallback when it is not.
- [ ] Provider Health shows Ollama reachability + installed model list.
- [ ] Re-ingesting the same document performs zero new embedding calls (cache hits).
- [ ] Token counter increments after every exchange.
