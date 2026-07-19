import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { isEncryptionConfigured } from '@/lib/crypto';

export const runtime = 'nodejs';

// Kept in sync with app/api/connections/google/callback/route.ts (route files
// may not export arbitrary values in the App Router).
const STATE_COOKIE = 'igniteai_gmail_oauth_state';

/**
 * GET /api/connections/google/start — kicks off the Gmail OAuth consent flow.
 * Issues a random state nonce (stored in an httpOnly cookie, verified in the
 * callback) and 302s to Google's consent screen requesting offline access to
 * gmail.send.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error:
          'Google OAuth is not configured on this server. Set GOOGLE_CLIENT_ID and ' +
          'GOOGLE_CLIENT_SECRET in the environment (a Google Cloud OAuth client with the ' +
          'Gmail API enabled), then restart to enable the Gmail connection.',
      },
      { status: 503 }
    );
  }

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      {
        error:
          'Encryption is not configured. Set ENCRYPTION_KEY (min 16 chars) in your environment ' +
          'before connecting Gmail — the OAuth refresh token is stored encrypted.',
      },
      { status: 503 }
    );
  }

  const origin = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  const redirectUri = `${origin}/api/connections/google/callback`;
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send email');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: origin.startsWith('https://'),
    path: '/',
    maxAge: 600,
  });
  return res;
}
