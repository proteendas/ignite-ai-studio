import type { ChatMessage } from '@/lib/types';
import { createOpenAICompatibleProvider } from './providers/openaiCompatible';
import { createAzureOpenAIProvider } from './providers/azureOpenAI';
import { createGeminiProvider } from './providers/gemini';
import { createCohereProvider } from './providers/cohere';
import { createHuggingFaceProvider } from './providers/huggingface';
import { createCloudflareWorkersAIProvider } from './providers/cloudflareWorkersAI';
import { createOllamaProvider } from './providers/ollama';
import { resolveProviderKeys, type ResolvedKeys } from './keyResolver';
import { getUserPreferences, type ConnectionType } from '@/lib/db/sql/client';

export type { ConnectionType };

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface AIProvider {
  id: string;
  chatModel: string;
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string>;
  embed(texts: string[]): Promise<number[][]>;
}

export type ProviderId =
  | 'openai'
  | 'azure-openai'
  | 'groq'
  | 'mistral'
  | 'cohere'
  | 'cerebras'
  | 'openrouter'
  | 'huggingface'
  | 'github-models'
  | 'cloudflare-workers-ai'
  | 'together'
  | 'gemini'
  | 'ollama';

/**
 * Cloud provider priority. Ollama is intentionally NOT in this list — it is
 * added as a candidate only by connection type ('local'/'auto'), never in
 * 'cloud' mode.
 */
const PRIORITY_ORDER: ProviderId[] = [
  'groq',
  'openai',
  'azure-openai',
  'mistral',
  'cerebras',
  'openrouter',
  'together',
  'github-models',
  'gemini',
  'cohere',
  'huggingface',
  'cloudflare-workers-ai',
];

/**
 * Returns true if the given provider is configured, based on a resolved keys
 * map (user keys preferred over env; see keyResolver.ts). Providers needing
 * extra config beyond the primary key also check that extra config from env.
 */
function isConfigured(id: ProviderId, keys: ResolvedKeys): boolean {
  const hasKey = !!keys[id];
  switch (id) {
    case 'azure-openai':
      return hasKey && !!process.env.AZURE_OPENAI_ENDPOINT;
    case 'cloudflare-workers-ai':
      return hasKey && !!process.env.CLOUDFLARE_ACCOUNT_ID;
    case 'ollama':
      // Ollama needs no key; whether it is a candidate is decided by the
      // effective connection type, and reachability is checked at call time.
      return true;
    default:
      return hasKey;
  }
}

/**
 * Resolves the effective connection type: the user's stored preference when a
 * userId is given, otherwise the CONNECTION_TYPE env var, defaulting to 'cloud'.
 */
export function resolveConnectionType(userId?: string): ConnectionType {
  if (userId) {
    try {
      return getUserPreferences(userId).connectionType;
    } catch {
      // Preferences unavailable (e.g. DB not initialized) — fall through to env.
    }
  }
  const fromEnv = (process.env.CONNECTION_TYPE || '').trim().toLowerCase();
  if (fromEnv === 'cloud' || fromEnv === 'local' || fromEnv === 'auto') return fromEnv;
  return 'cloud';
}

/**
 * Constructs the AIProvider implementation for a given provider id using a
 * resolved API key. Callers must have already verified `isConfigured(id, keys)`.
 */
function buildProvider(id: ProviderId, keys: ResolvedKeys): AIProvider {
  const apiKey = keys[id] as string;
  switch (id) {
    case 'openai':
      return createOpenAICompatibleProvider({
        id: 'openai',
        apiKey,
        chatModel: 'gpt-4o-mini',
        embedModel: 'text-embedding-3-small',
      });
    case 'azure-openai':
      return createAzureOpenAIProvider();
    case 'groq':
      return createOpenAICompatibleProvider({
        id: 'groq',
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
        chatModel: 'llama-3.3-70b-versatile',
        // Groq has no embeddings endpoint — embed() will throw if called.
      });
    case 'mistral':
      return createOpenAICompatibleProvider({
        id: 'mistral',
        apiKey,
        baseURL: 'https://api.mistral.ai/v1',
        chatModel: 'mistral-small-latest',
        embedModel: 'mistral-embed',
      });
    case 'cerebras':
      return createOpenAICompatibleProvider({
        id: 'cerebras',
        apiKey,
        baseURL: 'https://api.cerebras.ai/v1',
        chatModel: 'llama3.1-8b',
      });
    case 'openrouter':
      return createOpenAICompatibleProvider({
        id: 'openrouter',
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        chatModel: 'meta-llama/llama-3.1-8b-instruct:free',
      });
    case 'together':
      return createOpenAICompatibleProvider({
        id: 'together',
        apiKey,
        baseURL: 'https://api.together.xyz/v1',
        chatModel: 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
      });
    case 'github-models':
      return createOpenAICompatibleProvider({
        id: 'github-models',
        apiKey,
        baseURL: 'https://models.inference.ai.azure.com',
        chatModel: 'gpt-4o-mini',
      });
    case 'gemini':
      return createGeminiProvider(apiKey);
    case 'cohere':
      return createCohereProvider(apiKey);
    case 'huggingface':
      return createHuggingFaceProvider(apiKey);
    case 'cloudflare-workers-ai':
      return createCloudflareWorkersAIProvider(apiKey);
    case 'ollama':
      return createOllamaProvider();
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown provider id: ${_exhaustive}`);
    }
  }
}

/**
 * Wraps a list of AIProvider factories (evaluated lazily via a getter so we
 * never construct/require an SDK client we don't need) and returns a single
 * AIProvider whose chat/chatStream/embed try each candidate in order,
 * falling through to the next on error. Throws only if every candidate
 * fails.
 */
export function withFallback(getProviders: () => AIProvider[]): AIProvider {
  const providers = getProviders();

  if (providers.length === 0) {
    throw new Error(
      'withFallback() was given no providers to try. Check your AI provider ' +
        'environment configuration (see .env.local).'
    );
  }

  const primary = providers[0];

  return {
    id: primary.id,
    chatModel: primary.chatModel,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
      let lastError: unknown;
      for (const provider of providers) {
        try {
          return await provider.chat(messages, opts);
        } catch (err) {
          lastError = err;
        }
      }
      throw new Error(
        `All AI providers failed for chat(). Last error: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`
      );
    },

    async *chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
      // Note: if a provider's stream fails *after* it has already yielded
      // some chunks to the caller, we cannot silently fall through to the
      // next provider (partial output would already be in flight). Fallback
      // only helps for failures that happen before the first chunk is
      // produced (e.g. auth errors, connection failures, bad requests).
      let lastError: unknown;
      for (const provider of providers) {
        try {
          const iterator = provider.chatStream(messages, opts)[Symbol.asyncIterator]();
          const first = await iterator.next();
          if (first.done) {
            return;
          }
          yield first.value;
          let result = await iterator.next();
          while (!result.done) {
            yield result.value;
            result = await iterator.next();
          }
          return;
        } catch (err) {
          lastError = err;
        }
      }
      throw new Error(
        `All AI providers failed for chatStream(). Last error: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`
      );
    },

    async embed(texts: string[]): Promise<number[][]> {
      let lastError: unknown;
      for (const provider of providers) {
        try {
          return await provider.embed(texts);
        } catch (err) {
          lastError = err;
        }
      }
      throw new Error(
        `All AI providers failed for embed(). Last error: ${
          lastError instanceof Error ? lastError.message : String(lastError)
        }`
      );
    },
  };
}

/**
 * Resolves the AIProvider to use for this app. If AI_PROVIDER is set in the
 * environment and that provider's required key(s) are present, it is used as
 * the primary candidate. Otherwise the priority list is walked and the first
 * configured provider becomes primary. The remaining configured providers
 * (in priority order) become fallback candidates, so any /api route that
 * calls resolveProvider() automatically gets fallback behavior.
 */
export function resolveProvider(userId?: string): AIProvider {
  const keys = resolveProviderKeys(userId);
  const connectionType = resolveConnectionType(userId);

  if (connectionType === 'local') {
    // Local mode: Ollama only. Wrap its errors so a failure at call time
    // clearly explains that local mode is selected and Ollama is unreachable.
    return withFallback(() => [localModeProvider()]);
  }

  const requested = (process.env.AI_PROVIDER || '').trim() as ProviderId | '';

  const candidateIds: ProviderId[] = [];

  if (connectionType === 'auto') {
    // Prefer local: Ollama goes first; withFallback moves past it to the
    // cloud candidates below if the server is not reachable at call time.
    candidateIds.push('ollama');
  }

  if (requested && PRIORITY_ORDER.includes(requested) && isConfigured(requested, keys)) {
    candidateIds.push(requested);
  }

  for (const id of PRIORITY_ORDER) {
    if (!candidateIds.includes(id) && isConfigured(id, keys)) {
      candidateIds.push(id);
    }
  }

  if (candidateIds.length === 0) {
    throw new Error(
      'No AI provider is configured. Set AI_PROVIDER and the matching API key (in .env, or ' +
        'per-user in Settings), or set any supported provider key (e.g. GROQ_API_KEY, ' +
        'OPENAI_API_KEY, MISTRAL_API_KEY, ...). Alternatively, run Ollama locally and set ' +
        'the connection type to "local" or "auto" — no API key needed.'
    );
  }

  return withFallback(() => candidateIds.map((id) => buildProvider(id, keys)));
}

/**
 * Ollama wrapped with local-mode error context: when the user has explicitly
 * selected connection type 'local' there is no cloud fallback, so failures
 * must say exactly why chat is down and how to fix it.
 */
function localModeProvider(): AIProvider {
  const inner = createOllamaProvider();
  const contextualize = (err: unknown): Error =>
    new Error(
      `Connection type is set to "local" but the local Ollama server failed: ${
        err instanceof Error ? err.message : String(err)
      } Switch the connection type to "cloud" or "auto" in Settings to use a cloud provider instead.`
    );

  return {
    id: inner.id,
    chatModel: inner.chatModel,
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
      try {
        return await inner.chat(messages, opts);
      } catch (err) {
        throw contextualize(err);
      }
    },
    async *chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
      try {
        yield* inner.chatStream(messages, opts);
      } catch (err) {
        throw contextualize(err);
      }
    },
    async embed(texts: string[]): Promise<number[][]> {
      try {
        return await inner.embed(texts);
      } catch (err) {
        throw contextualize(err);
      }
    },
  };
}

/**
 * A cheaper/faster model per provider for small internal calls
 * (classification, query rewriting, summarization). Returns undefined when
 * the provider has no obvious light tier — callers should then use the
 * provider's default chat model.
 */
export function lightModelFor(id: string): string | undefined {
  switch (id) {
    case 'groq':
      return 'llama-3.1-8b-instant';
    case 'openai':
      return 'gpt-4o-mini';
    case 'gemini':
      // Deliberately no override: Gemini free-tier quota is per model and
      // varies by key, so pinning a "light" model here can hit a model with
      // zero quota. The provider's own model-fallback chain (404/429-aware)
      // picks the cheapest working model instead.
      return undefined;
    case 'mistral':
      return 'mistral-small-latest';
    case 'openrouter':
      return 'meta-llama/llama-3.1-8b-instruct:free';
    case 'ollama':
      return process.env.OLLAMA_MODEL || 'llama3.2';
    default:
      return undefined;
  }
}

/**
 * Lists which providers are currently configured (user keys preferred over
 * env), for the provider-health panel. Does not construct clients.
 */
export function listConfiguredProviders(userId?: string): {
  id: ProviderId;
  source: 'user' | 'env';
}[] {
  const envKeys = resolveProviderKeys(undefined);
  const allKeys = resolveProviderKeys(userId);
  const connectionType = resolveConnectionType(userId);

  const cloud: { id: ProviderId; source: 'user' | 'env' }[] = PRIORITY_ORDER.filter((id) =>
    isConfigured(id, allKeys)
  ).map((id) => ({
    id,
    // If the key exists with a userId but not without, it came from the user.
    source: allKeys[id] && !envKeys[id] ? 'user' : 'env',
  }));

  // Ollama is a candidate (listed first) whenever the effective connection
  // type is 'local' or 'auto'; in 'cloud' mode it is never a candidate.
  if (connectionType === 'local') return [{ id: 'ollama', source: 'env' }];
  if (connectionType === 'auto') return [{ id: 'ollama', source: 'env' }, ...cloud];
  return cloud;
}
