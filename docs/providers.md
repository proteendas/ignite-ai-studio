# AI providers

IgniteAI Studio is provider-agnostic. Chat and embeddings are separate adapters, because several
excellent chat providers (Groq among them) have no embeddings endpoint at all.

## Chat providers

Twelve cloud providers plus Ollama. Selection is handled by
[`lib/ai/providerAdapter.ts`](../lib/ai/providerAdapter.ts).

| Id | Env key | Extra config | Notes |
| --- | --- | --- | --- |
| `groq` | `GROQ_API_KEY` | — | Default. Free tier, very fast. No embeddings. |
| `openai` | `OPENAI_API_KEY` | — | Chat and embeddings. |
| `azure-openai` | `AZURE_OPENAI_API_KEY` | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_CHAT_DEPLOYMENT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Deployment names, not model names. |
| `mistral` | `MISTRAL_API_KEY` | — | |
| `cerebras` | `CEREBRAS_API_KEY` | — | Very fast inference. |
| `openrouter` | `OPENROUTER_API_KEY` | — | Gateway to many models. |
| `together` | `TOGETHER_API_KEY` | — | |
| `github-models` | `GITHUB_MODELS_TOKEN` | — | Free with a GitHub account. |
| `gemini` | `GOOGLE_GEMINI_API_KEY` | `GEMINI_CHAT_MODEL` (default `gemini-2.5-flash`) | Chat and embeddings; generous free tier. |
| `cohere` | `COHERE_API_KEY` | — | Chat and embeddings. |
| `huggingface` | `HUGGINGFACE_API_KEY` | `HUGGINGFACE_CHAT_MODEL` | Chat and embeddings. |
| `cloudflare-workers-ai` | `CLOUDFLARE_WORKERS_AI_TOKEN` | `CLOUDFLARE_ACCOUNT_ID` | |
| `ollama` | *(no key)* | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Local, offline. |

Most cloud providers speak the OpenAI-compatible protocol and share
[`providers/openaiCompatible.ts`](../lib/ai/providers/openaiCompatible.ts). Gemini, Cohere,
HuggingFace, Cloudflare and Ollama have their own modules.

## How the model is chosen

**Models are discovered from your API key, not hardcoded.** On first use the app
calls the provider's `/models` endpoint, filters out anything that is not a chat
completions model (embeddings, whisper, TTS, moderation, guard, rerank, image
models), and ranks what is left — preferring instruction-tuned, larger and newer
ids for general chat, and small/fast ones for internal calls like intent
classification.

This exists because model ids are not stable. Providers retire them on their own
schedule — Groq withdrawing `llama-3.3-70b-versatile` is what prompted it — and a
pinned default eventually 404s with no recovery short of editing code. Two keys
for the same provider can also have access to different models.

Resolution order:

1. **`<PROVIDER>_CHAT_MODEL`** if set (`GROQ_CHAT_MODEL`, `OPENAI_CHAT_MODEL`, …).
   An explicit choice always wins.
2. **Discovery** from the key, cached for an hour per process. The TTL means a
   newly released model is picked up without a redeploy.
3. **A built-in fallback**, used only when the provider refuses to list models.

If a request still hits a retired model, the cache is dropped and the error names
both the env var to set *and* the models the key can actually use — so the fix is
visible from the error alone.

See [`lib/ai/modelDiscovery.ts`](../lib/ai/modelDiscovery.ts).

## How a provider is chosen

1. **Resolve effective keys.** [`keyResolver.ts`](../lib/ai/keyResolver.ts) builds a map of
   provider → key, where a user's own encrypted key **overrides** the env key for that user.
   Only the primary key is user-overridable; extra config (Azure endpoint, Cloudflare account
   id) always comes from env.
2. **Build candidates from `CONNECTION_TYPE`:**
   - `cloud` → configured cloud providers, in priority order
   - `local` → Ollama only
   - `auto` → Ollama first, then cloud
3. **Honour the requested provider** — `AI_PROVIDER`, or the user's default from Settings —
   if it is configured. Otherwise it is skipped, not an error.
4. **Fall back in a fixed priority order:**

   `groq → openai → azure-openai → mistral → cerebras → openrouter → together → github-models →
   gemini → cohere → huggingface → cloudflare-workers-ai`

5. **Fail over on error.** If the chosen provider's call fails, the next candidate is tried.
6. **If nothing is configured**, requests return **503** with a message naming what to set.

A provider counts as configured only when its key *and* any extra required config are present —
an `AZURE_OPENAI_API_KEY` with no endpoint is correctly treated as unconfigured.

## Bring-your-own key

Users add their own keys in Settings. Each is encrypted with AES-256-GCM
([`lib/crypto.ts`](../lib/crypto.ts)) before storage; only ciphertext, IV, auth tag and a short
display preview are kept. A user's key takes precedence over the server's for that user's
requests.

This requires `ENCRYPTION_KEY` (min 16 chars). Without it the key manager reports encryption
unconfigured and refuses to store anything, rather than storing plaintext.

**Rotating `ENCRYPTION_KEY` invalidates every stored key and connection.** That is intended:
existing ciphertext becomes undecryptable and users re-enter their keys.

## Embeddings

Configured independently with `EMBEDDINGS_PROVIDER`
([`embeddingsAdapter.ts`](../lib/ai/embeddingsAdapter.ts)).

| Value | Key | Notes |
| --- | --- | --- |
| `gemini` *(default)* | `GOOGLE_GEMINI_API_KEY` | Free tier, strong multilingual, large context. |
| `huggingface` | `HUGGINGFACE_API_KEY` | `HUGGINGFACE_EMBEDDING_MODEL`, default `sentence-transformers/all-MiniLM-L6-v2`. |
| `openai` | `OPENAI_API_KEY` | |
| `azure-openai` | `AZURE_OPENAI_API_KEY` | Needs `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`. |
| `cohere` | `COHERE_API_KEY` | |
| `ollama` | *(none)* | `OLLAMA_EMBEDDING_MODEL`, default `nomic-embed-text`. Fully offline. |

With `CONNECTION_TYPE=local` and no explicit setting, embeddings default to Ollama so local mode
needs no API key anywhere. `CONNECTION_TYPE=auto` keeps the cloud default unless you set
`EMBEDDINGS_PROVIDER=ollama` explicitly.

> **Changing the embeddings provider or model invalidates existing vectors.** Embeddings from
> different models occupy different spaces and are not comparable — similarity scores against
> old chunks become meaningless. **Re-ingest every document after switching.**
>
> With pgvector there is a second step: `EMBEDDING_DIMENSIONS` must match the new model's output
> width, and `VECTOR(n)` is fixed at table creation. So the full procedure is: update
> `EMBEDDING_DIMENSIONS`, run `DROP TABLE document_chunks;`, then re-ingest. The app recreates
> the table at the new width on the next request.
>
> | Model | Dimensions |
> | --- | --- |
> | Gemini *(default)* | 768 |
> | `all-MiniLM-L6-v2` | 384 |
> | `text-embedding-3-small` | 1536 |
> | `text-embedding-3-large` | 3072 |
> | `nomic-embed-text` | 768 |

An embedding cache keyed by `sha256(text) + provider + model` means identical text is never
embedded twice for the same configuration.

## Adding a provider

1. **Write the client** in `lib/ai/providers/`. If it is OpenAI-compatible, reuse
   `openaiCompatible.ts` and supply the base URL and default model — that is usually a few lines.
2. **Add the id** to the `ProviderId` union in `providerAdapter.ts`.
3. **Map its env key** in `PROVIDER_ENV_KEY` in `keyResolver.ts`. The record is total over
   `ProviderId`, so TypeScript will tell you if you forget.
4. **Handle it** in `isConfigured()` (including any extra config it needs) and `buildProvider()`.
5. **Insert it** into `PRIORITY_ORDER` at the right place.
6. **Add it to the UI lists** — `PROVIDER_IDS` appears in both
   [`ApiKeyManager.tsx`](../components/settings/ApiKeyManager.tsx) and
   [`PreferencesForm.tsx`](../components/settings/PreferencesForm.tsx).
7. **Document it** in [`.env.example`](../.env.example) and in
   [configuration](./configuration.md).

For embeddings support, also extend `embeddingsAdapter.ts`.

## Provider health

`GET /api/provider-health` reports, per provider, whether it is configured, whether the key came
from the user or the environment, and whether it is reachable. The Settings page surfaces this.
