import { env } from '@/lib/env';

/**
 * Transactional email sender backed by Resend (https://resend.com).
 *
 * Resend is called over plain HTTPS rather than via its SDK so the app keeps
 * zero extra dependencies. Configure with:
 *
 *   RESEND_API_KEY=re_...
 *   EMAIL_FROM="IgniteAI Studio <noreply@yourdomain.com>"
 *
 * When RESEND_API_KEY is absent the mailer does not fail — it logs the message
 * (including any action link) to the server console and reports success. That
 * keeps the password-reset and email-verification flows fully exercisable in
 * local development without a mail account, while production only needs the two
 * env vars above. `isEmailConfigured()` lets callers tell the user which mode
 * they are in.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function isEmailConfigured(): boolean {
  return Boolean(env.resendApiKey);
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Plain-text body. Always sent, and used as the fallback part. */
  text: string;
  /** Optional HTML body; when omitted a simple themed wrapper is generated. */
  html?: string;
}

export interface SendEmailResult {
  /** True when the message was accepted (by Resend, or by the console fallback). */
  ok: boolean;
  /** 'resend' when actually delivered, 'console' when logged in dev fallback. */
  transport: 'resend' | 'console';
  error?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!env.resendApiKey) {
    // Dev fallback. Deliberately logs the full body so reset/verify links are
    // usable from the terminal.
    console.info(
      `\n[mailer] RESEND_API_KEY not set — email not sent.\n` +
        `  To:      ${input.to}\n` +
        `  Subject: ${input.subject}\n` +
        `  ---\n${input.text}\n  ---\n`
    );
    return { ok: true, transport: 'console' };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.emailFrom,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html ?? wrapHtml(input.subject, input.text),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[mailer] Resend rejected the message (${res.status}): ${detail}`);
      return { ok: false, transport: 'resend', error: `Resend returned ${res.status}` };
    }

    return { ok: true, transport: 'resend' };
  } catch (err) {
    console.error('[mailer] Failed to reach Resend:', err);
    return {
      ok: false,
      transport: 'resend',
      error: err instanceof Error ? err.message : 'Unknown mailer error',
    };
  }
}

/** Minimal, inline-styled HTML shell — email clients ignore external CSS. */
function wrapHtml(subject: string, text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />');
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#101010;border:1px solid #262626;border-radius:8px;">
      <tr><td style="padding:24px 28px;border-bottom:1px solid #262626;">
        <span style="color:#ed1515;font-size:18px;font-weight:600;">IgniteAI Studio</span>
      </td></tr>
      <tr><td style="padding:28px;color:#f5f5f5;font-size:14px;line-height:22px;">
        <h1 style="margin:0 0 16px;font-size:18px;color:#f5f5f5;">${subject}</h1>
        <div style="color:#c4c4c4;">${escaped}</div>
      </td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #262626;color:#737373;font-size:12px;">
        If you did not request this email you can safely ignore it.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}
