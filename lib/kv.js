// Thin wrapper around the shared Redis client (lib/redis.js), plus the one
// piece of logic that actually needs to be atomic across concurrent
// requests: claiming one of the 10 static secret codes.
//
// Why Redis/KV and not in-memory state: confirmed empirically in a sibling
// project (scamnot) that Vercel serverless functions do NOT share in-memory
// state (a plain `Map` reset between invocations/instances). A `Map`-based
// counter here would silently issue duplicate codes or miscount claims
// under real concurrent traffic. Redis gives us real atomic INCR across
// every instance.

import { redis } from './redis.js';
import { getCodes } from './content.js';

const CODE_CLAIM_COUNTER_KEY = 'captcha:code_claim_counter';
const CLAIMED_CODE_KEY = (sid) => `captcha:claimed:${sid}`;

/**
 * Atomically claims the next available code for a session, or returns the
 * one already claimed by that session (idempotent replay-safe).
 *
 * Race-condition guarantee: redis.incr() is a single atomic Redis command, so
 * N concurrent finishers each get a distinct, strictly increasing counter
 * value - no two callers can ever receive the same slot number, regardless
 * of how many requests land in the same millisecond across however many
 * serverless instances are running.
 *
 * @param {string} sid - session id, used as the idempotency key
 * @returns {Promise<{ ok: true, code: string } | { ok: false, reason: 'sold_out' }>}
 */
export async function claimCode(sid) {
  // Idempotent replay: if this session already claimed a code, hand back the
  // same one instead of consuming another slot from the counter.
  const existing = await redis.get(CLAIMED_CODE_KEY(sid));
  if (existing) {
    return { ok: true, code: existing };
  }

  const codes = await getCodes();
  const totalSlots = codes.length; // 10

  const slot = await redis.incr(CODE_CLAIM_COUNTER_KEY); // 1-indexed after incr
  if (slot > totalSlots) {
    return { ok: false, reason: 'sold_out' };
  }

  const code = codes[slot - 1];
  // Persist the mapping so a re-submit (or retried request) returns the same
  // code instead of re-running the race. No expiry - a claim is permanent
  // for the lifetime of this PoC.
  await redis.set(CLAIMED_CODE_KEY(sid), code);
  return { ok: true, code };
}

/** Read-only check, used by /api/admin/stats. */
export async function getClaimStats() {
  const claimed = (await redis.get(CODE_CLAIM_COUNTER_KEY)) || 0;
  const codes = await getCodes();
  return { claimed: Math.min(claimed, codes.length), total: codes.length };
}

// --- Round mirror (content-delivery only, NOT a security control) ---
//
// The reveal endpoint (/api/reveal/[token].js) is hit via a bearer-style
// token, not the session cookie - it may be fetched by something that
// doesn't carry the visitor's cookies at all (an AI's own tool call, a
// forwarded link, curl). So it can't read "current round" off the session
// JWT the way submit.js does. Instead, submit.js mirrors the authoritative
// round into KV every time it advances, and reveal.js reads that mirror
// purely to decide WHICH asset to serve. This mirror grants no access by
// itself - the reveal token is still required to reach this code path at
// all, and mutating the mirror doesn't let you skip rounds or claim a code.
const ROUND_MIRROR_KEY = (sid) => `captcha:round_mirror:${sid}`;

export async function setRoundMirror(sid, round) {
  await redis.set(ROUND_MIRROR_KEY(sid), round);
}

export async function getRoundMirror(sid) {
  return (await redis.get(ROUND_MIRROR_KEY(sid))) || 1;
}

export { redis };
