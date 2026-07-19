import type { AIProvider } from '../providerAdapter';
import { createOpenAICompatibleProvider } from './openaiCompatible';

const DEFAULT_CHAT_MODEL = 'meta-llama/Llama-3.2-3B-Instruct';

/**
 * Hugging Face's Inference Router exposes an OpenAI-compatible chat
 * completions endpoint, so we simply reuse createOpenAICompatibleProvider
 * pointed at it. This wrapper exists for naming consistency with the other
 * provider factories.
 */
export function createHuggingFaceProvider(apiKeyOverride?: string): AIProvider {
  const apiKey = apiKeyOverride || process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Hugging Face provider requires HUGGINGFACE_API_KEY to be set (or a per-user key). Check .env.local.'
    );
  }

  return createOpenAICompatibleProvider({
    id: 'huggingface',
    apiKey,
    baseURL: 'https://router.huggingface.co/v1',
    chatModel: process.env.HUGGINGFACE_CHAT_MODEL || DEFAULT_CHAT_MODEL,
    // No embedModel: Hugging Face's router does not expose a standard
    // OpenAI-compatible embeddings endpoint across all models. Use
    // EMBEDDING_PROVIDER to route embeddings elsewhere if needed.
  });
}
