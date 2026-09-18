import { listUserApiKeys, getUserApiKey } from '@/lib/db/sql/client';
import { decryptSecret, isEncryptionConfigured } from '@/lib/crypto';
import type { ProviderId } from './providerAdapter';

/**
 * Maps each provider id to the env var that holds its API key. Providers that
 * need extra config beyond a single key (Azure endpoint, Cloudflare account id)
 * still read that extra config from env — only the primary key is user-overridable.
 */
export const PROVIDER_ENV_KEY: Record<ProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  'azure-openai': 'AZURE_OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  huggingface: 'HUGGINGFACE_API_KEY',
  'github-models': 'GITHUB_MODELS_TOKEN',
  'cloudflare-workers-ai': 'CLOUDFLARE_WORKERS_AI_TOKEN',
  together: 'TOGETHER_API_KEY',
  gemini: 'GOOGLE_GEMINI_API_KEY',
  // Ollama needs no API key. It maps to its base-URL env var purely so the
  // Record<ProviderId, string> type stays total; candidacy for Ollama is
  // decided by the connection type (see providerAdapter.ts), never by a key.
  ollama: 'OLLAMA_BASE_URL',
};

export type ResolvedKeys = Partial<Record<ProviderId, string>>;

/**
 * Resolves the effective API key for every provider, preferring a user's own
 * encrypted key (decrypted server-side) over the env-configured key. Returns a
 * plain map so callers never touch process.env or ciphertext directly.
 *
 * `userId` omitted (or encryption not configured) → env keys only.
 */
export async function resolveProviderKeys(userId?: string): Promise<ResolvedKeys> {
  const keys: ResolvedKeys = {};

  for (const [provider, envVar] of Object.entries(PROVIDER_ENV_KEY) as [ProviderId, string][]) {
    const envValue = process.env[envVar];
    if (envValue) keys[provider] = envValue;
  }

  if (userId && isEncryptionConfigured()) {
    for (const rec of await listUserApiKeys(userId)) {
      if (!(rec.provider in PROVIDER_ENV_KEY)) continue;
      try {
        keys[rec.provider as ProviderId] = decryptSecret({
          ciphertext: rec.ciphertext,
          iv: rec.iv,
          authTag: rec.authTag,
        });
      } catch {
        // A key that can't be decrypted (e.g. ENCRYPTION_KEY rotated) is
        // skipped; the env key (if any) remains as fallback.
      }
    }
  }

  return keys;
}

/** Resolves a single provider's effective key (user key preferred, else env). */
export async function resolveKeyForProvider(
  provider: ProviderId,
  userId?: string
): Promise<string | undefined> {
  if (userId && isEncryptionConfigured()) {
    const rec = await getUserApiKey(userId, provider);
    if (rec) {
      try {
        return decryptSecret({ ciphertext: rec.ciphertext, iv: rec.iv, authTag: rec.authTag });
      } catch {
        /* fall through to env */
      }
    }
  }
  const envVar = PROVIDER_ENV_KEY[provider];
  return envVar ? process.env[envVar] : undefined;
}
