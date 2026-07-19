import type { ChatMessage } from '@/lib/types';
import type { AIProvider, ChatOptions } from '../providerAdapter';

const CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

function runUrl(accountId: string, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

async function callChat(
  token: string,
  accountId: string,
  model: string,
  messages: ChatMessage[],
  opts?: ChatOptions
): Promise<string> {
  const response = await fetch(runUrl(accountId, model), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: opts?.temperature,
      max_tokens: opts?.maxTokens,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloudflare Workers AI error (${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  return json?.result?.response ?? '';
}

/**
 * Builds an AIProvider backed by Cloudflare Workers AI using plain fetch.
 */
export function createCloudflareWorkersAIProvider(apiKeyOverride?: string): AIProvider {
  const token = apiKeyOverride || process.env.CLOUDFLARE_WORKERS_AI_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

  if (!token) {
    throw new Error(
      'Cloudflare Workers AI provider requires CLOUDFLARE_WORKERS_AI_TOKEN to be set ' +
        '(or a per-user key). Check .env.local.'
    );
  }
  if (!accountId) {
    throw new Error(
      'Cloudflare Workers AI provider requires CLOUDFLARE_ACCOUNT_ID to be set. Check ' +
        '.env.local.'
    );
  }

  return {
    id: 'cloudflare-workers-ai',
    chatModel: CHAT_MODEL,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
      return callChat(token, accountId, opts?.model || CHAT_MODEL, messages, opts);
    },

    async *chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
      // Simplification: Workers AI supports SSE streaming via `stream: true`,
      // but parsing that adds complexity beyond what's needed here, so we
      // call the non-streaming endpoint and yield the full result as one
      // chunk.
      const text = await callChat(token, accountId, opts?.model || CHAT_MODEL, messages, opts);
      if (text) {
        yield text;
      }
    },

    async embed(texts: string[]): Promise<number[][]> {
      const response = await fetch(runUrl(accountId, EMBED_MODEL), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: texts }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Cloudflare Workers AI embed error (${response.status}): ${errorBody}`);
      }

      const json = await response.json();
      const data = json?.result?.data;
      if (!Array.isArray(data)) {
        throw new Error('Cloudflare Workers AI embed returned an unexpected response shape.');
      }
      return data;
    },
  };
}
