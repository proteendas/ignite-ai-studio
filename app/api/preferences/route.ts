import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import {
  getUserPreferences,
  upsertUserPreferences,
  type UserPreferences,
} from '@/lib/db/sql/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ preferences: getUserPreferences(session.user.id) });
}

type PreferencesPatch = Partial<Omit<UserPreferences, 'ownerId'>>;

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Only accept the known preference fields; ignore anything else in the body.
  const patch: PreferencesPatch = {};
  if ('defaultProvider' in body) {
    patch.defaultProvider = typeof body.defaultProvider === 'string' ? body.defaultProvider : null;
  }
  if ('defaultModel' in body) {
    patch.defaultModel = typeof body.defaultModel === 'string' ? body.defaultModel : null;
  }
  if (typeof body.defaultTone === 'string') {
    patch.defaultTone = body.defaultTone;
  }
  if (typeof body.theme === 'string') {
    patch.theme = body.theme;
  }
  if ('connectionType' in body) {
    const ct = body.connectionType;
    if (ct !== 'cloud' && ct !== 'local' && ct !== 'auto') {
      return NextResponse.json(
        { error: 'connectionType must be one of: cloud, local, auto.' },
        { status: 400 }
      );
    }
    patch.connectionType = ct;
  }
  if ('autoApprove' in body) {
    const aa = body.autoApprove;
    const isBooleanMap =
      typeof aa === 'object' &&
      aa !== null &&
      !Array.isArray(aa) &&
      Object.values(aa).every((v) => typeof v === 'boolean');
    if (!isBooleanMap) {
      return NextResponse.json(
        { error: 'autoApprove must be an object mapping tool names to booleans.' },
        { status: 400 }
      );
    }
    patch.autoApprove = aa as Record<string, boolean>;
  }

  const preferences = upsertUserPreferences(session.user.id, patch);
  return NextResponse.json({ preferences });
}
