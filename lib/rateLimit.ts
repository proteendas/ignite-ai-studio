interface Bucket {
  count: number;
  windowStart: number;
}

/**
 * In-memory token-bucket rate limiter, keyed by an arbitrary string
 * (e.g. `ip:1.2.3.4` or `user:<id>:chat`). Fine for a single-instance
 * deployment; swap for Upstash/Redis-backed limiting if the app runs as
 * multiple replicas, since this state does not survive process restarts
 * or spread across instances.
 */
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= opts.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: opts.limit - 1, resetAt: now + opts.windowMs };
  }

  if (existing.count >= opts.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.windowStart + opts.windowMs,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: opts.limit - existing.count,
    resetAt: existing.windowStart + opts.windowMs,
  };
}
