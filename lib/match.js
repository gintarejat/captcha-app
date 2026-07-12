// normalizeAndMatch() - THIS IS YOUR CALL, NOT MINE.
//
// Every submitted answer flows through here before it's compared against
// the acceptableAnswers[] list from tasks.json. Right now it's a strict
// (trimmed, case/whitespace-normalized) equality check - deliberately left
// unfinished.
//
// Why this matters and why it's yours to write: how forgiving this function
// is directly shapes the difficulty and the research signal. Too strict
// (current state) and a human/AI with the exactly right idea still fails on
// a stray comma or "a" vs "the". Too forgiving and round 3 (whose answer
// requires round 2's content) becomes guessable by partial-match luck
// instead of actually having decoded both rounds. You know your own
// tasks.json answers - only you can judge the right tolerance per round.
//
// TODO (yours): extend the normalization/matching logic below. Ideas to
// consider, pick what fits your actual content:
//   - Levenshtein/edit-distance threshold for typo tolerance
//   - Stripping punctuation, articles ("a", "the"), extra whitespace
//   - Case-insensitive substring/contains matching for longer answers
//   - Synonym lists per task (e.g. acceptableAnswers already supports this
//     as a list - you may just need more entries rather than fuzzy logic)
//   - Different strictness per round (round 1 lenient, round 3 stricter
//     since it's the "prove you really got both rounds" gate)

function basicNormalize(str) {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * @param {string} submitted - raw text from the textarea
 * @param {string[]} acceptableAnswers - from tasks.json for this round
 * @returns {boolean}
 */
export function normalizeAndMatch(submitted, acceptableAnswers) {
  const normalizedSubmitted = basicNormalize(submitted);

  // --- current behavior: strict equality after basic normalization ---
  return acceptableAnswers.some((answer) => basicNormalize(answer) === normalizedSubmitted);

  // --- TODO: replace/extend the line above with your own matching logic ---
}
