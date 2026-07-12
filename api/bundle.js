// GET /api/bundle
// Builds and streams the downloadable zip: obfuscated instructions only,
// with a real per-session reveal URL substituted in. Ensures a session
// exists first (creates one if this is the visitor's first touch, so
// "Download Bundle" works as a standalone first action on the landing page,
// before round 1 has been started).

import { createSession, verifySession, buildSessionCookie, readSessionCookie } from '../lib/session.js';
import { generateRevealToken } from '../lib/tokens.js';
import { buildBundleZip } from '../lib/bundle.js';
import { logBundleDownload } from '../lib/log.js';
import { checkBundleLimit, ipFrom } from '../lib/ratelimit.js';

function baseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!(await checkBundleLimit(req, res))) return;

  let sid;
  const rawToken = readSessionCookie(req);
  if (rawToken) {
    try {
      ({ sid } = await verifySession(rawToken));
    } catch {
      // fall through to minting a fresh session below
    }
  }

  if (!sid) {
    // taskOrder is fixed (round1/round2/round3) for this PoC - only 3 tasks exist.
    const { token, payload } = await createSession({ taskOrder: ['round1', 'round2', 'round3'] });
    res.setHeader('Set-Cookie', buildSessionCookie(token));
    sid = payload.sid;
  }

  try {
    const revealToken = await generateRevealToken(sid);
    const revealUrl = `${baseUrl(req)}/api/reveal/${revealToken}`;
    const zipBuffer = await buildBundleZip(revealUrl);

    await logBundleDownload({ sid, ip: ipFrom(req) });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="captcha-bundle.zip"');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(zipBuffer);
  } catch (err) {
    console.error('bundle: build failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
