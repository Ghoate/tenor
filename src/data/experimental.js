'use strict';

/* ── Experimental scoring (lifetime sum with per-event lifespan decay) ──
 *
 * Two constants + a power-law decay shape.
 *   lifespan(s) = |s| × lifespanSlope + lifespanFloor
 *   remaining(s, daysAgo) = s / (1 + (daysAgo / lifespan(s))^decayPower)
 *
 * Bigger events linger longer; the decay is slow at first, accelerates
 * near the lifespan, then asymptotically tails off. The current tenor
 * is the sum of every event's surviving contribution across all history.
 */

function expLifespan(score) {
  const slope = S.weights.lifespanSlope ?? 0.5;
  const floor = S.weights.lifespanFloor ?? 1.5;
  return Math.abs(score) * slope + floor;
}

function expRemaining(score, daysAgo) {
  if (score === 0) return 0;
  if (daysAgo < 0) return 0; // future events do not contribute
  const power  = S.weights.decayPower       ?? 2;
  const cutoff = S.weights.cutoffMultiplier ?? 2.5;
  const ls = expLifespan(score);
  if (daysAgo >= ls * cutoff) return 0; // hard zero past the cutoff
  return score / (1 + Math.pow(daysAgo / ls, power));
}

// Raw per-entry scores grouped into relational and personal buckets,
// using the shared scoring primitives (bankScoreEntry / restoreScore /
// wobbleRestoreScore / caretakerPersonalScore).
function expEntryScores(e, cap) {
  let rel = 0, per = 0;
  if (e.category === 'affection' || e.category === 'physical' || e.category === 'conflict' || e.category === 'turndown') {
    rel = bankScoreEntry(e, cap).score;
  }
  if (e.category === 'restore') {
    const t = S.restoreTypes.find(x => (typeof x === 'string' ? x : x.name) === e.eventType);
    per = restoreScore(e, t, cap);
  } else if (e.category === 'regulation') {
    per = wobbleRestoreScore(e, cap);
  } else if (e.category === 'burnout') {
    per = caretakerPersonalScore(e, cap);
  }
  return { rel, per };
}

// Sum every event's surviving contribution as of the reference date (defaults to today).
// Entries dated after refDate are excluded — they're "future" relative to that snapshot.
// Returns { rel, per, tenor }.
function computeExperimentalScores(refDate, forceModel) {
  // Debug toggle: route through the alternate exponential-decay model for comparison.
  // Pass forceModel='powerlaw' to bypass the toggle and compute the power-law values
  // (used by the debug panel when it wants to show both side-by-side).
  if (S.useExponentialDecay && forceModel !== 'powerlaw') return computeExponentialScores(refDate);
  const ref = refDate || S.today;
  const src = calcEntries();
  // Group entries by date once so we can resolve each day's capacity multiplier.
  const byDate = {};
  for (const e of src) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  let rel = 0, per = 0;
  for (const e of src) {
    if (e.date > ref) continue; // skip entries newer than the reference date
    const dayEs = byDate[e.date];
    const cap   = bankDayCap(dayEs.find(le => le.category === 'libido'));
    const daysAgo = daysBetween(e.date, ref);
    const { rel: r, per: p } = expEntryScores(e, cap);
    if (r !== 0) rel += expRemaining(r, daysAgo);
    if (p !== 0) per += expRemaining(p, daysAgo);
  }
  rel = Math.round(rel * 10) / 10;
  per = Math.round(per * 10) / 10;
  const tenor = Math.round((rel + per) / 2 * 10) / 10;
  return { rel, per, tenor };
}
