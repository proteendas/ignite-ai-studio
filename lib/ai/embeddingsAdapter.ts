import { resolveKeyForProvider } from './keyResolver';

/**
 * Embeddings adapter (C6).
 *
 * A single interface over multiple embedding backends so switching providers
 * is one env var (`EMBEDDINGS_PROVIDER`). Default: Google Gemini (generous free
 * tier, strong multilingual, large context). Fallback: Hugging Face
 * sentence-transformers (free tier). Per-user keys are preferred over env keys.
 */

export type EmbeddingsProviderId = 'gemini' | 'huggingface';

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

// --- Resolution -------------------------------------------------------------

/**
 * Resolves the embeddings provider from `EMBEDDINGS_PROVIDER` (default gemini),
 * using the user's key if present else env. Throws an actionable error when the
 * selected provider has no key configured.
 */
export function resolveEmbeddingsProvider(userId?: string): EmbeddingsProvider {
  const selected = (process.env.EMBEDDINGS_PROVIDER || 'gemini').trim().toLowerCase();

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
      'GOOGLE_GEMINI_API_KEY (recommended, free tier), or EMBEDDINGS_PROVIDER=huggingface ' +
      'with HUGGINGFACE_API_KEY. Keys can also be set per-user in Settings.'
  );
}

/** Main entry point business logic calls to embed a batch of texts. */
export async function embedTexts(texts: string[], userId?: string): Promise<number[][]> {
  return resolveEmbeddingsProvider(userId).embed(texts);
}

/** Which embeddings provider id is active (for status display); null if none configured. */
export function activeEmbeddingsProviderId(userId?: string): EmbeddingsProviderId | null {
  try {
    return resolveEmbeddingsProvider(userId).id;
  } catch {
    return null;
  }
}
