// Reveal tokens: a separate signing key from the session JWT (REVEAL_TOKEN_SECRET)
// on purpose - these two token types protect different things and rotating
// one should never invalidate the other.
//
// A reveal token is minted once per session, at bundle-build time
// (see lib/bundle.js), and embedded into the obfuscated instructions as the
// {{REVEAL_URL}} substitution. It is the "key" that the obfuscated bundle
// hands to whoever/whatever decodes it - possession of a valid reveal token
// is what unlocks media, nothing else about the request matters (no cookie
// required), because the whole point is that this URL may be hit by
// something that isn't the visitor's own browser session (an AI's tool call,
// a curl, etc).

import { SignJWT, jwtVerify } from 'jose';

const REVEAL_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24h - bundle might sit decoded for a while before being acted on

function getRevealSecretKey() {
  const secret = process.env.REVEAL_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('REVEAL_TOKEN_SECRET env var missing or too short (need 32+ bytes)');
  }
  return new TextEncoder().encode(secret);
}

/** Mints a reveal token bound to a session id. */
export async function generateRevealToken(sid) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + REVEAL_TOKEN_TTL_SECONDS)
    .sign(getRevealSecretKey());
}

/** Verifies a reveal token, returns { sid } or throws. */
export async function verifyRevealToken(token) {
  const { payload } = await jwtVerify(token, getRevealSecretKey());
  return payload;
}
