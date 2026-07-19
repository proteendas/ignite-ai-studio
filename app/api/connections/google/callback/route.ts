import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth/config';
import { encryptSecret, isEncryptionConfigured } from '@/lib/crypto';
import { upsertUserConnection, recordActivity } from '@/lib/db/sql/client';

export const runtime = 'nodejs';

// Kept in sync with app/api/connections/google/start/route.ts.
const STATE_COOKIE = 'igniteai_gmail_oauth_state';

function settingsRedirect(origin: string, query: string): NextResponse {
  const res = NextResponse.redirect(`${origin}/settings?${query}`);
  // One-shot nonce: always clear the state cookie on the way out.
  res.cookies.set(STATE_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}

/** Best-effort email extraction from a Google id_token (JWT payload, no verification needed — we just received it over TLS from Google's token endpoint). */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      email?: string;
    };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/connections/google/callback — completes the Gmail OAuth flow:
 * verifies the state nonce, exchanges the code for tokens, stores the
 * encrypted refresh token (service 'google-gmail'), and bounces back to
 * Settings.
 */
export async function GET(req: NextRequest) {
  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || req.nextUrl.origin;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(`${origin}/login`);
  }
  const ownerId = session.user.id;

  const params = req.nextUrl.searchParams;
  const oauthError = params.get('error');
  if (oauthError) {
    return settingsRedirect(origin, `error=${encodeURIComponent(`google-${oauthError}`)}`);
  }

  const state = params.get('state');
  const cookieState = req.cookies.get(STATE_COOKIE)?.value;
  if (!state || !cookieState || state !== cookieState) {
    return settingsRedirect(origin, 'error=google-state-mismatch');
  }

  const code = params.get('code');
  if (!code) {
    return settingsRedirect(origin, 'error=google-missing-code');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return settingsRedirect(origin, 'error=google-not-configured');
  }
  if (!isEncryptionConfigured()) {
    return settingsRedirect(origin, 'error=encryption-not-configured');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/api/connections/google/callback`,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const tokenJson = (await tokenRes.json().catch(() => null)) as
    | { refresh_token?: string; id_token?: string; error?: string }
    | null;

  if (!tokenRes.ok || !tokenJson) {
    return settingsRedirect(
      origin,
      `error=${encodeURIComponent(`google-token-exchange-${tokenJson?.error ?? tokenRes.status}`)}`
    );
  }
  if (!tokenJson.refresh_token) {
    // Google only returns a refresh token with access_type=offline&prompt=consent;
    // if it is absent the connection would be unusable, so fail loudly.
    return settingsRedirect(origin, 'error=google-no-refresh-token');
  }

  const label = emailFromIdToken(tokenJson.id_token) ?? session.user.email ?? 'Gmail';

  const { ciphertext, iv, authTag } = encryptSecret(tokenJson.refresh_token);
  upsertUserConnection({
    id: uuidv4(),
    ownerId,
    service: 'google-gmail',
    ciphertext,
    iv,
    authTag,
    label,
  });
  recordActivity({
    id: uuidv4(),
    ownerId,
    type: 'connection',
    summary: `Connected Gmail as ${label}`,
  });

  return settingsRedirect(origin, 'connected=google-gmail');
}
