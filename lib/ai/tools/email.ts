import { z } from 'zod';
import { getUserConnection } from '@/lib/db/sql/client';
import { decryptSecret, isEncryptionConfigured } from '@/lib/crypto';
import type { ToolContext, ToolDefinition, ToolResult } from './types';

/**
 * email_send — sends via the Gmail API using the user's OAuth refresh token
 * (stored encrypted in user_connections under service 'google-gmail').
 *
 * This tool ALWAYS requires explicit human approval: the agent loop hard-codes
 * an exception so it can never be auto-approved, regardless of preferences.
 *
 * Gmail only for now — Microsoft Graph / Outlook is intentionally not
 * implemented in this iteration.
 */

const GMAIL_SERVICE = 'google-gmail';

function base64Url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** UTF-8-safe subject header (RFC 2047 encoded-word). */
function encodeSubject(subject: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

async function getGmailAccessToken(refreshToken: string): Promise<
  { ok: true; accessToken: string } | { ok: false; error: string }
> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }).toString(),
  });
  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;
  if (!res.ok || !json?.access_token) {
    return {
      ok: false,
      error: json?.error_description ?? json?.error ?? `Google token endpoint returned ${res.status}`,
    };
  }
  return { ok: true, accessToken: json.access_token };
}

export const emailSend: ToolDefinition = {
  name: 'email_send',
  description:
    'Send an email from the user\'s connected Gmail account (Gmail only for now — Outlook/Microsoft ' +
    'Graph is not implemented). Always requires explicit user approval before sending.',
  sideEffect: 'write',
  inputSchema: z.object({
    to: z.string().email(),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
  async execute(input, ctx: ToolContext): Promise<ToolResult> {
    const { to, subject, body } = input as { to: string; subject: string; body: string };

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return {
        ok: false,
        summary:
          'Email sending is not configured on this server: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET ' +
          'environment variables are required for the Gmail integration.',
      };
    }
    if (!isEncryptionConfigured()) {
      return {
        ok: false,
        summary:
          'Email sending is unavailable: ENCRYPTION_KEY is not configured, so the stored Gmail ' +
          'connection cannot be decrypted.',
      };
    }

    const conn = await getUserConnection(ctx.ownerId, GMAIL_SERVICE);
    if (!conn) {
      return {
        ok: false,
        summary:
          'No Gmail connection found. Ask the user to connect Gmail in Settings → Connections ' +
          '(requires Google OAuth configuration) before sending email.',
      };
    }

    let refreshToken: string;
    try {
      refreshToken = decryptSecret({ ciphertext: conn.ciphertext, iv: conn.iv, authTag: conn.authTag });
    } catch {
      return {
        ok: false,
        summary:
          'The stored Gmail connection could not be decrypted. Ask the user to reconnect Gmail in ' +
          'Settings → Connections.',
      };
    }

    const tokenResult = await getGmailAccessToken(refreshToken);
    if (!tokenResult.ok) {
      return {
        ok: false,
        summary:
          `Could not refresh the Gmail access token (${tokenResult.error}). The user may need to ` +
          'reconnect Gmail in Settings → Connections.',
      };
    }

    const rfc2822 = [
      `To: ${to}`,
      `Subject: ${encodeSubject(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      body,
    ].join('\r\n');

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: base64Url(rfc2822) }),
    });
    const sendJson = (await sendRes.json().catch(() => null)) as
      | { id?: string; error?: { message?: string } }
      | null;

    if (!sendRes.ok) {
      return {
        ok: false,
        summary: `Gmail API returned ${sendRes.status}: ${sendJson?.error?.message ?? 'unknown error'}`,
      };
    }

    return {
      ok: true,
      summary: `Email sent to ${to}: "${subject}"`,
      data: { messageId: sendJson?.id ?? null, to, subject },
    };
  },
};
