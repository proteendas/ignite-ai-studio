import { createHash } from 'node:crypto';
import { resolveKeyForProvider } from './keyResolver';
import { resolveConnectionType } from './providerAdapter';
import { createOllamaProvider, ollamaEmbeddingModel } from './providers/ollama';
import { getCachedEmbeddings, putCachedEmbeddings } from '@/lib/db/sql/client';

/**
 * Embeddings adapter (C6).
 *
 * A single interface over multiple embedding backends so switching providers
 * is one env var (`EMBEDDINGS_PROVIDER`). Default: Google Gemini (generous free
 * tier, strong multilingual, large context). Fallback: Hugging Face
 * sentence-transformers (free tier). Per-user keys are preferred over env keys.
 * Local option: Ollama (`EMBEDDINGS_PROVIDER=ollama`, no API key) — also the
 * automatic default whenever the effective connection type is 'local', so
 * local mode works fully offline.
 *
 * All providers share a persistent embedding cache keyed by
 * sha256(text) + provider + model, so identical chunks are never re-embedded.
 */

export type EmbeddingsProviderId = 'gemini' | 'huggingface' | 'ollama';

export interface EmbeddingsProvider {
  id: EmbeddingsProviderId;
  model: string;
  embed(texts: string[]): Promise<number[][]>;
}

// --- Gemini -----------------------------------------------------------------

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// text-embedding-004 is the current stable, free, universally-available Gemini
// embedding model on v1beta. gemini-embedding-001 requires specific enablement
// and 404s on many free keys, so it's the secondary fallback (override the
// primary with GEMINI_EMBED_MODEL if your key has a newer model enabled).
const GEMINI_PRIMARY_MODEL = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';
const GEMINI_FALLBACK_MODEL = 'gemini-embedding-001';

async function geminiEmbedOne(apiKey: string, model: string, text: string): Promise<number[]> {
  const res = await fetch(`${GEMINI_BASE}/models/${model}:embedContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text }] } }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini embed error (${res.status}): ${body}`);
  }
  const json = await res.json();
  const values = json?.embedding?.values;
  if (!Array.isArray(values)) {
    throw new Error('Gemini embed returned an unexpected response shape.');
  }
  return values;
}

function createGeminiEmbeddings(apiKey: string): EmbeddingsProvider {
  return {
    id: 'gemini',
    model: GEMINI_PRIMARY_MODEL,
    async embed(texts: string[]): Promise<number[][]> {
      // Try the primary model; if it 404s / isn't enabled, fall back once to
      // the widely-available text-embedding-004.
      let model = GEMINI_PRIMARY_MODEL;
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i++) {
        try {
          out.push(await geminiEmbedOne(apiKey, model, texts[i]));
        } catch (err) {
          if (model === GEMINI_PRIMARY_MODEL && i === 0) {
            model = GEMINI_FALLBACK_MODEL;
            out.push(await geminiEmbedOne(apiKey, model, texts[i]));
          } else {
            throw err;
          }
        }
      }
      return out;
    },
  };
}

// --- Hugging Face -----------------------------------------------------------

const HF_MODEL = process.env.HUGGINGFACE_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2';

function createHuggingFaceEmbeddings(apiKey: string): EmbeddingsProvider {
  return {
    id: 'huggingface',
    model: HF_MODEL,
    async embed(texts: string[]): Promise<number[][]> {
      const res = await fetch(
        `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_MODEL}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: texts, options: { wait_for_model: true } }),
        }
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Hugging Face embed error (${res.status}): ${body}`);
      }
      const json = await res.json();
      // feature-extraction returns number[][] for a batch of inputs.
      if (!Array.isArray(json) || !Array.isArray(json[0])) {
        throw new Error('Hugging Face embed returned an unexpected response shape.');
      }
      return json as number[][];
    },
  };
}

// --- Ollama (local, no API key) ----------------------------------------------

export function createOllamaEmbeddings(): EmbeddingsProvider {
  const provider = createOllamaProvider();
  return {
    id: 'ollama',
    model: ollamaEmbeddingModel(),
    embed: (texts: string[]) => provider.embed(texts),
  };
}

// --- Resolution -------------------------------------------------------------

/**
 * Resolves the embeddings provider from `EMBEDDINGS_PROVIDER` (default gemini),
 * using the user's key if present else env. Throws an actionable error when the
 * selected provider has no key configured.
 *
 * Connection type interaction: when the effective connection type is 'local'
 * and EMBEDDINGS_PROVIDER is unset, Ollama is used so local mode needs no API
 * key at all. 'auto' keeps the cloud default (gemini) unless
 * EMBEDDINGS_PROVIDER=ollama is set explicitly.
 */
export function resolveEmbeddingsProvider(userId?: string): EmbeddingsProvider {
  const explicit = (process.env.EMBEDDINGS_PROVIDER || '').trim().toLowerCase();

  if (explicit === 'ollama') {
    return createOllamaEmbeddings();
  }
  if (!explicit && resolveConnectionType(userId) === 'local') {
    return createOllamaEmbeddings();
  }

  const selected = explicit || 'gemini';

  if (selected === 'huggingface') {
    const key = resolveKeyForProvider('huggingface', userId);
    if (!key) {
      throw new Error(
        'EMBEDDINGS_PROVIDER=huggingface but no HuggingFace key is configured. Add ' +
          'HUGGINGFACE_API_KEY (env) or a per-user HuggingFace key in Settings.'
      );
    }
    return createHuggingFaceEmbeddings(key);
  }

  // default: gemini
  const geminiKey = resolveKeyForProvider('gemini', userId);
  if (geminiKey) return createGeminiEmbeddings(geminiKey);

  // If Gemini isn't configured but HuggingFace is, fall back automatically.
  const hfKey = resolveKeyForProvider('huggingface', userId);
  if (hfKey) return createHuggingFaceEmbeddings(hfKey);

  throw new Error(
    'No embeddings provider is configured. Set EMBEDDINGS_PROVIDER=gemini with ' +
      'GOOGLE_GEMINI_API_KEY (recommended, free tier), EMBEDDINGS_PROVIDER=huggingface ' +
      'with HUGGINGFACE_API_KEY, or EMBEDDINGS_PROVIDER=ollama for local embeddings ' +
      'with no API key. Keys can also be set per-user in Settings.'
  );
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Main entry point business logic calls to embed a batch of texts.
 *
 * Token efficiency: every text is content-hashed and looked up in the
 * persistent embedding cache (per provider+model) first; only cache misses are
 * sent to the provider (duplicates within the batch are embedded once), and
 * fresh vectors are written back. Input order is preserved in the result.
 */
export async function embedTexts(texts: string[], userId?: string): Promise<number[][]> {
  if (texts.length === 0) return [];

  const provider = resolveEmbeddingsProvider(userId);
  const hashes = texts.map(sha256Hex);

  let cached = new Map<string, number[]>();
  try {
    cached = getCachedEmbeddings([...new Set(hashes)], provider.id, provider.model);
  } catch {
    // A cache read failure must never block embedding — fall through and
    // embed everything.
  }

  const results: (number[] | undefined)[] = hashes.map((h) => cached.get(h));

  // Collect unique misses, preserving first-seen order.
  const misses: { hash: string; text: string }[] = [];
  const queued = new Set<string>();
  for (let i = 0; i < texts.length; i++) {
    if (!results[i] && !queued.has(hashes[i])) {
      queued.add(hashes[i]);
      misses.push({ hash: hashes[i], text: texts[i] });
    }
  }

  if (misses.length > 0) {
    const vectors = await provider.embed(misses.map((m) => m.text));
    if (vectors.length !== misses.length) {
      throw new Error(
        `Embeddings provider "${provider.id}" returned ${vectors.length} vectors for ` +
          `${misses.length} inputs.`
      );
    }

    const fresh = new Map<string, number[]>();
    misses.forEach((m, i) => fresh.set(m.hash, vectors[i]));
    try {
      putCachedEmbeddings(
        misses.map((m, i) => ({ hash: m.hash, vector: vectors[i] })),
        provider.id,
        provider.model
      );
    } catch {
      // A cache write failure must never fail the embed call itself.
    }

    for (let i = 0; i < texts.length; i++) {
      if (!results[i]) results[i] = fresh.get(hashes[i]);
    }
  }

  return results as number[][];
}

/** Which embeddings provider id is active (for status display); null if none configured. */
export function activeEmbeddingsProviderId(userId?: string): EmbeddingsProviderId | null {
  try {
    return resolveEmbeddingsProvider(userId).id;
  } catch {
    return null;
  }
}
