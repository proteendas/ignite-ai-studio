import type { ChatMessage } from '@/lib/types';
import type { AIProvider, ChatOptions } from '../providerAdapter';

const CHAT_MODEL = 'gemini-3.5-flash';
const EMBED_MODEL = 'text-embedding-004';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/** Maps ChatMessage[] to Gemini's `contents` shape, splitting out any
 * system message(s) into a `systemInstruction`. Gemini only accepts 'user'
 * and 'model' roles in `contents`, so 'assistant' -> 'model'.
 */
function toGeminiRequest(messages: ChatMessage[]): {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
} {
  const systemParts: GeminiPart[] = [];
  const contents: GeminiContent[] = [];

  for (const message of messages) {
    if (message.role === 'system') {
      systemParts.push({ text: message.content });
      continue;
    }
    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    });
  }

  return {
    contents,
    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
  };
}

function extractText(json: any): string {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p: GeminiPart) => p.text || '').join('');
}

async function callGenerateContent(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  opts?: ChatOptions
): Promise<string> {
  const { contents, systemInstruction } = toGeminiRequest(messages);

  const url = `${BASE_URL}/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction,
      generationConfig: {
        temperature: opts?.temperature,
        maxOutputTokens: opts?.maxTokens,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  return extractText(json);
}

/**
 * Builds an AIProvider backed by the Gemini REST API using plain fetch (no
 * SDK dependency).
 */
export function createGeminiProvider(apiKeyOverride?: string): AIProvider {
  const apiKey = apiKeyOverride || process.env.GOOGLE_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Gemini provider requires GOOGLE_GEMINI_API_KEY to be set (or a per-user key). Check .env.local.'
    );
  }

  return {
    id: 'gemini',
    chatModel: CHAT_MODEL,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
      return callGenerateContent(apiKey, opts?.model || CHAT_MODEL, messages, opts);
    },

    async *chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
      // Simplification: true SSE streaming via streamGenerateContent adds
      // meaningful parsing complexity, so we call the non-streaming endpoint
      // and yield the full response as a single chunk.
      const text = await callGenerateContent(apiKey, opts?.model || CHAT_MODEL, messages, opts);
      if (text) {
        yield text;
      }
    },

    async embed(texts: string[]): Promise<number[][]> {
      const embeddings: number[][] = [];

      for (const text of texts) {
        const url = `${BASE_URL}/models/${EMBED_MODEL}:embedContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text }] },
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`Gemini embed API error (${response.status}): ${errorBody}`);
        }

        const json = await response.json();
        const values = json?.embedding?.values;
        if (!Array.isArray(values)) {
          throw new Error('Gemini embed API returned an unexpected response shape.');
        }
        embeddings.push(values);
      }

      return embeddings;
    },
  };
}
