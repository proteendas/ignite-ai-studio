import OpenAI from 'openai';
import type { ChatMessage } from '@/lib/types';
import type { AIProvider, ChatOptions } from '../providerAdapter';

export interface OpenAICompatibleOptions {
  id: string;
  apiKey: string;
  baseURL?: string;
  chatModel: string;
  embedModel?: string;
}

/**
 * Factory that builds an AIProvider backed by any OpenAI-compatible REST API
 * (OpenAI itself, Groq, Mistral, Cerebras, OpenRouter, Together, GitHub Models,
 * Hugging Face router, etc.) using the official `openai` SDK client pointed at
 * a custom `baseURL`.
 */
export function createOpenAICompatibleProvider(opts: OpenAICompatibleOptions): AIProvider {
  const { id, apiKey, baseURL, chatModel, embedModel } = opts;

  const client = new OpenAI({ apiKey, baseURL });

  return {
    id,
    chatModel,

    async chat(messages: ChatMessage[], chatOpts?: ChatOptions): Promise<string> {
      const completion = await client.chat.completions.create({
        model: chatOpts?.model || chatModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: chatOpts?.temperature,
        max_tokens: chatOpts?.maxTokens,
      });

      const content = completion.choices[0]?.message?.content;
      return content ?? '';
    },

    async *chatStream(messages: ChatMessage[], chatOpts?: ChatOptions): AsyncIterable<string> {
      const stream = await client.chat.completions.create({
        model: chatOpts?.model || chatModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: chatOpts?.temperature,
        max_tokens: chatOpts?.maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const piece = chunk.choices[0]?.delta?.content;
        if (piece) {
          yield piece;
        }
      }
    },

    async embed(texts: string[]): Promise<number[][]> {
      if (!embedModel) {
        throw new Error(
          `Provider "${id}" has no embedding model configured. This provider does not ` +
            `support embeddings (e.g. Groq has no embeddings endpoint). Configure a ` +
            `different provider for embeddings, or set EMBEDDING_PROVIDER in your ` +
            `environment to point embedding calls at a provider that supports them.`
        );
      }

      const response = await client.embeddings.create({
        model: embedModel,
        input: texts,
      });

      return response.data.map((d) => d.embedding);
    },
  };
}
