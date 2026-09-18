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
  /**
   * The model that will actually answer, when a provider may fall back to a
   * different one. Used as the embedding-cache key, so a fallback with a
   * different output width cannot be served under the primary's key.
   */
  resolvedModel?(): Promise<string>;
}

// --- Gemini -----------------------------------------------------------------

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// text-embedding-004 is the current stable, free, universally-available Gemini
// embedding model on v1beta. gemini-embedding-001 requires specific enablement
// and 404s on many free keys, so it's the secondary fallback (override the
// primary with GEMINI_EMBED_MODEL if your key has a newer model enabled).
const GEMINI_PRIMARY_MODEL = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';
const GEMINI_FALLBACK_MODEL = 'gemini-embedding-001';

/**
 * Width requested from Gemini.
 *
 * text-embedding-004 returns 768. gemini-embedding-001 returns 3072 by
 * default, which is unusable here: pgvector's HNSW index refuses any column
 * wider than 2000 dimensions, so those vectors could not be indexed. The newer
 * model supports `outputDimensionality` (its embeddings are Matryoshka, so a
 * prefix is a valid smaller embedding), and asking for 768 makes both models
 * produce the same width — which also removes the "width changed under you"
 * failure entirely.
 */
const GEMINI_OUTPUT_DIMENSIONS = Number(process.env.GEMINI_EMBED_DIMENSIONS || '') || 768;

/**
 * Scales a vector to unit length. Google recommends this when
 * outputDimensionality is below the model's native width, because only the
 * full-width vector is normalised already. Cosine distance is scale-invariant
 * so ranking is unaffected, but stored vectors stay comparable either way.
 */
function normalize(vector: number[]): number[] {
  let sumSquares = 0;
  for (const v of vector) sumSquares += v * v;
  const magnitude = Math.sqrt(sumSquares);
  if (!magnitude || !Number.isFinite(magnitude)) return vector;
  return vector.map((v) => v / magnitude);
}

async function geminiEmbedOne(apiKey: string, model: string, text: string): Promise<number[]> {
  // outputDimensionality is only honoured by the newer model; text-embedding-004
  // rejects the field, so it is sent only where it applies.
  const supportsOutputDimensions = model !== 'text-embedding-004';

  const res = await fetch(`${GEMINI_BASE}/models/${model}:embedContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      ...(supportsOutputDimensions
        ? { outputDimensionality: GEMINI_OUTPUT_DIMENSIONS }
        : {}),
    }),
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
  // Only the model's native-width output is pre-normalised.
  return supportsOutputDimensions ? normalize(values as number[]) : (values as number[]);
}

/**
 * Which Gemini embedding model this key can actually use, resolved once per
 * process by trying the primary and falling back.
 *
 * Resolving up-front matters for two reasons. The models differ in output width
 * (text-embedding-004 is 768, gemini-embedding-001 is 3072), so discovering the
 * fallback mid-batch would produce a document whose chunks have inconsistent
 * widths. And `model` is part of the embedding cache key, so reporting the
 * primary while the fallback actually answered would serve 3072-wide vectors
 * under a 768-wide key.
 */
let geminiModelPromise: Promise<string> | undefined;

async function resolveGeminiModel(apiKey: string): Promise<string> {
  if (!geminiModelPromise) {
    geminiModelPromise = (async () => {
      try {
        await geminiEmbedOne(apiKey, GEMINI_PRIMARY_MODEL, 'probe');
        return GEMINI_PRIMARY_MODEL;
      } catch {
        // Primary is not enabled for this key; the fallback is the wider model.
        await geminiEmbedOne(apiKey, GEMINI_FALLBACK_MODEL, 'probe');
        return GEMINI_FALLBACK_MODEL;
      }
    })().catch((err) => {
      geminiModelPromise = undefined;
      throw err;
    });
  }
  return geminiModelPromise;
}

function createGeminiEmbeddings(apiKey: string): EmbeddingsProvider {
  return {
    id: 'gemini',
    // Best known before probing; embed() reports the resolved one via the cache
    // key it passes upward.
    model: GEMINI_PRIMARY_MODEL,
    async embed(texts: string[]): Promise<number[][]> {
      const model = await resolveGeminiModel(apiKey);
      const out: number[][] = [];
      for (const text of texts) {
        out.push(await geminiEmbedOne(apiKey, model, text));
      }
      return out;
    },
    async resolvedModel(): Promise<string> {
      return resolveGeminiModel(apiKey);
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
export async function resolveEmbeddingsProvider(userId?: string): Promise<EmbeddingsProvider> {
  const explicit = (process.env.EMBEDDINGS_PROVIDER || '').trim().toLowerCase();

  if (explicit === 'ollama') {
    return createOllamaEmbeddings();
  }
  if (!explicit && (await resolveConnectionType(userId)) === 'local') {
    return createOllamaEmbeddings();
  }

  const selected = explicit || 'gemini';

  if (selected === 'huggingface') {
    const key = await resolveKeyForProvider('huggingface', userId);
    if (!key) {
      throw new Error(
        'EMBEDDINGS_PROVIDER=huggingface but no HuggingFace key is configured. Add ' +
          'HUGGINGFACE_API_KEY (env) or a per-user HuggingFace key in Settings.'
      );
    }
    return createHuggingFaceEmbeddings(key);
  }

  // default: gemini
  const geminiKey = await resolveKeyForProvider('gemini', userId);
  if (geminiKey) return createGeminiEmbeddings(geminiKey);

  // If Gemini isn't configured but HuggingFace is, fall back automatically.
  const hfKey = await resolveKeyForProvider('huggingface', userId);
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

  const provider = await resolveEmbeddingsProvider(userId);

  // The cache key must name the model that actually answers. A provider that
  // falls back to a different model produces vectors of a different width, and
  // serving those under the primary's key corrupts every later lookup.
  const cacheModel = provider.resolvedModel ? await provider.resolvedModel() : provider.model;

  const hashes = texts.map(sha256Hex);

  let cached = new Map<string, number[]>();
  try {
    cached = await getCachedEmbeddings([...new Set(hashes)], provider.id, cacheModel);
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
      await putCachedEmbeddings(
        misses.map((m, i) => ({ hash: m.hash, vector: vectors[i] })),
        provider.id,
        cacheModel
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
export async function activeEmbeddingsProviderId(
  userId?: string
): Promise<EmbeddingsProviderId | null> {
  try {
    return (await resolveEmbeddingsProvider(userId)).id;
  } catch {
    return null;
  }
}
