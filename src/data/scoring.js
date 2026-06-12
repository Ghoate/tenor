'use strict';

// Compute the capacity multiplier for a day from its libido entry (or null).
// Max raw score = geomean_max(5) × needs_weight_max(1)
// C and R modulate from there — neutral day + Peak = exactly W
const SCORE_MAX_RAW = 5;
// C = mood_norm^0.4 × energy_norm^0.4 × libido_norm^0.2
// where norm = 1 + (score - 3) / 8
// Neutral day (all 3s) → C = 1.0
function bankDayCap(libiEntry) {
  if (!libiEntry) return 1.0;
  const norm  = v => 1 + (v - 3) / 8;
  const moodN  = norm(libiEntry.mood      ?? 3);
  const energyN= norm(libiEntry.energy    ?? 3);
  if (!S.showPhysical) {
    // No desire — split weight evenly between mood and energy
    return Math.pow(moodN, 0.5) * Math.pow(energyN, 0.5);
  }
  // Desire on 1-5 scale; map to same range as mood/energy using same norm formula
  const libiN  = norm(libiEntry.libiLevel ?? 3);
  return Math.pow(moodN, 0.4) * Math.pow(energyN, 0.4) * Math.pow(libiN, 0.2);
}

// Score a single entry given the day's capacity multiplier.
// Returns { score, color, label } — score 0 means not scored.
function bankScoreEntry(e, cap) {
  const W = S.weights;
  const invCap = 1 / (cap || 1.0); // inverse capacity for negative events
  if (e.category === 'affection') {
    const typeObj = S.affectionTypes.find(t => t.name === e.eventType);
    const raw = typeObj ? deriveActivityWeight(typeObj) : 1.0;
    const R   = BANK_OUTCOME_M[e.connectionQuality || 3] || 0.60;
    // scoreScale: optional per-entry multiplier (Combined-screen split). Absent = full.
    const score = (raw * cap * R / SCORE_MAX_RAW) * 100 * (e.scoreScale ?? 1);
    return { score, color: CAT_COLORS.affection, label: '🩷 ' + (e.eventType || bondingLabel()) };
  }
  if (e.category === 'social') {
    const typeObj = S.socialTypes.find(t => t.name === e.eventType);
    const raw = typeObj ? deriveSocialActivityWeight(typeObj) : 1.0;
    const R   = BANK_OUTCOME_M[e.connectionQuality || 3] || 0.60;
    const score = (raw * cap * R / SCORE_MAX_RAW) * 100 * (e.scoreScale ?? 1);
    return { score, color: CAT_COLORS.social, label: '🫂 ' + (e.eventType || 'Social') };
  }
  if (e.category === 'friction') {
    const impact = e.impact || 3;
    const intM   = FRICTION_INTENSITY_M[e.intensity || 3] || 0.60;
    const resObj = FRICTION_RESOLUTION.find(r => r.val === e.resolution);
    const resM   = resObj ? resObj.m : 0.60;
    const score  = -(impact * intM * resM * invCap / SCORE_MAX_RAW) * 100;
    return { score, color: CAT_COLORS.friction, label: '🌧️ Friction' };
  }
  if (e.category === 'physical' && !e.solo) {
    const typeObj = S.physicalTypes.find(t => t.name === e.eventType);
    const raw = typeObj ? deriveActivityWeight(typeObj) : 1.0;
    const R   = BANK_OUTCOME_M[e.connectionQuality || 3] || 0.60;
    const score = (raw * cap * R / SCORE_MAX_RAW) * 100;
    return { score, color: CAT_COLORS.physical, label: '🌹 ' + (e.eventType || 'Intimacy') };
  }
  if (e.category === 'physical' && e.solo) {
    return { score: 0, color: 'rgba(168,50,78,0.5)', label: '🌹 Solo' };
  }
  if (e.category === 'conflict') {
    const condM = CONF_CONDUCT_M[e.conduct] || 0.60;
    const resM  = (S.weights.confR[e.resolution || 'unresolved'] || 0.80);
    let score;
    if (e.harm) {
      const intM    = CONF_INTENSITY_M[e.intensity || 1] || 0.20;
      const geoMean = Math.pow(condM * resM, 1/2);
      score = -(e.harm * intM * geoMean * invCap / 5) * 100;
    } else {
      // Legacy fallback for old entries without harm
      const LEGACY_CONF_S = {1:30, 2:45, 3:65, 4:90, 5:120};
      score = -(LEGACY_CONF_S[e.intensity || 1] || 30) * resM * invCap;
    }
    return { score, color: CAT_COLORS.conflict, label: '⛈️ Conflict' };
  }
  if (e.category === 'turndown') {
    if (e.initiatedBy !== 'her') return { score: 0, color: CAT_COLORS.turndown, label: '❄️ Turn down (by me)' };
    const W    = e.tdImpact || 3;
    const sigM = TD_SIG_M[e.tdSignificance || 3] || 0.60;
    const howM = TD_HOW_M[e.turndownType] || 0.60;
    const score = -(W * sigM * howM * invCap / 5) * 100;
    return { score, color: CAT_COLORS.turndown, label: '❄️ Turn down' };
  }
  if (e.category === 'burnout') {
    const typeNames = Array.isArray(e.caretakerTypes) && e.caretakerTypes.length ? e.caretakerTypes : (e.caretakerType ? [e.caretakerType] : []);
    const selectedObjs = typeNames.map(n => S.caretakerTypes.find(t => t.name === n)).filter(Boolean);
    const rawW = selectedObjs.length > 0
      ? selectedObjs.reduce((s,t) => s + deriveCaretakerWeight(t), 0) / selectedObjs.length
      : 3.0;
    const iM = STEAD_INTENSITY_M[e.steadyingIntensity || 3] || 0.60;
    const durObj = DURATION_OPTIONS.find(o => o.v === e.duration);
    const tM = durObj ? durObj.m : 0.60;
    const drainObj = DRAIN_LEVELS.find(d => d.val === e.drain);
    const dM = drainObj ? drainObj.m : 0.60;
    const outcomeObj = CARETAKER_OUTCOME.find(o => o.val === Number(e.caretakerOutcome));
    const rM = outcomeObj ? outcomeObj.m : 0.60;
    const geoMean = Math.pow(tM * dM * rM, 1/3);
    const score = -(rawW * iM * geoMean * invCap / 5) * 100;

    // Steadying always scores personal only — it's a personal resource cost.
    // The relational impact of difficult situations shows through conflict entries.
    return { score: 0, color: CAT_COLORS.burnout, label: '💨 Steadying' };
  }
  if (e.category === 'regulation') {
    // Wobble always scores personal only — it's an internal emotional state, not a relational event.
    // If the wobble leads to a conflict, log a separate conflict entry for the relational impact.
    return { score: 0, color: CAT_COLORS.regulation, label: '🌪️ Wobble' };
  }
  return { score: 0, color: '', label: '' };
}

// Load magnitude helpers — positive values used by insights and weekly panels.
// These are raw sums with no capacity multiplier, decay, or diminishing returns —
// they measure event weight for trend comparison and threshold triggers, not bank impact.
// bankConfLoad  — conflict severity × resolution multiplier (e.g. Crisis unresolved = 120)
// bankDrainLoad — steadying drain level (Mild=10, Medium=33, Heavy=50)
// bankTdLoad    — accumulated unmet desire by significance weight (Passing=20 → Deep longing=100);
//                 represents how much emotional investment went unmet, summed across events
function restoreScore(e, typeObj, cap) {
  if (!typeObj || typeof typeObj !== 'object' || !typeObj.needsMap) return 0;
  const rawW          = deriveRestoreWeight(typeObj);
  const rq            = RESTORE_QUALITY.find(q => q.val === migrateRestoreQuality(e.restoreQuality, e));
  const ri            = RESTORE_IMMERSION.find(i => i.val === (e.restoreImmersion || 3));
  const qualityMult   = rq ? rq.mult : 0.80;
  const immersionMult = ri ? ri.mult : 0.60;
  // scoreScale: optional per-entry multiplier (Combined-screen split). Absent = full.
  return (rawW * immersionMult * qualityMult * cap / SCORE_MAX_RAW) * 100 * (e.scoreScale ?? 1);
}
function bankConfLoad(e) {
  return Math.abs(bankScoreEntry(e, 1.0).score);
}
// Caretaker load magnitude — always returns full score regardless of context routing.
// Used for insights/weekly load calculations (not balance scoring).
function burnoutLoadEntry(e) {
  return Math.abs(caretakerPersonalScore(e, 1.0));
}
function bankTdLoad(e) {
  return Math.abs(bankScoreEntry(e, 1.0).score);
}


// Only migrates entries that have NOT yet been saved with the new scale, identified by
// the absence of a `rqMigrated` flag. New entries always set rqMigrated:true on save.
function migrateRestoreQuality(v, entry) {
  if (entry && entry.rqMigrated) return v; // already on new scale
  if (v === 1) return 2; // Light → Below average
  if (v === 2) return 4; // Good  → Good
  if (v === 3) return 5; // Excellent → Excellent
  return v;
}


// Relational wobble ALSO scores against Relational balance via bankScoreEntry (not double-counted on Combined).
// Formula: -(I × R × 1/C) / 5 × 100
function wobbleRestoreScore(e, cap) {
  if (!e.regulationIntensity) return 0;
  const resM = e.regulationResolution === 'resolved'    ? 0.20
             : e.regulationResolution === 'coming-down' ? 0.40
             : e.regulationResolution === 'still-on'    ? 0.60
             : e.regulationResolution === 'no-better'   ? 0.80
             : e.regulationResolution === 'heavier'     ? 1.00
             :                                            0.60;
  return -(e.regulationIntensity * resM * (1 / cap) / 5) * 100;
}

// Caretaker personal (restore gauge) cost — ALL caretaking scores against Personal only.
// Steadying is never relational — the relational impact of difficult situations shows through conflict.
function caretakerPersonalScore(e, cap) {
  const typeNames = Array.isArray(e.caretakerTypes) && e.caretakerTypes.length ? e.caretakerTypes : (e.caretakerType ? [e.caretakerType] : []);
  const selectedObjs = typeNames.map(n=>S.caretakerTypes.find(t=>t.name===n)).filter(Boolean);
  const rawW = selectedObjs.length > 0
    ? selectedObjs.reduce((s,t)=>s+deriveCaretakerWeight(t),0)/selectedObjs.length
    : 3.0;
  const iM = STEAD_INTENSITY_M[e.steadyingIntensity || 3] || 0.60;
  const tM = (DURATION_OPTIONS.find(o => o.v === e.duration) || {m:0.60}).m;
  const dM = (DRAIN_LEVELS.find(d => d.val === e.drain) || {m:0.60}).m;
  const rM = (CARETAKER_OUTCOME.find(o => o.val === Number(e.caretakerOutcome)) || {m:0.60}).m;
  const invCap = 1 / (cap || 1.0);
  const geoMean = Math.pow(tM * dM * rM, 1/3);
  return -(rawW * iM * geoMean * invCap / 5) * 100;
}


function regulationBankScoreDebug(e, cap) {
  const breakdown = [];
  const push = (label, value, note) => breakdown.push({label, value, note});

  if (!e.regulationIntensity) {
    return { score: 0, breakdown: [{label:'No intensity set yet', value: null, note:'Select "How was it overall" to see impact'}] };
  }

  const level    = e.regulationIntensity;
  const actLabel = WOBBLE_INTENSITY.find(x=>x.val===level)?.label || level;
  const res      = e.regulationResolution;
  const resLabel = WOBBLE_RESOLUTION.find(x=>x.val===res)?.label || '—';
  const isRelational = e.regulationTrigger === 'relational';

  const resM = res === 'resolved'    ? 0.20
             : res === 'coming-down' ? 0.40
             : res === 'still-on'    ? 0.60
             : res === 'no-better'   ? 0.80
             : res === 'heavier'     ? 1.00
             :                        0.60;

  // All wobble scores personal only — relational trigger just provides context, not relational balance impact
  push('Relational balance impact', null, isRelational
    ? 'No effect on relational balance — log a separate conflict entry if the wobble crossed into conflict'
    : 'No effect — wobble scores Personal only');
  push('W  Intensity', level, `"${actLabel}" — how bad was it overall, 1-5`);
  push('R  Resolution', resM, res
    ? `"${resLabel}" — At peace ×0.20 to Heavier ×1.00`
    : 'No selection — default ×0.60');
  push('C  Day capacity (inverse)', +(1/cap).toFixed(3), 'Inverse cap — bad day = higher cost');
  const restoreImpact = wobbleRestoreScore(e, cap);
  push('Personal gauge cost', +restoreImpact.toFixed(1), '-(I × R × 1/C) / 5 × 100 — counts against Personal gauge only');
  return { score: 0, balanceScore: 0, restoreScore: restoreImpact, breakdown };
}


function deriveCaretakerWeight(type) {
  // Geometric mean of 5 profile dimensions (1-5 each)
  // Returns raw geomean (1-5 range) — normalized at score time: (raw × S × T × D × R × C) / 5 × 100
  const product = (type.ctPhysical||1) * (type.ctEmotional||1) * (type.ctCognitive||1) *
                  (type.ctTime||1) * (type.ctPredictability||1);
  return Math.pow(product, 1/5);
}

function deriveActivityWeight(type) {
  const isPhys = type.physIntentionality != null;

  // ── Geometric mean of 5 profile dimensions (1-5 each) ──
  let geoMean;
  if (isPhys) {
    const product = (type.physIntentionality||1) * (type.physEnergy||1) * (type.physDesire||1) *
                    (type.physNovelty||1) * (type.physSetting||1);
    geoMean = Math.pow(product, 1/5);
  } else {
    const product = (type.descEffort||1) * (type.descTime||1) * (type.descFinancial||1) *
                    (type.descRarity||1) * (type.descPresence||1);
    geoMean = Math.pow(product, 1/5);
  }

  // ── Needs weight (0-1) from love needs profile × personal ranking ──
  const needsMap = type.needsMap || {};
  let needsScore = 0;
  S.needsRanking.forEach((val, idx) => {
    const rankWeight = 10 - idx;               // rank#1 = weight 10, rank#10 = weight 1
    const rating = Math.max(0, (needsMap[val] || 1) - 1); // None(1)→0, Significant(5)→4
    needsScore += rating * rankWeight;
  });
  const needsWeight = needsScore / 220;        // max = 4 × 55 = 220

  // Return raw geomean × needsWeight (not yet normalized)
  // Full normalization happens at score time: (raw × C × R) / SCORE_MAX_RAW × 100
  return geoMean * needsWeight;
}

// Derives personal needs weight (0-1) for restore types from personal needs ranking.
// Mirrors deriveActivityWeight's needs_weight but uses personalNeedsRanking and PERSONAL_NEEDS.
// Max score = 4 × sum(1..10) = 4 × 55 = 220
// Derives restore activity weight using the same formula as bonding/physical
// but using personalNeedsRanking + PERSONAL_NEEDS instead of love needs.
function deriveRestoreWeight(type) {
  // W = geomean of 4 activity profile dims (effort, time, cost, access)
  const product = (type.descEffort||1) * (type.descTime||1) * (type.descFinancial||1) *
                  (type.descRarity||1);
  const geoMean = Math.pow(product, 1/4);

  // PN weight from personal needs ranking
  const pnWeight = derivePersonalNeedsWeight(type.needsMap || {});

  return geoMean * pnWeight;
}

function derivePersonalNeedsWeight(needsMap) {
  const map = needsMap || {};
  let score = 0;
  S.personalNeedsRanking.forEach((val, idx) => {
    const rankWeight = 10 - idx;                         // rank#1 = 10, rank#10 = 1
    const rating = Math.max(0, (map[val] || 1) - 1);    // None(1)→0, Max(5)→4
    score += rating * rankWeight;
  });
  return score / 220;                                    // max = 4 × 55 = 220
}

// Social activity weight — mirrors deriveActivityWeight but uses
// socialNeedsRanking + SOCIAL_NEEDS keys instead of EN. Used for Social
// activities in Individual mode, which score against the Social balance
// (a third axis separate from Relational and Personal).
function deriveSocialActivityWeight(type) {
  // Same 5 profile dimensions as bonding (effort/time/depth-via-descFinancial/significance/presence)
  const product = (type.descEffort||1) * (type.descTime||1) * (type.descFinancial||1) *
                  (type.descRarity||1) * (type.descPresence||1);
  const geoMean = Math.pow(product, 1/5);

  // SN weight from social needs ranking
  const needsMap = type.needsMap || {};
  let needsScore = 0;
  (S.socialNeedsRanking || []).forEach((val, idx) => {
    const rankWeight = 10 - idx;
    const rating = Math.max(0, (needsMap[val] || 1) - 1);
    needsScore += rating * rankWeight;
  });
  const needsWeight = needsScore / 220;

  return geoMean * needsWeight;
}


function computeLoveBankScore(entries) {
  // Cache the allEntries result within a render cycle to avoid recomputing 3x per render
  if (entries === S.allEntries && S._loveBankCache) return S._loveBankCache;
  const byDate = {};
  for (const e of entries) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  const dates = Object.keys(byDate).sort();
  if (!dates.length) return [];

  const allDays = [];
  let cur = dates[0], last = S.today;
  while (cur <= last) { allDays.push(cur); cur = addDays(cur, 1); }

  let balance = 0;
  const timeline = [];

  for (const d of allDays) {
    const es  = byDate[d] || [];
    const le  = es.find(e => e.category === 'libido');
    const cap = bankDayCap(le);
    // Personal capacity — stored for calibration chart
    const pc = le ? bankDayCap(le) : null;

    let delta = 0;
    let dayDeposits = 0, dayWithdrawals = 0;
    for (const e of es) {
      const s = bankScoreEntry(e, cap).score;
      delta += s;
      if (s > 0) dayDeposits += s;
      else if (s < 0) dayWithdrawals += s;
    }

    const scaleFactor = Math.max(0, 1 - Math.abs(balance) / S.weights.cap7);
    const scaledDelta = delta * scaleFactor;
    balance += scaledDelta;
    balance  = Math.max(-S.weights.cap7, Math.min(S.weights.cap7, balance));
    timeline.push({
      date:        d,
      balance:     Math.round(balance * 10) / 10,
      delta:       Math.round(scaledDelta * 10) / 10,
      raw:         Math.round(delta * 10) / 10,
      deposits:    Math.round(dayDeposits * 10) / 10,
      withdrawals: Math.round(dayWithdrawals * 10) / 10,
      libido:  le ? le.libiLevel : null,
      mood:    le ? (le.mood ?? null) : null,
      energy:  le ? (le.energy ?? null) : null,
      pc:      pc !== null ? Math.round(pc * 10) / 10 : null,
      cap:     Math.round(cap * 100) / 100,
    });
  }
  if (entries === S.allEntries) S._loveBankCache = timeline;
  return timeline;
}

