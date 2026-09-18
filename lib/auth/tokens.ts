import crypto from 'crypto';
import { env } from '@/lib/env';
import { createAuthToken, purgeStaleAuthTokens, type AuthTokenKind } from '@/lib/db/sql/client';

/** How long each kind of link stays valid. */
const TTL_MINUTES: Record<AuthTokenKind, number> = {
  password_reset: 60,
  email_verification: 60 * 24,
};

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Mints a token, persists only its hash, and returns the raw token for use in
 * a one-time link. The raw value is never stored, so a lost link can only be
 * replaced, never recovered.
 */
export async function issueToken(ownerId: string, kind: AuthTokenKind): Promise<string> {
  await purgeStaleAuthTokens();
  const token = crypto.randomBytes(32).toString('base64url');
  // ISO-8601, which Postgres parses directly into the TIMESTAMPTZ column.
  const expiresAt = new Date(Date.now() + TTL_MINUTES[kind] * 60_000).toISOString();
  await createAuthToken({ tokenHash: hashToken(token), ownerId, kind, expiresAt });
  return token;
}

/** Absolute URL for a one-time link, based on NEXTAUTH_URL. */
export function buildActionUrl(path: string, token: string): string {
  const base = env.nextAuthUrl.replace(/\/$/, '');
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

export function ttlLabel(kind: AuthTokenKind): string {
  const minutes = TTL_MINUTES[kind];
  return minutes >= 60 ? `${Math.round(minutes / 60)} hour${minutes >= 120 ? 's' : ''}` : `${minutes} minutes`;
}
