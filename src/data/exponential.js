'use strict';

/* ── Exponential decay scoring (lifetime sum, per-event exponential fade) ──
 *
 * Each event has its own lifespan T(s), proportional to magnitude.
 * Within that lifespan it decays exponentially toward zero. When the
 * surviving contribution drops below 1, it rounds to zero — a tiny cliff
 * that's invisible against the typical score scale.
 *
 *   T(s) = |s| × expT_Slope + expT_Floor          // days until dead
 *   k(s) = ln(|s|) / T(s)                          // per-event decay rate
 *   remaining(s, daysAgo) = s × exp(-k × daysAgo)  // clipped to 0 when |r| < 1
 *
 * Defaults: T_Slope=0.58, T_Floor=1.8 — anchors a -100 to die at ~60d
 * and a -2 to die at ~3d. Half-lives differ per event: ~9d for a -100,
 * ~2.3d for a -10, ~3d for a -2.
 */

function expDecayLifespan(score) {
  const slope = S.weights.expT_Slope ?? 0.58;
  const floor = S.weights.expT_Floor ?? 1.8;
  return Math.abs(score) * slope + floor;
}

function expDecayRemaining(score, daysAgo) {
  if (score === 0) return 0;
  if (daysAgo < 0) return 0;
  const abs = Math.abs(score);
  if (abs < 1) return 0; // already below threshold
  const T = expDecayLifespan(score);
  const k = Math.log(abs) / T;
  const r = score * Math.exp(-k * daysAgo);
  if (Math.abs(r) < 1) return 0; // micro-cliff at 1
  return r;
}

function expDecayEntryScores(e, cap) {
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

function computeExponentialScores(refDate) {
  const ref = refDate || S.today;
  const src = calcEntries();
  const byDate = {};
  for (const e of src) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  let rel = 0, per = 0;
  for (const e of src) {
    if (e.date > ref) continue;
    const dayEs = byDate[e.date];
    const cap   = bankDayCap(dayEs.find(le => le.category === 'libido'));
    const daysAgo = daysBetween(e.date, ref);
    const { rel: r, per: p } = expDecayEntryScores(e, cap);
    if (r !== 0) rel += expDecayRemaining(r, daysAgo);
    if (p !== 0) per += expDecayRemaining(p, daysAgo);
  }
  rel = Math.round(rel * 10) / 10;
  per = Math.round(per * 10) / 10;
  const tenor = Math.round((rel + per) / 2 * 10) / 10;
  return { rel, per, tenor };
}
