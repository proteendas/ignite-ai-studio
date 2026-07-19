import OpenAI from 'openai';
import type { ChatMessage } from '@/lib/types';
import type { AIProvider, ChatOptions } from '../providerAdapter';

const API_VERSION = '2024-06-01';

/**
 * Builds an AIProvider backed by Azure OpenAI. Azure's REST shape is
 * OpenAI-compatible but authenticates via an `api-key` header and scopes
 * requests to a specific deployment name (rather than a model name) baked
 * into the URL path, so we configure the `openai` SDK client accordingly
 * rather than reusing createOpenAICompatibleProvider directly.
 */
export function createAzureOpenAIProvider(): AIProvider {
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;

  if (!apiKey || !endpoint) {
    throw new Error(
      'Azure OpenAI provider requires AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT ' +
        'to be set. Check .env.local.'
    );
  }

  const chatDeployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT || 'gpt-4o-mini';
  const embeddingDeployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;

  const normalizedEndpoint = endpoint.replace(/\/+$/, '');

  function clientFor(deployment: string): OpenAI {
    return new OpenAI({
      apiKey,
      baseURL: `${normalizedEndpoint}/openai/deployments/${deployment}`,
      defaultQuery: { 'api-version': API_VERSION },
      defaultHeaders: { 'api-key': apiKey },
    });
  }

  const chatClient = clientFor(chatDeployment);

  return {
    id: 'azure-openai',
    chatModel: chatDeployment,

    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string> {
      const completion = await chatClient.chat.completions.create({
        model: opts?.model || chatDeployment,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: opts?.temperature,
        max_tokens: opts?.maxTokens,
      });

      const content = completion.choices[0]?.message?.content;
      return content ?? '';
    },

    async *chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string> {
      const stream = await chatClient.chat.completions.create({
        model: opts?.model || chatDeployment,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: opts?.temperature,
        max_tokens: opts?.maxTokens,
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
      if (!embeddingDeployment) {
        throw new Error(
          'Azure OpenAI provider has no embedding deployment configured. Set ' +
            'AZURE_OPENAI_EMBEDDING_DEPLOYMENT in your environment to use embeddings ' +
            'with this provider.'
        );
      }

      const embedClient = clientFor(embeddingDeployment);
      const response = await embedClient.embeddings.create({
        model: embeddingDeployment,
        input: texts,
      });

      return response.data.map((d) => d.embedding);
    },
  };
}
