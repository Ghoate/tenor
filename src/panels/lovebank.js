'use strict';

/* ── Love Bank ──────────────────────────────────────── */
// Builds typed deposit/withdrawal pills for the balance gauges.
// Returns a two-column layout: withdrawals left, deposits right, each stack-ranked by magnitude.
// gaugeType: 'relational' | 'personal' | 'combined'
function buildTypedPills(winEntries, gaugeType) {
  const buckets = {};
  const add = (key, label, color, score) => {
    if (!buckets[key]) buckets[key] = { label, color, total: 0 };
    buckets[key].total += score;
  };

  // Per-event decay for the bucket pills, using the scoring model's decay primitive.
  const sourceEntries = calcEntries();
  const applyDecay    = (raw, daysAgo) => expRemaining(raw, daysAgo);

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
  for (const d of allDays) {
    // Lifetime sum as-of d (via the active scoring model).
    const tenor = computeExperimentalScores(d).tenor;
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

  // Window entries used by the typed-pills breakdown below.
  const winEntries  = calcEntries().filter(e => e.date >= addDays(S.today, -6) && e.date <= S.today);

  // Gauges show lifetime sums via the active scoring model.
  const exp = computeExperimentalScores();
  const windowGaugeValue = exp.rel;
  const perWindowGauge   = exp.per;
  const comWindowGauge   = exp.tenor;

  const zones = getBounds();
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
  const bColor = band(windowGaugeValue).color;

  return h('div',{class:'balance-widget'},

    // ── Hero — semicircular arc gauge ─────────────────
    h('div',{style:{
      position:'relative', overflow:'hidden',
      margin:'0 -16px', padding:'20px 24px 8px',
      background:`radial-gradient(ellipse at 50% 100%, ${bColor}18 0%, transparent 65%)`,
      borderBottom:'1px solid var(--surface-2)',
    }},

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
          h('div',{style:{textAlign:'right', marginBottom:'8px'}},
            h('div',{style:{fontSize:'10px', fontWeight:'600', letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--muted)', marginBottom:'2px'}}, 'Base Tenor'),
            h('div',{style:{fontFamily:"'Libre Baskerville',serif", fontSize:'26px', fontWeight:'400', color:baseColor, lineHeight:'1'}},
              (baseTenor >= 0 ? '+' : '') + baseTenor.toFixed(1)),
          ),
          h('div',{},
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
          'Thresholds — cap ±' + zones.cap),
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
