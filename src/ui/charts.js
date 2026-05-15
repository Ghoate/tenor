'use strict';

/* ── Bar chart builder ──────────────────────────────── */
function buildBarChart(title, weeks, series) {
  // Start at first week with data — no empty leading buffer
  const firstWithData = weeks.findIndex(wk => series.some(sr => sr.getValue(wk.entries) > 0));
  const visWeeks = firstWithData <= 0 ? weeks : weeks.slice(firstWithData);

  const maxVal = Math.max(1, ...visWeeks.map(wk => series.reduce((s, sr) => s + sr.getValue(wk.entries), 0)));

  const fmtWkLabel = ds => {
    const [,m,d] = ds.split('-');
    const MONS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return MONS[+m] + ' ' + String(+d);
  };

  const cols = visWeeks.map((wk, i) => {
    const vals = series.map(sr => sr.getValue(wk.entries));
    const total = vals.reduce((a,b)=>a+b,0);
    const heightPct = total / maxVal * 100;
    const segs = series.map((sr, j) => {
      const h2 = total > 0 ? vals[j] / total * heightPct : 0;
      return h2 > 0 ? h('div',{class:'bar-seg',style:{height:h2+'%',background:sr.color}}) : null;
    }).filter(Boolean);
    const showLbl = visWeeks.length <= 5 ? true : (i === 0 || i === visWeeks.length - 1 || i === Math.floor(visWeeks.length / 2));
    const count = series[0].getCount ? series.reduce((s,sr)=>s+sr.getCount(wk.entries),0) : null;
    return h('div',{class:'bar-col'},
      count > 0 ? h('span',{style:{fontSize:'9px',color:'var(--muted)',marginBottom:'2px'}},count) : h('span',{style:{fontSize:'9px'}},' '),
      h('div',{class:'bar-stack',style:{height:Math.max(heightPct, total > 0 ? 4 : 0)+'%'}},...segs),
      h('span',{class:'bar-label',style:{marginTop:'3px'}}, showLbl ? fmtWkLabel(wk.start) : '')
    );
  });

  const legend = series.map(sr =>
    h('div',{class:'line-legend-item'},
      h('div',{class:'line-legend-dot',style:{background:sr.color,width:'10px',height:'10px',borderRadius:'3px'}}),
      sr.label
    )
  );

  return h('div',{class:'bar-chart'},
    h('div',{class:'line-chart-title',style:{flexWrap:'wrap',gap:'6px'}},
      h('span',{},title),
      h('div',{class:'line-legend',style:{flexWrap:'wrap',gap:'8px'}},...legend)
    ),
    visWeeks.length === 0
      ? h('div',{class:'ins-empty',style:{padding:'16px'}},'No data in this window yet.')
      : h('div',{class:'bar-chart-inner'},...cols)
  );
}

/* ── SVG sparkline (single series) ─────────────────── */
function buildSparkline(points, key, color, yMin, yMax, neutralVal) {
  const W = 320, H = 44, PAD = 4;
  const n = points.length;
  if (n < 2) return null;

  const xOf = i => PAD + (i / (n-1)) * (W - PAD*2);
  const yOf = v => v == null ? null : H - PAD - ((v - yMin) / (yMax - yMin)) * (H - PAD*2);

  // Build path, skipping nulls
  let d = '';
  points.forEach((p, i) => {
    const y = yOf(p[key]);
    if (y == null) return;
    d += (d === '' ? 'M' : 'L') + xOf(i).toFixed(1) + ',' + y.toFixed(1) + ' ';
  });

  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio','none');
  svg.style.cssText = 'display:block;width:100%;height:44px;';

  // Neutral dashed line
  if (neutralVal != null) {
    const ny = yOf(neutralVal);
    const nl = document.createElementNS('http://www.w3.org/2000/svg','line');
    nl.setAttribute('x1',PAD); nl.setAttribute('x2',W-PAD);
    nl.setAttribute('y1',ny);  nl.setAttribute('y2',ny);
    nl.setAttribute('stroke','var(--border-mid)');
    nl.setAttribute('stroke-width','1');
    nl.setAttribute('stroke-dasharray','3,3');
    svg.appendChild(nl);
  }

  if (d) {
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', d);
    path.setAttribute('fill','none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width','1.5');
    path.setAttribute('stroke-linecap','round');
    path.setAttribute('stroke-linejoin','round');
    svg.appendChild(path);
  }

  return svg;
}

/* ── Stacked libido/mood/energy chart ───────────────── */
function buildLibidoChart(points) {
  if (points.length < 2) return h('div',{class:'ins-empty',style:{padding:'16px'}},'Log mood & energy on 2+ days to see the trend.');

  const allRows = [
    {key:'mood',   color:'#e8b87a',          label:'Mood',    unit:'/5', yMin:1, yMax:5, neutral:3},
    {key:'energy', color:'#7ab8e8',           label:'Energy',  unit:'/5', yMin:1, yMax:5, neutral:3},
    {key:'libi',   color:CAT_COLORS.libido,   label:'Desire',  unit:'/5', yMin:1, yMax:5, neutral:3},
  ];
  const rows = S.showPhysical ? allRows : allRows.filter(r => r.key !== 'libi');
  const chartTitle = S.showPhysical ? 'Mood · Energy · Desire' : 'Mood · Energy';

  return h('div',{class:'line-chart'},
    h('div',{class:'line-chart-title'}, chartTitle),
    h('div',{},
      ...rows.map(r => {
        const spark = buildSparkline(points.map(p => ({
          // For mood/energy use raw values (un-normalised) on their own scale
          [r.key]: r.key==='libi' ? p.libi : r.key==='mood' ? (p.moodRaw ?? null) : (p.energyRaw ?? null)
        })), r.key, r.color, r.yMin, r.yMax, r.neutral);
        return h('div',{style:{marginBottom:'6px'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'2px'}},
            h('span',{style:{fontSize:'10px',letterSpacing:'0.06em',textTransform:'uppercase',color:r.color}}, r.label),
            h('span',{style:{fontSize:'10px',color:'var(--muted)'}}, r.unit+' · neutral = '+(r.neutral))
          ),
          spark || h('div',{style:{height:'44px',display:'flex',alignItems:'center',justifyContent:'center'}},
            h('span',{style:{fontSize:'11px',color:'var(--muted)',fontStyle:'italic'}},'No data'))
        );
      })
    )
  );
}

