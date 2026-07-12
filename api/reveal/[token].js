// GET /api/reveal/:token
//
// The one and only place a Blob URL is ever touched. This endpoint:
//  1. Verifies the reveal token (minted at bundle-build time, embedded in
//     the obfuscated instructions the visitor/their AI decoded).
//  2. Looks up which asset to serve via the KV round-mirror (round 2 video
//     while the session is on round 2, round 3 image once it has advanced -
//     see lib/kv.js for why this mirror exists and why it's not a security
//     control).
//  3. Fetches the bytes server-side from Blob and streams them back through
//     OUR domain. The raw *.public.blob.vercel-storage.com URL never
//     appears in any header or body sent to the caller.
//  4. Logs the hit - this is the primary research signal ("the puzzle was
//     decoded and the content was located"), understood as a proxy for AI
//     involvement, not proof of it.
//
// Deliberately reachable without the session cookie: the whole point is
// that this may be requested by something that isn't the visitor's own
// browser (an AI's tool call fetching a URL it was handed, a forwarded
// link, curl). Possession of a valid signed token is the only gate.

import { verifyRevealToken } from '../../lib/tokens.js';
import { getRoundMirror } from '../../lib/kv.js';
import { getTasks } from '../../lib/content.js';
import { fetchBlobAsset } from '../../lib/blob.js';
import { logRevealHit } from '../../lib/log.js';
import { checkRevealLimit, ipFrom } from '../../lib/ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!(await checkRevealLimit(req, res))) return;

  const { token } = req.query;

  let sid;
  try {
    ({ sid } = await verifyRevealToken(token));
  } catch {
    res.status(404).json({ error: 'not_found' }); // deliberately vague, not "invalid token"
    return;
  }

  const round = await getRoundMirror(sid);
  if (round < 2) {
    res.status(425).json({ error: 'too_early' }); // nothing unlocked yet
    return;
  }

  const taskId = round === 2 ? 'round2' : 'round3';
  const tasks = await getTasks();
  const task = tasks.find((t) => t.id === taskId);
  if (!task?.media?.blobPathname) {
    res.status(500).json({ error: 'internal_error' });
    return;
  }

  await logRevealHit({ sid, round, ip: ipFrom(req), userAgent: req.headers['user-agent'] || '' });

  try {
    const { buffer, contentType } = await fetchBlobAsset(task.media.blobPathname);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buffer);
  } catch (err) {
    console.error('reveal: blob fetch failed', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
