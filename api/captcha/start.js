// POST /api/captcha/start
// Idempotent: if a valid session cookie already exists (e.g. the page was
// reloaded mid-game, which the frontend does after every correct answer),
// this returns that session's CURRENT round instead of minting a fresh one -
// otherwise every reload would silently reset progress back to round 1.
// Only mints a brand-new session when there's no valid one yet.
//
// Always returns ONLY the client-safe view of the current task
// (prompt/type/media metadata - never acceptableAnswers, never a blob path).

import { createSession, verifySession, buildSessionCookie, readSessionCookie } from '../../lib/session.js';
import { getTasks, getTaskById, toClientSafeTask } from '../../lib/content.js';
import { checkStartLimit } from '../../lib/ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!(await checkStartLimit(req, res))) return;

  try {
    const rawToken = readSessionCookie(req);
    if (rawToken) {
      try {
        const payload = await verifySession(rawToken);
        const currentTaskId = payload.taskOrder[payload.round - 1];
        const task = await getTaskById(currentTaskId);
        res.status(200).json({ round: payload.round, task: toClientSafeTask(task) });
        return;
      } catch {
        // invalid/expired cookie - fall through and mint a fresh session
      }
    }

    const tasks = await getTasks();
    const ordered = [...tasks].sort((a, b) => a.order - b.order);
    const taskOrder = ordered.map((t) => t.id);

    const { token } = await createSession({ taskOrder });
    res.setHeader('Set-Cookie', buildSessionCookie(token));

    const round1 = ordered[0];
    res.status(200).json({ round: 1, task: toClientSafeTask(round1) });
  } catch (err) {
    console.error('captcha/start error', err);
    res.status(500).json({ error: 'internal_error' });
  }
}
