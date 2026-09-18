import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth/config';
import { encryptSecret, isEncryptionConfigured } from '@/lib/crypto';
import { listUserConnections, upsertUserConnection, recordActivity } from '@/lib/db/sql/client';

export const runtime = 'nodejs';

/** Client-facing connection shape — never exposes ciphertext or tokens. */
interface PublicConnection {
  service: string;
  label: string;
  createdAt: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connections: PublicConnection[] = (await listUserConnections(session.user.id)).map((c) => ({
    service: c.service,
    label: c.label,
    createdAt: c.createdAt,
  }));

  return NextResponse.json({ connections, encryptionConfigured: isEncryptionConfigured() });
}

interface AddConnectionBody {
  service?: unknown;
  token?: unknown;
  label?: unknown;
}

/**
 * POST /api/connections — adds a token-based connection. Currently only
 * GitHub PATs; Gmail is connected via the OAuth flow under
 * /api/connections/google/start instead.
 */
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
          'before storing connection tokens. Generate one with `openssl rand -base64 32`.',
      },
      { status: 400 }
    );
  }

  let body: AddConnectionBody;
  try {
    body = (await req.json()) as AddConnectionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (body.service !== 'github') {
    return NextResponse.json(
      { error: 'Unsupported service. Only "github" tokens can be added here; Gmail uses OAuth.' },
      { status: 400 }
    );
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'token is required.' }, { status: 400 });
  }

  // Validate the PAT against the GitHub API before storing anything.
  const ghRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'IgniteAI-Studio',
    },
  });
  if (ghRes.status === 401) {
    return NextResponse.json(
      { error: 'GitHub rejected this token (401). Check that the Personal Access Token is valid and not expired.' },
      { status: 400 }
    );
  }
  if (!ghRes.ok) {
    return NextResponse.json(
      { error: `Could not validate the GitHub token (GitHub returned ${ghRes.status}).` },
      { status: 502 }
    );
  }

  const ghUser = (await ghRes.json().catch(() => null)) as { login?: string } | null;
  const label =
    ghUser?.login ?? (typeof body.label === 'string' && body.label.trim() ? body.label.trim() : 'GitHub');

  const { ciphertext, iv, authTag } = encryptSecret(token);
  await upsertUserConnection({
    id: uuidv4(),
    ownerId: session.user.id,
    service: 'github',
    ciphertext,
    iv,
    authTag,
    label,
  });
  await recordActivity({
    id: uuidv4(),
    ownerId: session.user.id,
    type: 'connection',
    summary: `Connected GitHub as ${label}`,
  });

  return NextResponse.json({ service: 'github', label });
}
