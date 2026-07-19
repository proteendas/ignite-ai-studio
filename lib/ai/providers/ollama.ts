import type { ChatMessage } from '@/lib/types';
import type { AIProvider, ChatOptions } from '../providerAdapter';

/**
 * Ollama provider — local AI with no API key. Talks to a locally running
 * Ollama server (default http://localhost:11434). Unreachability is surfaced
 * as a fast, descriptive error so withFallback() can move on to a cloud
 * provider (connection type 'auto') or the caller can tell the user to start
 * Ollama (connection type 'local').
 */

const DEFAULT_BASE_URL = 'http://localhost:11434';

/** Timeout for liveness detection (GET /api/tags). */
const DETECT_TIMEOUT_MS = 1_500;
/** Timeout for real chat/embed calls — local models can be slow on CPU. */
const CALL_TIMEOUT_MS = 300_000;

export function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export function ollamaChatModel(): string {
  return process.env.OLLAMA_MODEL || 'llama3.2';
}

export function ollamaEmbeddingModel(): string {
  return process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
}

function unreachableError(baseUrl: string): Error {
  return new Error(
    `Ollama server not reachable at ${baseUrl}. Is Ollama running? (ollama serve)`
  );
}

/**
 * fetch() against the Ollama server, translating network-level failures
 * (connection refused, timeout/abort) into a single actionable error.
 */
async function ollamaFetch(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const baseUrl = ollamaBaseUrl();
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw unreachableError(baseUrl);
  }
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const model = ollamaEmbeddingModel();

  const res = await ollamaFetch(
    '/api/embed',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
    },
    CALL_TIMEOUT_MS
  );

  if (res.status === 404) {
    // Older Ollama versions predate /api/embed — fall back to the legacy
    // per-text /api/embeddings endpoint.
    const out: number[][] = [];
    for (const text of texts) {
      const legacy = await ollamaFetch(
        '/api/embeddings',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: text }),
        },
        CALL_TIMEOUT_MS
      );
      if (!legacy.ok) {
        throw new Error(`Ollama embeddings error (${legacy.status}): ${await legacy.text()}`);
      }
      const json = await legacy.json();
      if (!Array.isArray(json?.embedding)) {
        throw new Error('Ollama /api/embeddings returned an unexpected response shape.');
      }
      out.push(json.embedding as number[]);
    }
    return out;
  }

  if (!res.ok) {
    throw new Error(`Ollama embed error (${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  if (!Array.isArray(json?.embeddings)) {
    throw new Error('Ollama /api/embed returned an unexpected response shape.');
  }
  return json.embeddings as number[][];
}

export function createOllamaProvider(): AIProvider {
  return {
    id: 'ollama',
    chatModel: ollamaChatModel(),

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
      const res = await ollamaFetch(
        '/api/chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: opts?.model || ollamaChatModel(),
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: false,
            options: {
              temperature: opts?.temperature,
              num_predict: opts?.maxTokens,
            },
          }),
        },
        CALL_TIMEOUT_MS
      );
      if (!res.ok) {
        throw new Error(`Ollama chat error (${res.status}): ${await res.text()}`);
      }
      const json = await res.json();
      return json?.message?.content ?? '';
    },

    async *chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
      const res = await ollamaFetch(
        '/api/chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: opts?.model || ollamaChatModel(),
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            stream: true,
            options: {
              temperature: opts?.temperature,
              num_predict: opts?.maxTokens,
            },
          }),
        },
        CALL_TIMEOUT_MS
      );
      if (!res.ok || !res.body) {
        throw new Error(`Ollama chat error (${res.status}): ${await res.text()}`);
      }

      // The streaming response is NDJSON: one JSON object per line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const json = JSON.parse(trimmed);
            const piece = json?.message?.content;
            if (piece) yield piece as string;
            if (json?.done) return;
          }
        }
        const tail = buffer.trim();
        if (tail) {
          const json = JSON.parse(tail);
          const piece = json?.message?.content;
          if (piece) yield piece as string;
        }
      } finally {
        reader.releaseLock();
      }
    },

    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      return embedBatch(texts);
    },
  };
}

/**
 * Fast liveness + model discovery probe (GET /api/tags, 1.5s budget) for the
 * provider-health panel and 'auto' connection-type UX. Never throws.
 */
export async function detectOllama(): Promise<{
  reachable: boolean;
  baseUrl: string;
  models: string[];
}> {
  const baseUrl = ollamaBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(DETECT_TIMEOUT_MS),
    });
    if (!res.ok) return { reachable: false, baseUrl, models: [] };
    const json = await res.json();
    const models = Array.isArray(json?.models)
      ? (json.models as { name?: string }[]).map((m) => m.name).filter((n): n is string => !!n)
      : [];
    return { reachable: true, baseUrl, models };
  } catch {
    return { reachable: false, baseUrl, models: [] };
  }
}
