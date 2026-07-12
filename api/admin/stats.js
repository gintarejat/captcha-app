// GET /api/admin/stats?key=<ADMIN_STATS_KEY>
// Minimal, shared-secret-gated view into the research signals: claim
// counts and recent attempt/download/reveal events. Not real auth - fine
// for a PoC only you and maybe a few collaborators will hit.

import { getClaimStats } from '../../lib/kv.js';
import { getRecentEvents } from '../../lib/log.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const providedKey = req.query.key || req.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_STATS_KEY;
  if (!expectedKey || providedKey !== expectedKey) {
    res.status(404).json({ error: 'not_found' }); // don't reveal this route exists
    return;
  }

  const [claims, attempts, downloads, reveals] = await Promise.all([
    getClaimStats(),
    getRecentEvents('attempts', 100),
    getRecentEvents('downloads', 100),
    getRecentEvents('reveals', 100),
  ]);

  res.status(200).json({ claims, attempts, downloads, reveals });
}
