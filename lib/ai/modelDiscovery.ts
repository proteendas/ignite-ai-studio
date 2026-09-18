import type OpenAI from 'openai';

/**
 * Picks a provider's chat models by asking the provider what the API key can
 * actually use, rather than hardcoding ids.
 *
 * Model ids are not stable. Providers retire them on their own schedule — Groq
 * withdrawing `llama-3.3-70b-versatile` is what prompted this — and a pinned
 * default eventually 404s with no recovery short of editing code and
 * redeploying. Accounts also differ: two keys for the same provider may have
 * access to different models.
 *
 * Resolution order: an explicit env override, then discovery, then the built-in
 * fallback if the provider refuses to list.
 */

export interface DiscoveredModels {
  /** Best general-purpose chat model. */
  primary: string;
  /** Cheapest/fastest usable model, for classification and summarisation. */
  light: string;
}

/**
 * Model ids that are not chat completions endpoints. Sending a chat request to
 * one of these fails, so they are excluded before ranking.
 */
const NOT_CHAT =
  /(embed|embedding|whisper|tts|text-to-speech|speech|audio|transcri|moderat|guard|rerank|clip|diffusion|flux|dall-?e|image|vision-only|ocr|bge-|safety|sora|veo|imagen)/i;

/** Ids that work but should not be preferred when something stabler exists. */
const DEPRIORITISED = /(preview|experimental|alpha|beta|nightly|deprecated|legacy|-exp\b)/i;

/** Parameter count in billions, parsed from ids like "llama-3.1-70b-versatile". */
function parseSizeB(id: string): number | null {
  const m = id.match(/(\d+(?:\.\d+)?)\s*b(?![a-z0-9])/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Family version from the id, so llama-3.3 ranks above llama-3.1.
 *
 * Parameter counts ("70b") and context lengths ("8192", "128k") are stripped
 * first, and anything above 10 is ignored: without that, "llama3-70b-8192"
 * reads as version 70 and outranks genuinely newer models.
 */
function parseVersion(id: string): number {
  const cleaned = id
    .replace(/\d+(?:\.\d+)?\s*b(?![a-z0-9])/gi, ' ')  // parameter counts
    .replace(/\d+\s*k(?![a-z0-9])/gi, ' ')             // context windows, "128k"
    .replace(/\d{3,}/g, ' ');                          // context windows, "8192"

  const matches = cleaned.match(/(\d+(?:\.\d+)?)/g);
  if (!matches) return 0;
  const versions = matches.map(Number).filter((n) => Number.isFinite(n) && n <= 10);
  return versions.length ? Math.max(...versions) : 0;
}

function isChatCapable(id: string): boolean {
  return !NOT_CHAT.test(id);
}

/**
 * Scores a model for general-purpose chat. Bigger and newer is better;
 * instruction-tuned is strongly preferred, since base models follow
 * instructions poorly and every prompt in this app is instruction-shaped.
 */
function scoreForPrimary(id: string): number {
  let score = 0;
  const size = parseSizeB(id);

  if (size !== null) {
    // Diminishing returns, and very large models are slower and pricier; the
    // sweet spot for this workload is mid-size.
    score += Math.min(size, 120) * 0.8;
  } else {
    // No size in the id is typical of hosted flagships (gpt-4o-mini, etc.).
    score += 40;
  }

  if (/instruct|-it\b|chat|versatile/i.test(id)) score += 30;
  if (/mini|small|nano|tiny|lite/i.test(id)) score -= 15;
  if (DEPRIORITISED.test(id)) score -= 60;

  score += parseVersion(id) * 2;
  return score;
}

/** Scores a model for cheap internal calls: smaller and faster wins. */
function scoreForLight(id: string): number {
  let score = 0;
  const size = parseSizeB(id);

  if (size !== null) score += Math.max(0, 100 - size);
  else score += 50;

  if (/instant|mini|small|fast|lite|flash|turbo|nano/i.test(id)) score += 40;
  if (/instruct|-it\b|chat/i.test(id)) score += 15;
  if (DEPRIORITISED.test(id)) score -= 60;
  return score;
}

/** Ranks a raw id list into a primary/light pair. Exported for testing. */
export function rankModels(ids: string[]): DiscoveredModels | null {
  const candidates = ids.filter(isChatCapable);
  if (candidates.length === 0) return null;

  const primary = [...candidates].sort((a, b) => scoreForPrimary(b) - scoreForPrimary(a))[0];
  const light = [...candidates].sort((a, b) => scoreForLight(b) - scoreForLight(a))[0];
  return { primary, light: light ?? primary };
}

// ---------------------------------------------------------------------------
// Caching
//
// Discovery costs one HTTP round-trip, so the result is memoised per provider
// on globalThis — surviving hot reload in dev and warm containers in
// production. The TTL means a newly-released model is picked up without a
// redeploy, and a retired one stops being used within the hour.
// ---------------------------------------------------------------------------

const CACHE_SYMBOL = Symbol.for('igniteai-studio.model-discovery');
const TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  models: DiscoveredModels;
  at: number;
}

const globalForCache = globalThis as unknown as {
  [CACHE_SYMBOL]?: Map<string, CacheEntry>;
};

function cache(): Map<string, CacheEntry> {
  if (!globalForCache[CACHE_SYMBOL]) globalForCache[CACHE_SYMBOL] = new Map();
  return globalForCache[CACHE_SYMBOL]!;
}

/** `<PROVIDER>_CHAT_MODEL`, e.g. GROQ_CHAT_MODEL. */
export function chatModelEnvVar(providerId: string): string {
  return `${providerId.toUpperCase().replace(/-/g, '_')}_CHAT_MODEL`;
}

/**
 * Resolves the models to use for a provider.
 *
 * `fallback` is only reached when the provider will not list models — it is a
 * last resort, not the normal path.
 */
export async function resolveModels(
  client: Pick<OpenAI, 'models'>,
  providerId: string,
  fallback: string
): Promise<DiscoveredModels> {
  // 1. An explicit override always wins; the operator has decided.
  const override = process.env[chatModelEnvVar(providerId)]?.trim();
  if (override) return { primary: override, light: override };

  // 2. A warm, unexpired discovery.
  const hit = cache().get(providerId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.models;

  // 3. Ask the provider what this key can use.
  try {
    const list = await client.models.list();
    const ids = list.data.map((m) => m.id).filter((id): id is string => Boolean(id));
    const ranked = rankModels(ids);
    if (ranked) {
      cache().set(providerId, { models: ranked, at: Date.now() });
      return ranked;
    }
  } catch {
    // Some providers refuse /models, or the key lacks permission for it.
    // Falling back is better than failing the user's request outright.
  }

  return { primary: fallback, light: fallback };
}

/** Drops the cached discovery, so the next call re-queries the provider. */
export function invalidateModelCache(providerId?: string): void {
  if (providerId) cache().delete(providerId);
  else cache().clear();
}
