import { consumeRateLimit } from '@/lib/db/sql/client';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Rate limiter backed by Postgres, keyed by an arbitrary string
 * (e.g. `ip:1.2.3.4` or `user:<id>:chat`).
 *
 * This used to be an in-memory Map, which is meaningless on a serverless
 * platform: every invocation may land in a fresh process, so a per-process
 * counter never accumulates and the limit is never reached. Worse, on a
 * multi-replica deployment each replica enforced its own copy of the limit,
 * multiplying the effective ceiling by the replica count.
 *
 * The counter now lives in the database and is incremented atomically in a
 * single statement, so the limit holds however many instances are running.
 * The cost is one round-trip per limited request, which is why only expensive
 * and security-sensitive endpoints are limited.
 *
 * Failure is deliberately open: if the database is unreachable, requests are
 * allowed rather than the whole app returning 429. An outage should not look
 * like a rate-limit wall.
 */
export async function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
  try {
    return await consumeRateLimit(key, opts.limit, opts.windowMs);
  } catch (err) {
    console.error('[rateLimit] Falling open — could not reach the rate-limit store:', err);
    return { allowed: true, remaining: opts.limit, resetAt: Date.now() + opts.windowMs };
  }
}
