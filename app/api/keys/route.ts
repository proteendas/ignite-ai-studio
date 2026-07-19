import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth/config';
import { encryptSecret, maskSecret, isEncryptionConfigured } from '@/lib/crypto';
import { listUserApiKeys, upsertUserApiKey } from '@/lib/db/sql/client';
import type { ProviderId } from '@/lib/ai/providerAdapter';

// The 12 supported providers. Kept in sync with providerAdapter's ProviderId
// union; the `satisfies` check below fails to compile if they ever diverge.
const PROVIDER_IDS = [
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
] as const satisfies readonly ProviderId[];

function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** Client-facing shape of a stored key — never exposes ciphertext or the key itself. */
interface PublicApiKey {
  provider: string;
  keyPreview: string;
  createdAt: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys: PublicApiKey[] = listUserApiKeys(session.user.id).map((k) => ({
    provider: k.provider,
    keyPreview: k.keyPreview,
    createdAt: k.createdAt,
  }));

  // Top-level metadata (not per-key data) so the UI can warn proactively when
  // key storage is unavailable. No secret material is exposed here.
  return NextResponse.json({ keys, encryptionConfigured: isEncryptionConfigured() });
}

interface StoreKeyBody {
  provider?: unknown;
  apiKey?: unknown;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      {
        error:
          'Encryption is not configured. Set ENCRYPTION_KEY (min 16 chars) in your environment ' +
          'before storing provider API keys. Generate one with `openssl rand -base64 32`.',
      },
      { status: 400 }
    );
  }

  let body: StoreKeyBody;
  try {
    body = (await req.json()) as StoreKeyBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!isProviderId(body.provider)) {
    return NextResponse.json(
      { error: 'Unknown provider. Must be one of the 12 supported providers.' },
      { status: 400 }
    );
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  if (!apiKey) {
    return NextResponse.json({ error: 'apiKey is required.' }, { status: 400 });
  }

  const { ciphertext, iv, authTag } = encryptSecret(apiKey);
  const keyPreview = maskSecret(apiKey);

  upsertUserApiKey({
    id: uuidv4(),
    ownerId: session.user.id,
    provider: body.provider,
    ciphertext,
    iv,
    authTag,
    keyPreview,
  });

  return NextResponse.json({ provider: body.provider, keyPreview });
}
