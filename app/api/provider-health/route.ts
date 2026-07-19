import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {
  listConfiguredProviders,
  resolveConnectionType,
  type ProviderId,
} from '@/lib/ai/providerAdapter';
import { detectOllama } from '@/lib/ai/providers/ollama';
import { activeEmbeddingsProviderId } from '@/lib/ai/embeddingsAdapter';
import { env } from '@/lib/env';

/**
 * Per-user provider health. Reports which providers are configured (user key
 * or env), the active chat + embeddings selection, and the vector DB. A
 * provider is "up" here if it's configured; a deeper liveness probe would add
 * a cheap per-provider ping (left as a follow-up to avoid slow/hanging calls
 * when keys are absent).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const configured = listConfiguredProviders(userId);
  const configuredIds = new Set<ProviderId>(configured.map((c) => c.id));

  const ALL_PROVIDERS: ProviderId[] = [
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

  const providers = ALL_PROVIDERS.map((id) => {
    const match = configured.find((c) => c.id === id);
    return {
      id,
      configured: configuredIds.has(id),
      source: match?.source ?? null,
    };
  });

  const activeChat = configured[0]?.id ?? null;
  const connectionType = resolveConnectionType(userId);
  const local = await detectOllama();

  return NextResponse.json({
    providers,
    activeChatProvider: activeChat,
    activeEmbeddingsProvider: activeEmbeddingsProviderId(userId),
    vectorDbProvider: env.vectorDbProvider,
    connectionType,
    local,
  });
}
