// Rate limiting via @upstash/ratelimit, backed by the same Redis instance
// as everything else (lib/redis.js). This is deliberately basic - out of
// scope for this PoC is "sophisticated anti-brute-force"; this just stops
// naive scripted hammering of the submit/bundle/reveal endpoints.

import { Ratelimit } from '@upstash/ratelimit';
import { redis } from './redis.js';

const submitLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60 s'),
  prefix: 'ratelimit:submit',
});

const bundleLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: 'ratelimit:bundle',
});

const revealLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '60 s'),
  prefix: 'ratelimit:reveal',
});

const startLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60 s'),
  prefix: 'ratelimit:start',
});

/** Best-effort IP extraction behind Vercel's proxy. */
export function ipFrom(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Applies a named limiter and writes standard rate-limit headers.
 * Returns true if the request should proceed, false if it was already
 * rejected (caller should just `return` after a false result).
 */
async function applyLimit(limiter, key, res) {
  const { success, limit, remaining, reset } = await limiter.limit(key);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(reset));
  if (!success) {
    res.status(429).json({ error: 'rate_limited' });
    return false;
  }
  return true;
}

export function checkSubmitLimit(req, res) {
  return applyLimit(submitLimiter, ipFrom(req), res);
}

export function checkBundleLimit(req, res) {
  return applyLimit(bundleLimiter, ipFrom(req), res);
}

export function checkRevealLimit(req, res) {
  return applyLimit(revealLimiter, ipFrom(req), res);
}

export function checkStartLimit(req, res) {
  return applyLimit(startLimiter, ipFrom(req), res);
}
