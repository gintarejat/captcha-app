// POST /api/captcha/submit
// The core game loop: verify the session, match the submitted answer against
// the CURRENT round's task (server-derived from the JWT, never from the
// request body), advance or don't, and claim a code on round-3 success.
//
// SECURITY INVARIANTS enforced here:
//  - Round is read from the verified session payload only. The client never
//    tells us "which round I'm on" - there is no such field in the request.
//  - Every response has the SAME shape whether the answer was right or
//    wrong (correct/round/done/code/soldOut always present), so inspecting
//    raw response bodies can't distinguish "close" from "wrong" beyond the
//    boolean itself, and scripted access looks identical to UI access.
//  - A session that already won (claimed === true) replays the SAME code
//    via kv.claimCode()'s idempotency, instead of re-running match logic or
//    consuming a second slot.
//  - acceptableAnswers never appears in any response, ever.

import { verifySession, advanceSession, buildSessionCookie, readSessionCookie } from '../../lib/session.js';
import { getTaskById } from '../../lib/content.js';
import { normalizeAndMatch } from '../../lib/match.js';
import { claimCode, setRoundMirror } from '../../lib/kv.js';
import { logAttempt } from '../../lib/log.js';
import { checkSubmitLimit, ipFrom } from '../../lib/ratelimit.js';

function emptyBody(res, statusCode, body) {
  res.status(statusCode).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!(await checkSubmitLimit(req, res))) return;

  const rawToken = readSessionCookie(req);
  if (!rawToken) {
    emptyBody(res, 401, { error: 'no_session' });
    return;
  }

  let payload;
  try {
    payload = await verifySession(rawToken);
  } catch {
    emptyBody(res, 401, { error: 'invalid_session' });
    return;
  }

  const submitted = typeof req.body?.answer === 'string' ? req.body.answer : '';

  // Replay of an already-won session: hand back the same code, don't
  // re-process an answer or touch the claim counter again.
  if (payload.claimed) {
    const claim = await claimCode(payload.sid);
    respondStable(res, { correct: true, round: 3, done: true, code: claim.ok ? claim.code : null, soldOut: !claim.ok });
    return;
  }

  const currentTaskId = payload.taskOrder[payload.round - 1];
  let task;
  try {
    task = await getTaskById(currentTaskId);
  } catch (err) {
    console.error('submit: task lookup failed', err);
    emptyBody(res, 500, { error: 'internal_error' });
    return;
  }

  const correct = normalizeAndMatch(submitted, task.acceptableAnswers);
  const ip = ipFrom(req);

  await logAttempt({ sid: payload.sid, round: payload.round, submitted, correct, ip });

  if (!correct) {
    const { token } = await advanceSession(payload, { attempts: payload.attempts + 1 });
    res.setHeader('Set-Cookie', buildSessionCookie(token));
    respondStable(res, { correct: false, round: payload.round, done: false, code: null, soldOut: false });
    return;
  }

  // Correct answer.
  if (payload.round < 3) {
    const newRound = payload.round + 1;
    const { token } = await advanceSession(payload, { round: newRound, attempts: payload.attempts + 1 });
    res.setHeader('Set-Cookie', buildSessionCookie(token));
    // Unlocks the next asset behind the (already-issued) reveal URL - see
    // lib/kv.js round-mirror note and api/reveal/[token].js.
    await setRoundMirror(payload.sid, newRound);
    respondStable(res, { correct: true, round: newRound, done: false, code: null, soldOut: false });
    return;
  }

  // Round 3 correct -> attempt to claim one of the 10 codes.
  const claim = await claimCode(payload.sid);
  const { token } = await advanceSession(payload, {
    attempts: payload.attempts + 1,
    claimed: claim.ok,
  });
  res.setHeader('Set-Cookie', buildSessionCookie(token));
  respondStable(res, {
    correct: true,
    round: 3,
    done: true,
    code: claim.ok ? claim.code : null,
    soldOut: !claim.ok,
  });
}

/** Always the same field set, regardless of outcome - see invariants above. */
function respondStable(res, { correct, round, done, code, soldOut }) {
  res.status(200).json({ correct, round, done, code, soldOut });
}
