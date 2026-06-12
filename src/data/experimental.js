'use strict';

/* ── Lifetime-sum scoring (per-event exponential fade) ──
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
 * Defaults anchor a +100 event to ~63 days and a +2 event to ~3 days.
 * Slope/floor are derived from those anchors in Config. Half-lives differ
 * per event: ~9.6d for a +100, ~2.4d for a +10, ~3d for a +2.
 */

function expLifespan(score) {
  const slope = S.weights.expT_Slope ?? 0.6122;
  const floor = S.weights.expT_Floor ?? 1.7755;
  return Math.abs(score) * slope + floor;
}

function expRemaining(score, daysAgo) {
  if (score === 0) return 0;
  if (daysAgo < 0) return 0;
  const abs = Math.abs(score);
  if (abs < 1) return 0;
  const T = expLifespan(score);
  const k = Math.log(abs) / T;
  const r = score * Math.exp(-k * daysAgo);
  if (Math.abs(r) < 1) return 0;
  return r;
}

// Raw per-entry scores grouped into relational, personal, and social buckets,
// using the shared scoring primitives (bankScoreEntry / restoreScore /
// wobbleRestoreScore / caretakerPersonalScore).
// Social is a third axis kept distinct from rel/per. In Individual mode it
// replaces Relational in the atmosphere calculation; in other modes it just
// doesn't get populated (no `social` entries exist).
function expEntryScores(e, cap) {
  let rel = 0, per = 0, soc = 0;
  if (e.category === 'affection' || e.category === 'physical' || e.category === 'conflict' || e.category === 'turndown') {
    rel = bankScoreEntry(e, cap).score;
  }
  if (e.category === 'social' || e.category === 'friction') {
    soc = bankScoreEntry(e, cap).score;
  }
  if (e.category === 'restore') {
    const t = S.restoreTypes.find(x => (typeof x === 'string' ? x : x.name) === e.eventType);
    per = restoreScore(e, t, cap);
  } else if (e.category === 'regulation') {
    per = wobbleRestoreScore(e, cap);
  } else if (e.category === 'burnout') {
    per = caretakerPersonalScore(e, cap);
  }
  return { rel, per, soc };
}

// Sum every event's surviving contribution as of the reference date (defaults to today).
// Entries dated after refDate are excluded — they're "future" relative to that snapshot.
// Returns { rel, per, soc, tenor }. In Individual mode, tenor = avg(soc, per);
// otherwise tenor = avg(rel, per).
function computeExperimentalScores(refDate) {
  const ref = refDate || S.today;
  const src = calcEntries();
  const byDate = {};
  for (const e of src) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  let rel = 0, per = 0, soc = 0;
  for (const e of src) {
    if (e.date > ref) continue;
    const dayEs = byDate[e.date];
    const cap   = bankDayCap(dayEs.find(le => le.category === 'libido'));
    const daysAgo = daysBetween(e.date, ref);
    const { rel: r, per: p, soc: s } = expEntryScores(e, cap);
    if (r !== 0) rel += expRemaining(r, daysAgo);
    if (p !== 0) per += expRemaining(p, daysAgo);
    if (s !== 0) soc += expRemaining(s, daysAgo);
  }
  rel = Math.round(rel * 10) / 10;
  per = Math.round(per * 10) / 10;
  soc = Math.round(soc * 10) / 10;
  // Atmosphere math:
  //   Individual mode        — avg(soc, per)
  //   Partner/Dating + 3-axis — avg(rel, soc, per)
  //   Partner/Dating default — avg(rel, per)
  const isIndividual = S.relationshipMode === 'individual';
  let tenor;
  if (isIndividual) tenor = (soc + per) / 2;
  else if (S.trackSocialAxis) tenor = (rel + soc + per) / 3;
  else tenor = (rel + per) / 2;
  tenor = Math.round(tenor * 10) / 10;
  return { rel, per, soc, tenor };
}
