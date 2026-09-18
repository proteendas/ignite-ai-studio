import OpenAI from 'openai';
import type { ChatMessage } from '@/lib/types';
import type { AIProvider, ChatOptions } from '../providerAdapter';
import { resolveModels, chatModelEnvVar, invalidateModelCache } from '../modelDiscovery';

export interface OpenAICompatibleOptions {
  id: string;
  apiKey: string;
  baseURL?: string;
  /**
   * Last-resort model id, used only when the provider will not list its models
   * and no `<PROVIDER>_CHAT_MODEL` override is set. Normal operation discovers
   * the model from the API key instead.
   */
  fallbackChatModel: string;
  embedModel?: string;
}

/**
 * Factory that builds an AIProvider backed by any OpenAI-compatible REST API
 * (OpenAI itself, Groq, Mistral, Cerebras, OpenRouter, Together, GitHub Models,
 * Hugging Face router, etc.) using the official `openai` SDK client pointed at
 * a custom `baseURL`.
 */
/**
 * True when the provider rejected the request because the model id is unknown
 * to it. Providers retire model names on their own schedule, so a hardcoded
 * default eventually 404s through no fault of the deployment.
 */
function isUnknownModelError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  return (
    status === 404 ||
    /does not exist|decommissioned|deprecated|unknown model|model_not_found|invalid model/i.test(
      message
    )
  );
}

export function createOpenAICompatibleProvider(opts: OpenAICompatibleOptions): AIProvider {
  const { id, apiKey, baseURL, fallbackChatModel, embedModel } = opts;

  const client = new OpenAI({ apiKey, baseURL });

  /**
   * The model to send. An explicit ChatOptions.model wins (the caller has
   * already decided); otherwise the model is discovered from the API key.
   * `light` is the cheap tier used for classification and summarisation.
   */
  async function pickModel(chatOpts?: ChatOptions): Promise<string> {
    if (chatOpts?.model) return chatOpts.model;
    const models = await resolveModels(client, id, fallbackChatModel);
    return chatOpts?.light ? models.light : models.primary;
  }

  /**
   * Rewrites a "model not found" failure into something actionable.
   *
   * The provider is asked which models the key can actually use, and those are
   * named in the message along with the env var that overrides the default.
   * Without this the user sees only "model X does not exist", with no way to
   * discover a working replacement short of reading provider release notes.
   */
  async function explainModelError(err: unknown, model: string): Promise<never> {
    if (!isUnknownModelError(err)) throw err;

    // The cached pick may have been retired since it was discovered; drop it so
    // the next request re-queries rather than repeating the same dead id.
    invalidateModelCache(id);

    const envVar = chatModelEnvVar(id);
    let available = '';
    try {
      const list = await client.models.list();
      const ids = list.data
        .map((m) => m.id)
        .filter(Boolean)
        .sort()
        .slice(0, 25);
      if (ids.length) available = ` Models available to this key: ${ids.join(', ')}.`;
    } catch {
      // Listing is best-effort; a provider that refuses it should not mask the
      // original, more useful error.
    }

    throw new Error(
      `Provider "${id}" does not offer the model "${model}" (it has most likely been ` +
        `retired). Set ${envVar} to a model this account can use.${available}`
    );
  }

  return {
    id,
    // Advertised only for display; the model actually sent is resolved per call
    // by pickModel(), which prefers discovery over this value.
    chatModel: process.env[chatModelEnvVar(id)]?.trim() || fallbackChatModel,

    async chat(messages: ChatMessage[], chatOpts?: ChatOptions): Promise<string> {
      const model = await pickModel(chatOpts);
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: chatOpts?.temperature,
          max_tokens: chatOpts?.maxTokens,
        });

        const content = completion.choices[0]?.message?.content;
        return content ?? '';
      } catch (err) {
        return explainModelError(err, model);
      }
    },

    async *chatStream(messages: ChatMessage[], chatOpts?: ChatOptions): AsyncIterable<string> {
      const model = await pickModel(chatOpts);
      let stream;
      try {
        stream = await client.chat.completions.create({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: chatOpts?.temperature,
          max_tokens: chatOpts?.maxTokens,
          stream: true,
        });
      } catch (err) {
        await explainModelError(err, model);
        return;
      }

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
