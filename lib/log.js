// Append-only event log in KV. This is the "signal, not proof" research
// data: attempts (with the raw typed answer - logging submitted text is
// exactly why free-typed answers were chosen over multiple choice), bundle
// downloads, and reveal-token hits (the closest available proxy for "the
// puzzle got decoded and the content was located").
//
// Deliberately simple: capped lists per event type, not a real analytics
// pipeline. Good enough for a PoC's /api/admin/stats.

import { redis } from './redis.js';

const MAX_EVENTS = 2000;

async function pushEvent(listKey, event) {
  const record = JSON.stringify({ ...event, ts: Date.now() });
  await redis.lpush(listKey, record);
  await redis.ltrim(listKey, 0, MAX_EVENTS - 1);
}

/** @param {{ sid: string, round: number, submitted: string, correct: boolean, ip: string }} e */
export function logAttempt(e) {
  return pushEvent('captcha:log:attempts', e);
}

/** @param {{ sid: string, ip: string }} e */
export function logBundleDownload(e) {
  return pushEvent('captcha:log:downloads', e);
}

/** @param {{ sid: string, round: number, ip: string, userAgent: string }} e */
export function logRevealHit(e) {
  return pushEvent('captcha:log:reveals', e);
}

/**
 * Fetches the last N events of a given type, newest first.
 *
 * NOTE: @upstash/redis has `automaticDeserialization` on by default, which
 * recursively JSON.parses array results like LRANGE - so these come back
 * already as objects, not JSON strings. Do NOT JSON.parse(r) again here;
 * that would throw on an already-parsed object.
 */
export async function getRecentEvents(type, limit = 100) {
  const key = `captcha:log:${type}`;
  return redis.lrange(key, 0, limit - 1);
}
