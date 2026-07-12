// Session backbone: a short-lived, HMAC-signed JWT (jose, HS256) carried in an
// httpOnly, Secure cookie.
//
// SECURITY INVARIANT: the server is the ONLY thing that ever decides "which
// round is this session on." It reads that from the verified JWT payload,
// never from anything the client sends in the request body. That means:
//   - a hand-crafted curl/script gets treated identically to the real UI
//   - editing the cookie value just breaks the signature (jose throws)
//   - there is no "current round" field anywhere except inside the signature
//
// This file has no knowledge of task content or answers - it only manages
// session identity and round-progression state.

import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

const COOKIE_NAME = 'captcha_session';
const SESSION_TTL_SECONDS = 45 * 60; // 45 min - long enough for a real attempt, short enough to bound abuse

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET env var missing or too short (need 32+ bytes)');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Creates a brand-new session for a visitor who just decoded the bundle and
 * hit the reveal URL (or hit /api/captcha/start directly).
 * @param {{ taskOrder: string[] }} params - the 3 task ids locked in for this session
 * @returns {Promise<{ token: string, payload: object }>}
 */
export async function createSession({ taskOrder }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sid: randomUUID(),
    round: 1,
    taskOrder,
    attempts: 0,
    claimed: false,
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(getSecretKey());

  return { token, payload: { ...payload, iat: now, exp: now + SESSION_TTL_SECONDS } };
}

/**
 * Verifies and decodes a session token. Throws if the signature is bad or
 * the token has expired - callers should catch and respond 401.
 * @param {string} token
 * @returns {Promise<object>} the session payload
 */
export async function verifySession(token) {
  const { payload } = await jwtVerify(token, getSecretKey());
  return payload;
}

/**
 * Signs a new token carrying updated fields (round advance, attempts++,
 * claimed=true, etc). Always re-derives from a trusted payload you already
 * verified - never from client input.
 * @param {object} currentPayload - previously-verified payload
 * @param {object} updates - fields to overwrite (e.g. { round: 2, attempts: 3 })
 */
export async function advanceSession(currentPayload, updates) {
  const now = Math.floor(Date.now() / 1000);
  const next = {
    sid: currentPayload.sid,
    round: currentPayload.round,
    taskOrder: currentPayload.taskOrder,
    attempts: currentPayload.attempts,
    claimed: currentPayload.claimed,
    ...updates,
  };

  const token = await new SignJWT(next)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(getSecretKey());

  return { token, payload: { ...next, iat: now, exp: now + SESSION_TTL_SECONDS } };
}

/** Builds the Set-Cookie header value for a given token. */
export function buildSessionCookie(token) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  return parts.join('; ');
}

/** Parses the incoming Cookie header and returns the raw session token, if any. */
export function readSessionCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return match ? match.slice(COOKIE_NAME.length + 1) : null;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
