'use strict';

/* ── Love Bank ──────────────────────────────────────── */
// Builds typed deposit/withdrawal pills for the balance gauges.
// Returns a two-column layout: withdrawals left, deposits right, each stack-ranked by magnitude.
// gaugeType: 'relational' | 'personal' | 'combined'
function buildTypedPills(winEntries, gaugeType) {
  const buckets = {};
  const wDays = S.loveBankWindow != null ? Number(S.loveBankWindow) : 7;
  const add = (key, label, color, score) => {
    if (!buckets[key]) buckets[key] = { label, color, total: 0 };
    buckets[key].total += score;
  };

  // Experimental mode draws from every entry and uses power-law remaining;
  // legacy mode draws from the window and uses exponential decay.
  const useExp        = S.useExperimentalScoring;
  const sourceEntries = useExp ? calcEntries() : winEntries;
  const applyDecay    = (raw, daysAgo) => useExp
    ? expRemaining(raw, daysAgo)
    : raw * Math.pow(1 - S.weights.decay, daysAgo);

  for (const e of sourceEntries) {
    const cap = bankDayCap(sourceEntries.find(le => le.date === e.date && le.category === 'libido'));
    const daysAgo = daysBetween(e.date, S.today);

    if (gaugeType === 'relational' || gaugeType === 'combined') {
      const { score } = bankScoreEntry(e, cap);
      if (score !== 0) {
        const ds = applyDecay(score, daysAgo);
        if (e.category === 'affection') {
          add('affection', '🩷 '+bondingLabel(), CAT_COLORS.affection, ds);
        } else if (e.category === 'physical' && !e.solo) {
          add('physical', '🌹 Intimacy', CAT_COLORS.physical, ds);
        } else if (e.category === 'conflict') {
          add('conflict', '⚡ Conflict', CAT_COLORS.conflict, ds);
        } else if (e.category === 'turndown' && S.showPhysical) {
          add('turndown', '🌒 Turn down', CAT_COLORS.turndown, ds);
        }
      }
    }

    if (gaugeType === 'personal' || gaugeType === 'combined') {
      if (e.category === 'restore') {
        const typeObj = S.restoreTypes.find(t => (typeof t==='string'?t:t.name) === e.eventType);
        const s = applyDecay(restoreScore(e, typeObj, cap), daysAgo);
        if (s !== 0) add('restore', '🌊 Restore', CAT_COLORS.restore, s);
      }
      if (e.category === 'regulation' && S.showRegulation) {
        const s = applyDecay(wobbleRestoreScore(e, cap), daysAgo);
        if (s !== 0) add('wobble', '🫧 Wobble', CAT_COLORS.regulation, s);
      }
      if (e.category === 'burnout' && S.showCaretaker) {
        const s = applyDecay(caretakerPersonalScore(e, cap), daysAgo);
        if (s !== 0) add('burnout', '🕯️ Steadying', CAT_COLORS.burnout, s);
      }
    }
  }

  const wdrs = Object.values(buckets).filter(b => b.total < 0).sort((a,b) => a.total - b.total);
  const deps = Object.values(buckets).filter(b => b.total > 0).sort((a,b) => b.total - a.total);

  if (wdrs.length === 0 && deps.length === 0) return null;

  const pill = (b) => {
    const isPos = b.total > 0;
    const val = (Math.round(Math.abs(b.total) * 10) / 10).toFixed(1);
    const name  = b.label.replace(/^[^ ]+ /, ''); // strip emoji
    return h('div',{style:{
      display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'4px 0', borderBottom:'1px solid var(--surface-1)',
    }},
      h('span',{style:{fontSize:'11px', color:'var(--muted)'}}, b.label),
      h('span',{style:{
        fontSize:'12px', fontFamily:"'Libre Baskerville',serif",
        color: b.color, flexShrink:'0', marginLeft:'8px',
      }}, (isPos ? '+' : '−') + val)
    );
  };

  const col = (items, side) => items.length === 0 ? h('div',{style:{flex:'1'}}) : h('div',{style:{
    flex:'1',
    background: side === 'left' ? 'rgba(224,53,53,0.05)' : 'rgba(77,196,120,0.06)',
    border: side === 'left' ? '1px solid rgba(224,53,53,0.12)' : '1px solid rgba(77,196,120,0.14)',
    borderRadius:'10px', padding:'6px 10px',
  }}, ...items.map(pill));

  return h('div',{style:{display:'flex', gap:'8px', marginTop:'10px'}},
    col(wdrs, 'left'),
    col(deps, 'right')
  );
}

function compute7DayWindowTenor(refDate, byDate) {
  const decay = S.weights.decay || 0.05;
  let relational = 0, personal = 0;
  for (let i = 0; i < 7; i++) {
    const d  = addDays(refDate, -i);
    const es = byDate[d] || [];
    if (!es.length) continue;
    const w   = Math.pow(1 - decay, i);
    const cap = bankDayCap(es.find(e => e.category === 'libido'));
    for (const e of es) relational += bankScoreEntry(e, cap).score * w;
    for (const e of es) {
      if (e.category === 'restore') { const t = S.restoreTypes.find(x => (typeof x==='string'?x:x.name) === e.eventType); personal += restoreScore(e, t, cap) * w; }
      else if (e.category === 'regulation') personal += wobbleRestoreScore(e, cap) * w;
      else if (e.category === 'burnout')    personal += caretakerPersonalScore(e, cap) * w;
    }
  }
  return (relational + personal) / 2;
}

function computeBaseTenorData() {
  const SMOOTHING_TARGET = 2 / 29;
  const byDate = {};
  for (const e of calcEntries()) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  const startDates = Object.keys(byDate).sort();
  if (!startDates.length) return null;
  // Cap iteration to the chart's visible 60-day window — anything older isn't rendered,
  // so computing it is wasted work.
  const chartStart = addDays(S.today, -59);
  const firstDay   = startDates[0] > chartStart ? startDates[0] : chartStart;
  const allDays = [];
  let cur = firstDay;
  while (cur <= S.today) { allDays.push(cur); cur = addDays(cur, 1); }
  let baseTenor = null;
  const fullSeries = [];
  const useExp = S.useExperimentalScoring;
  for (const d of allDays) {
    // Experimental mode: lifetime sum as-of d (uses power-law decay with cutoff).
    // Legacy mode: 7-day windowed tenor anchored to d.
    const tenor = useExp ? computeExperimentalScores(d).tenor : compute7DayWindowTenor(d, byDate);
    const dayIndex = fullSeries.length + 1; // 1-based
    const alpha = Math.max(SMOOTHING_TARGET, 2 / (dayIndex + 1));
    baseTenor = baseTenor === null ? tenor : baseTenor * (1 - alpha) + tenor * alpha;
    fullSeries.push({ date: d, tenor: Math.round(tenor * 10) / 10, base: Math.round(baseTenor * 10) / 10 });
  }
  const series = fullSeries.filter(p => p.date >= chartStart);
  return { baseTenor: Math.round((baseTenor ?? 0) * 10) / 10, series };
}

function buildLoveBankPanel() {
  const timeline = computeLoveBankScore(calcEntries());
  if (!timeline.length) return h('div',{class:'balance-widget'},
    h('div',{class:'ins-empty',style:{marginTop:'60px'}},'No entries yet.\nStart logging to see your relational balance.'));

  const wDays = S.loveBankWindow != null ? Number(S.loveBankWindow) : 7;

  const windowDefs = [
    {val:7,  label:'7 Days'},
    {val:30, label:'30 Days'},
    {val:60, label:'60 Days'},
  ];

  // Window entries — today-inclusive so freshly logged entries show up immediately
  const windowStart = addDays(S.today, -(wDays - 1));
  const winEntries  = calcEntries().filter(e => e.date >= windowStart && e.date <= S.today);

  const winByDate = {};
  for (const e of winEntries) {
    if (!winByDate[e.date]) winByDate[e.date] = [];
    winByDate[e.date].push(e);
  }

  let windowBalance = 0;
  let windowBalanceDecayed = 0;
  let deposits = 0, withdrawals = 0;
  const scoredItems = [];

  for (const [date, dayEs] of Object.entries(winByDate)) {
    const le  = dayEs.find(e => e.category === 'libido');
    const cap = bankDayCap(le);
    const daysAgo = daysBetween(date, S.today);
    const decayWeight = Math.pow(1 - S.weights.decay, daysAgo);
    let dayDelta = 0;
    for (const e of dayEs) {
      const { score, color, label } = bankScoreEntry(e, cap);
      dayDelta += score;
      if (score !== 0) {
        scoredItems.push({ score: Math.round(score * 10) / 10, color, label, date });
        if (score > 0) deposits    += score;
        else           withdrawals += score;
      }
    }
    windowBalance += dayDelta;
    windowBalanceDecayed += dayDelta * decayWeight;
  }
  windowBalance = Math.round(windowBalance * 10) / 10;
  windowBalanceDecayed = Math.round(windowBalanceDecayed * 10) / 10;
  let windowGaugeValue = windowBalanceDecayed;
  scoredItems.sort((a, b) => b.score - a.score);

  // ── Personal window gauge ──────────────────────────
  const perWindowRaw = winEntries
    .filter(e => e.category === 'restore' || e.category === 'regulation' || e.category === 'burnout')
    .reduce((s,e) => {
      const cap = bankDayCap(winEntries.find(le => le.date === e.date && le.category === 'libido'));
      const daysAgo = daysBetween(e.date, S.today);
      const decayWeight = Math.pow(1 - S.weights.decay, daysAgo);
      if (e.category === 'restore') { const t=S.restoreTypes.find(x=>(typeof x==='string'?x:x.name)===e.eventType); return s+restoreScore(e,t,cap)*decayWeight; }
      if (e.category === 'regulation') return s + wobbleRestoreScore(e, cap)*decayWeight;
      if (e.category === 'burnout')    return s + caretakerPersonalScore(e, cap)*decayWeight;
      return s;
    }, 0);
  let perWindowGauge = Math.round(perWindowRaw * 10) / 10;

  // Combined: relational balance + all personal costs (wobble + all steadying + restore)
  const perWindowForCombined = winEntries
    .filter(e => e.category === 'restore' || e.category === 'regulation' || e.category === 'burnout')
    .reduce((s,e) => {
      const cap = bankDayCap(winEntries.find(le => le.date === e.date && le.category === 'libido'));
      const daysAgo = daysBetween(e.date, S.today);
      const decayWeight = Math.pow(1 - S.weights.decay, daysAgo);
      if (e.category === 'restore') { const t=S.restoreTypes.find(x=>(typeof x==='string'?x:x.name)===e.eventType); return s+restoreScore(e,t,cap)*decayWeight; }
      if (e.category === 'regulation') return s + wobbleRestoreScore(e, cap)*decayWeight;
      if (e.category === 'burnout')    return s + caretakerPersonalScore(e, cap)*decayWeight;
      return s;
    }, 0);
  let comWindowGauge = Math.round((windowGaugeValue + perWindowForCombined) / 2 * 10) / 10;

  // Experimental override: lifetime-sum gauges with power-law decay
  if (S.useExperimentalScoring) {
    const exp = computeExperimentalScores();
    windowGaugeValue = exp.rel;
    perWindowGauge   = exp.per;
    comWindowGauge   = exp.tenor;
  }

  const modeDecayed = S.gaugeMode === 'personal' ? perWindowGauge : S.gaugeMode === 'combined' ? comWindowGauge : windowGaugeValue;

  // Restore score for window — restore deposits, all wobble drain, all steadying drain
  const restoreTotal = winEntries
    .filter(e => e.category === 'restore' || e.category === 'regulation' || e.category === 'burnout')
    .reduce((sum, e) => {
      if (e.category === 'restore') {
        const typeObj = S.restoreTypes.find(t => (typeof t==='string'?t:t.name) === e.eventType);
        const cap = bankDayCap(winEntries.find(le => le.date === e.date && le.category === 'libido'));
        return sum + restoreScore(e, typeObj, cap);
      }
      const cap = bankDayCap(winEntries.find(le => le.date === e.date && le.category === 'libido'));
      if (e.category === 'regulation') return sum + wobbleRestoreScore(e, cap);
      if (e.category === 'burnout')    return sum + caretakerPersonalScore(e, cap);
      return sum;
    }, 0);

  const net7        = deposits + withdrawals;
  const periodLabel = S.useExperimentalScoring ? 'Lifetime (experimental)' : wDays === 7 ? 'Last 7 days' : wDays === 30 ? 'Last 30 days' : 'Last 60 days';

  const zones = getBounds(wDays);
  const zoneBg = b => {
    if (b >= zones.thriving)  return 'rgba(77,196,120,0.18)';
    if (b >= zones.stable)    return 'rgba(77,196,120,0.09)';
    if (b >= 0)               return 'rgba(210,160,40,0.12)';
    if (b >= zones.strained)  return 'rgba(224,130,40,0.14)';
    if (b >= zones.depleted)  return 'rgba(224,100,40,0.16)';
    return 'rgba(224,53,53,0.18)';
  };
  const band = b => b >= zones.thriving ? { label: 'Thriving', color: 'var(--c-partner)' }
                  : b >= zones.stable   ? { label: 'Healthy',     color: 'rgba(77,196,120,0.55)' }
                  : b >= 0              ? { label: 'Progressing', color: 'var(--c-burnout)' }
                  : b >= zones.strained ? { label: 'Unsettled',  color: 'rgba(210,130,50,1)' }
                  : b >= zones.depleted ? { label: 'Difficult',  color: 'var(--c-warning)' }
                  :                       { label: 'Hurting', color: 'var(--c-conflict)' };
  const { label: bLabel, color: bColor } = band(windowGaugeValue);

  // Chart uses windowed timeline slice
  const pts  = timeline.slice(-wDays);
  const hasL = S.showPhysical && pts.some(p => p.libido !== null);

  // Deposit and withdrawal series
  const depVals = pts.map(p => p.deposits    ?? 0);
  const wdrVals = pts.map(p => Math.abs(p.withdrawals ?? 0));

  // Y range covers both series plus zero
  const allYVals = [...depVals, ...wdrVals, 0];
  const bMax = Math.max(...allYVals) || 1;
  const bMin = 0;
  const bRng = bMax - bMin || 1;

  const W = 320, H = 100, PAD = 8;
  const xOf = i  => PAD + (i / Math.max(pts.length - 1, 1)) * (W - PAD * 2);
  const yOf = (v, mn, rng) => v == null ? null : H - PAD - ((v - mn) / rng) * (H - PAD * 2);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'display:block;width:100%;height:100px;';

  const makePath = (vals, color, dash) => {
    let path = '';
    vals.forEach((v, i) => {
      if (v === null) return;
      const y = pts.length === 1 ? H / 2 : yOf(v, bMin, bRng);
      if (y === null) return;
      path += (path === '' ? 'M' : 'L') + xOf(i).toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    if (!path || pts.length < 2) return;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('d', path.trim());
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', color);
    el.setAttribute('stroke-width', '2');
    el.setAttribute('stroke-linecap', 'round');
    if (dash) el.setAttribute('stroke-dasharray', dash);
    svg.appendChild(el);
  };

  makePath(depVals, 'var(--c-partner)', null);
  makePath(wdrVals, 'var(--c-conflict)', null);

  if (hasL) {
    let libiPath = '';
    pts.forEach((p, i) => {
      if (p.libido === null) return;
      const libiNorm = (p.libido - 1) / 6;
      const y = H - PAD - libiNorm * (H - PAD * 2);
      const x = xOf(i);
      // Always accumulate the path for the connecting line
      const isGap = !pts[i - 1] || pts[i - 1].libido === null;
      libiPath += (isGap ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
      // On short windows also draw dots + labels
      if (wDays <= 3) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x.toFixed(1));
        circle.setAttribute('cy', y.toFixed(1));
        circle.setAttribute('r', '4');
        circle.setAttribute('fill', 'var(--c-libido)');
        circle.setAttribute('opacity', '0.9');
        svg.appendChild(circle);
        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        txt.setAttribute('x', x.toFixed(1));
        txt.setAttribute('y', (y - 8).toFixed(1));
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', '9');
        txt.setAttribute('fill', 'var(--c-libido)');
        txt.textContent = p.libido + '/5';
        svg.appendChild(txt);
      }
    });
    if (libiPath) {
      const lp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      lp.setAttribute('d', libiPath.trim());
      lp.setAttribute('fill', 'none');
      lp.setAttribute('stroke', 'var(--c-libido)');
      lp.setAttribute('stroke-width', '1.5');
      lp.setAttribute('stroke-linecap', 'round');
      lp.setAttribute('stroke-dasharray', '4,3');
      svg.appendChild(lp);
    }
  }

  // Cap line — plotted normalised to its own 80%–120% range
  const hasC = pts.some(p => p.cap != null);
  if (hasC && pts.length > 1) {
    let capPath = '';
    pts.forEach((p, i) => {
      if (p.cap == null) return;
      // cap range 0.76–1.302 → normalise to 0–1 → map to chart height
      const capNorm = (p.cap - 0.76) / (1.302 - 0.76);
      const y = H - PAD - capNorm * (H - PAD * 2);
      const isGap = !pts[i - 1] || pts[i - 1].cap == null;
      capPath += (isGap ? 'M' : 'L') + xOf(i).toFixed(1) + ',' + y.toFixed(1) + ' ';
    });
    if (capPath) {
      const cp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      cp.setAttribute('d', capPath.trim());
      cp.setAttribute('fill', 'none');
      cp.setAttribute('stroke', 'var(--chart-cap)');
      cp.setAttribute('stroke-width', '1.5');
      cp.setAttribute('stroke-linecap', 'round');
      cp.setAttribute('stroke-dasharray', '2,4');
      svg.appendChild(cp);
    }
  }

  // Single-point fallback: draw a dot instead of a line
  if (pts.length === 1) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', (W / 2).toFixed(1));
    dot.setAttribute('cy', (H / 2).toFixed(1));
    dot.setAttribute('r', '5');
    dot.setAttribute('fill', bColor);
    svg.appendChild(dot);
  }

  // Stacked breakdown bar
  const totalDep = scoredItems.filter(i => i.score > 0).reduce((s, i) => s + i.score, 0) || 0;
  const totalWdr = Math.abs(scoredItems.filter(i => i.score < 0).reduce((s, i) => s + i.score, 0)) || 0;
  const totalAbs = totalDep + totalWdr || 1;
  const BAR_H = 60, BAR_W = 20;

  const barSegs = [];
  for (const item of scoredItems.filter(i => i.score > 0)) {
    barSegs.push(h('div', { style: {
      width: BAR_W + 'px', height: Math.max(2, Math.round(item.score / totalAbs * BAR_H)) + 'px',
      background: item.color, flexShrink: '0',
    }}));
  }
  if (totalDep > 0 && totalWdr > 0) {
    barSegs.push(h('div', { style: { width: BAR_W + 'px', height: '1px', background: 'var(--border-mid)', flexShrink: '0' }}));
  }
  for (const item of scoredItems.filter(i => i.score < 0)) {
    barSegs.push(h('div', { style: {
      width: BAR_W + 'px', height: Math.max(2, Math.round(Math.abs(item.score) / totalAbs * BAR_H)) + 'px',
      background: item.color, opacity: '0.7', flexShrink: '0',
    }}));
  }

  const breakdownBar = barSegs.length > 0 ? h('div', { style: {
    display: 'flex', flexDirection: 'column', width: BAR_W + 'px', height: BAR_H + 'px',
    borderRadius: '6px', overflow: 'hidden', flexShrink: '0',
  }}, ...barSegs) : null;

  return h('div',{class:'balance-widget'},

    // ── Hero — semicircular arc gauge ─────────────────
    h('div',{style:{
      position:'relative', overflow:'hidden',
      margin:'0 -16px', padding:'20px 24px 8px',
      background:`radial-gradient(ellipse at 50% 100%, ${bColor}18 0%, transparent 65%)`,
      borderBottom:'1px solid var(--surface-2)',
    }},

      // Window selector row — only shown in legacy mode (experimental has no window).
      S.useExperimentalScoring
        ? null
        : h('div',{style:{display:'flex',gap:'6px',marginBottom:'16px'}},
            ...windowDefs.map(w=>h('button',{
              style:{
                padding:'4px 12px', borderRadius:'20px', fontSize:'11px', cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif", letterSpacing:'0.04em',
                border: wDays===w.val ? `1px solid ${bColor}88` : '1px solid var(--border)',
                background: wDays===w.val ? bColor+'18' : 'transparent',
                color: wDays===w.val ? bColor : 'var(--muted)',
              },
              onclick:()=>{S.loveBankWindow=w.val;saveSettings();render();}
            },w.label))
          ),

      // ── Headline: "Emotional Tenor" ─────────────────────
      h('div',{style:{
        textAlign:'center',
        fontFamily:"'Libre Baskerville',serif",
        fontSize:'14px',
        fontStyle:'italic',
        color:'var(--muted)',
        letterSpacing:'0.02em',
        marginBottom:'10px',
      }}, 'Emotional Tenor'),

      // ── Triple-gauge overview ─────────────────────────

      (() => {
        const gaugeItems = [
          {label:'Relational', value:windowGaugeValue, gn:'tgNeg0', gp:'tgPos0'},
          {label:'Personal',   value:perWindowGauge,   gn:'tgNeg1', gp:'tgPos1'},
          {label:'Tenor',      value:comWindowGauge,   gn:'tgNeg2', gp:'tgPos2'},
        ];

        const makeMiniGauge = ({label, value, gn, gp}) => {
          const bInfo = band(value);
          const W = 120, H = 70, cx = 60, cy = 64, R = 47, r = 34;
          const startA = Math.PI, arcSpan = Math.PI;
          const toXY   = (a, rad) => ({x: cx + rad * Math.cos(a), y: cy - rad * Math.sin(a)});
          const pctToA = p => startA - p * arcSpan;
          const arcPath = (a0, a1, ro, ri) => {
            const o0=toXY(a0,ro),o1=toXY(a1,ro),i0=toXY(a1,ri),i1=toXY(a0,ri);
            const lg = Math.abs(a0-a1) > Math.PI ? 1 : 0;
            return `M${o0.x.toFixed(1)},${o0.y.toFixed(1)} A${ro},${ro} 0 ${lg},1 ${o1.x.toFixed(1)},${o1.y.toFixed(1)} L${i0.x.toFixed(1)},${i0.y.toFixed(1)} A${ri},${ri} 0 ${lg},0 ${i1.x.toFixed(1)},${i1.y.toFixed(1)} Z`;
          };
          const mk = (tag, attrs) => {
            const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
            Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
            return el;
          };
          const pct = Math.max(0, Math.min(1, 0.5 + value / zones.cap * 0.5));

          const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
          svgEl.style.cssText = 'display:block;width:100%;height:auto;';

          svgEl.appendChild(mk('path', {d:arcPath(startA, 0, R, r), fill:'var(--surface-1)'}));

          const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          const mkGrad = (id, stops) => {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
            g.setAttribute('id',id); g.setAttribute('x1','0%'); g.setAttribute('y1','0%');
            g.setAttribute('x2','100%'); g.setAttribute('y2','0%');
            stops.forEach(([off, color]) => {
              const s = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
              s.setAttribute('offset',off); s.setAttribute('stop-color',color); g.appendChild(s);
            });
            defs.appendChild(g);
          };
          mkGrad(gn, [['0%','rgba(224,53,53,0.95)'],['30%','rgba(224,53,53,0.95)'],['100%','rgba(210,160,40,0.95)']]);
          mkGrad(gp, [['0%','rgba(210,160,40,0.95)'],['70%','rgba(77,196,120,0.95)'],['100%','rgba(77,196,120,0.95)']]);
          svgEl.appendChild(defs);

          [{from:0.00,to:0.50,fill:`url(#${gn})`},{from:0.50,to:1.00,fill:`url(#${gp})`}]
            .forEach(b => svgEl.appendChild(mk('path',{d:arcPath(pctToA(b.from),pctToA(b.to),R,r),fill:b.fill})));

          const ntip = toXY(pctToA(pct), R - 4);
          svgEl.appendChild(mk('line',{x1:String(cx),y1:String(cy),x2:ntip.x.toFixed(1),y2:ntip.y.toFixed(1),stroke:'var(--text-strong)','stroke-width':'2','stroke-linecap':'round'}));
          svgEl.appendChild(mk('circle',{cx:String(cx),cy:String(cy),r:'5',fill:'var(--bg2)',stroke:'var(--pivot-stroke)','stroke-width':'1.5'}));

          return h('div',{style:{flex:'1',textAlign:'center',background:zoneBg(value),borderRadius:'10px',padding:'6px 4px 8px'}},
            h('div',{style:{fontSize:'11px',color:'var(--text-strong)',fontWeight:'400',marginBottom:'2px'}},
              label),
            svgEl,
            h('div',{style:{fontFamily:"'Libre Baskerville',serif",fontSize:'26px',fontWeight:'400',color:'var(--text-strong)',lineHeight:'1',margin:'6px 0 4px'}},
              (value>=0?'+':'')+value.toFixed(1)),
            h('div',{style:{fontSize:'12px',fontWeight:'700',letterSpacing:'0.04em',color:'var(--text-strong)',marginTop:'2px'}},
              bInfo.label),
          );
        };

        return h('div',{style:{display:'flex',gap:'6px'}},
          ...gaugeItems.map(makeMiniGauge)
        );
      })(),

      (() => buildTypedPills(winEntries, 'combined'))(),

      (() => {
        const btd = computeBaseTenorData();
        if (!btd) return null;
        const { baseTenor, series } = btd;
        const baseColor = baseTenor > 0 ? 'var(--c-partner)' : baseTenor < 0 ? 'var(--c-conflict)' : 'var(--muted)';

        // SVG line chart — fixed 60-day x-axis, y-axis with labels
        const W = 280, H = 96;
        const padL = 32, padR = 6, padT = 6, padB = 18;
        const plotW = W - padL - padR;
        const plotH = H - padT - padB;
        const chartStart = addDays(S.today, -59);

        const allVals = [...series.map(p => p.tenor), ...series.map(p => p.base), 0];
        const rawMin = Math.min(...allVals);
        const rawMax = Math.max(...allVals);
        const rawRange = rawMax - rawMin || 1;
        const roughStep = rawRange / 3;
        const mag = Math.pow(10, Math.floor(Math.log10(roughStep || 1)));
        const yStep = Math.max(Math.ceil(roughStep / mag) * mag, 1);
        const tickMin = Math.floor(rawMin / yStep) * yStep;
        const tickMax = Math.ceil(rawMax / yStep) * yStep;
        const yTicks = [];
        for (let t = tickMin; t <= tickMax + 0.01; t += yStep) yTicks.push(Math.round(t));
        const domMin = tickMin - yStep * 0.2;
        const domMax = tickMax + yStep * 0.2;
        const rangeV = domMax - domMin || 1;

        const xOf = d => padL + (daysBetween(chartStart, d) / 59) * plotW;
        const yOf = v => padT + plotH - ((v - domMin) / rangeV) * plotH;
        const ptsTenor = series.map(p => `${xOf(p.date).toFixed(1)},${yOf(p.tenor).toFixed(1)}`).join(' ');
        const ptsBase  = series.map(p => `${xOf(p.date).toFixed(1)},${yOf(p.base).toFixed(1)}`).join(' ');

        const mk  = (tag, attrs) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v)); return el; };
        const txt = (content, attrs) => { const el = mk('text', attrs); el.textContent = content; return el; };

        const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svgEl.style.cssText = 'display:block;width:100%;height:auto;overflow:visible;';

        // Axes
        svgEl.appendChild(mk('line', {x1:padL, y1:padT, x2:padL, y2:padT+plotH, stroke:'var(--border)', 'stroke-width':'0.8'}));
        const zeroY = yOf(0);
        const xAxisY = (zeroY >= padT && zeroY <= padT + plotH) ? zeroY : padT + plotH;
        svgEl.appendChild(mk('line', {x1:padL, y1:xAxisY.toFixed(1), x2:padL+plotW, y2:xAxisY.toFixed(1), stroke:'var(--border)', 'stroke-width':'0.8'}));

        // Y ticks + labels
        for (const t of yTicks) {
          const ty = yOf(t);
          if (ty < padT - 2 || ty > padT + plotH + 2) continue;
          svgEl.appendChild(mk('line', {x1:padL-3, y1:ty.toFixed(1), x2:padL, y2:ty.toFixed(1), stroke:'var(--border)', 'stroke-width':'0.8'}));
          svgEl.appendChild(txt(t === 0 ? '0' : (t > 0 ? '+' : '') + t, {x:String(padL - 5), y:ty.toFixed(1), 'text-anchor':'end', 'dominant-baseline':'middle', 'font-size':'8', fill:'var(--muted)', 'font-family':"'DM Sans',sans-serif"}));
        }

        // X labels
        svgEl.appendChild(txt(fmtS(chartStart), {x:String(padL), y:String(padT + plotH + 12), 'text-anchor':'start', 'font-size':'8', fill:'var(--muted)', 'font-family':"'DM Sans',sans-serif"}));
        svgEl.appendChild(txt('Today', {x:String(padL + plotW), y:String(padT + plotH + 12), 'text-anchor':'end', 'font-size':'8', fill:'var(--muted)', 'font-family':"'DM Sans',sans-serif"}));

        // Data lines — Tenor (thin/muted), Base Tenor (bold 4-week EMA)
        svgEl.appendChild(mk('polyline', {points:ptsTenor, fill:'none', stroke:'var(--muted-3)', 'stroke-width':'1',   'stroke-linecap':'round', 'stroke-linejoin':'round', opacity:'0.55'}));
        svgEl.appendChild(mk('polyline', {points:ptsBase,  fill:'none', stroke:baseColor,        'stroke-width':'2',   'stroke-linecap':'round', 'stroke-linejoin':'round'}));
        if (series.length) {
          const last = series[series.length - 1];
          svgEl.appendChild(mk('circle', {cx:xOf(last.date).toFixed(1), cy:yOf(last.base).toFixed(1), r:'3.5', fill:baseColor}));
        }

        return h('div',{style:{marginTop:'10px', padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px'}},
          wDays === 7
            ? h('div',{style:{textAlign:'right', marginBottom:'8px'}},
                h('div',{style:{fontSize:'10px', fontWeight:'600', letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--muted)', marginBottom:'2px'}}, 'Base Tenor'),
                h('div',{style:{fontFamily:"'Libre Baskerville',serif", fontSize:'26px', fontWeight:'400', color:baseColor, lineHeight:'1'}},
                  (baseTenor >= 0 ? '+' : '') + baseTenor.toFixed(1)),
              )
            : null,
          wDays === 7
            ? h('div',{},
                svgEl,
                h('div',{style:{display:'flex', gap:'14px', marginTop:'8px'}},
                  h('div',{style:{display:'flex', alignItems:'center', gap:'5px'}},
                    h('div',{style:{width:'20px', height:'2px', borderRadius:'1px', background:'var(--muted-3)', opacity:'0.7'}}),
                    h('span',{style:{fontSize:'10px', color:'var(--muted)'}}, 'Tenor'),
                  ),
                  h('div',{style:{display:'flex', alignItems:'center', gap:'5px'}},
                    h('div',{style:{width:'20px', height:'2.5px', borderRadius:'1px', background:baseColor}}),
                    h('span',{style:{fontSize:'10px', color:'var(--muted)'}}, 'Base Tenor'),
                  ),
                ),
              )
            : h('div',{style:{height:'96px', display:'flex', alignItems:'center', justifyContent:'center'}},
                h('span',{style:{fontSize:'11px', color:'var(--muted)', fontStyle:'italic'}}, 'Chart available in 7-day view')
              ),
          h('div',{style:{fontSize:'11px', color:'var(--muted)', marginTop:'8px', lineHeight:'1.6'}},
            'Base Tenor is your emotional baseline — where your relationship and inner life typically sit over the past month. It moves slowly, so when it shifts, something has genuinely changed.'
          ),
        );
      })(),

      S.showDebug ? h('div',{style:{
        marginTop:'12px', padding:'10px 12px', borderRadius:'10px',
        background:'var(--surface-1)', border:'1px solid var(--surface-2)',
        fontSize:'11px', fontFamily:"'DM Sans',sans-serif", color:'var(--muted)',
      }},
        h('div',{style:{fontWeight:'600',color:'var(--text-strong)',marginBottom:'8px'}},
          'Thresholds — ' + wDays + ' days · cap ±' + zones.cap),
        h('div',{style:{display:'flex',flexDirection:'column',gap:'2px'}},
          ...[
            'Thriving ≥ '  + zones.thriving,
            'Healthy ≥ '     + zones.stable,
            'Progressing ≥ 0',
            'Unsettled ≤ −1',
            'Difficult ≤ '  + zones.strained,
            'Hurting ≤ ' + zones.depleted,
          ].map(line => h('div',{style:{color:'var(--text-strong)'}}, line))
        ),
      ) : null,
    ),

  );
}
