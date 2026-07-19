import type { ChatMessage } from '@/lib/types';
import type { AIProvider, ChatOptions } from '../providerAdapter';

const CHAT_MODEL = 'command-r';
const EMBED_MODEL = 'embed-english-v3.0';
const CHAT_URL = 'https://api.cohere.com/v2/chat';
const EMBED_URL = 'https://api.cohere.com/v2/embed';

/** Cohere v2 chat expects `role: 'system' | 'user' | 'assistant'`, which
 * matches ChatMessage directly. */
function toCohereMessages(messages: ChatMessage[]) {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}

async function callChat(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts?: ChatOptions
): Promise<string> {
  const response = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: toCohereMessages(messages),
      temperature: opts?.temperature,
      max_tokens: opts?.maxTokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cohere chat API error (${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  const contentParts = json?.message?.content;
  if (!Array.isArray(contentParts)) return '';
  return contentParts
    .filter((part: any) => part.type === 'text')
    .map((part: any) => part.text || '')
    .join('');
}

/**
 * Builds an AIProvider backed by Cohere's REST API (v2) using plain fetch.
 */
export function createCohereProvider(apiKeyOverride?: string): AIProvider {
  const apiKey = apiKeyOverride || process.env.COHERE_API_KEY;

  if (!apiKey) {
    throw new Error('Cohere provider requires COHERE_API_KEY to be set (or a per-user key). Check .env.local.');
  }

  return {
    id: 'cohere',
    chatModel: CHAT_MODEL,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
      return callChat(apiKey, opts?.model || CHAT_MODEL, messages, opts);
    },

    async *chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
      // Simplification: true streaming (SSE) support adds parsing
      // complexity beyond what's needed here, so we call the non-streaming
      // endpoint and yield the full result as a single chunk.
      const text = await callChat(apiKey, opts?.model || CHAT_MODEL, messages, opts);
      if (text) {
        yield text;
      }
    },

    async embed(texts: string[]): Promise<number[][]> {
      const response = await fetch(EMBED_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBED_MODEL,
          texts,
          input_type: 'search_document',
          embedding_types: ['float'],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Cohere embed API error (${response.status}): ${errorBody}`);
      }

      const json = await response.json();
      const floats = json?.embeddings?.float;
      if (!Array.isArray(floats)) {
        throw new Error('Cohere embed API returned an unexpected response shape.');
      }
      return floats;
    },
  };
}
