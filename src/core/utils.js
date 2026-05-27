'use strict';

// Resolve a sub/hint value — handles both static strings and () => string functions
function resolveSub(val) { return typeof val === 'function' ? val() : (val || ''); }

// ── Tenor zone bounds ────────────────────────────────────
// Derives zone thresholds for any window from the three 7-day anchors in S.weights.
// Negative boundaries mirror positive ones exactly.
function getBounds(days) {
  const decay = S.weights.decay || 0.05;
  const wSum  = (n) => { let s=0; for(let d=0;d<n;d++) s+=Math.pow(1-decay,d); return s; };
  const ratio = wSum(days) / wSum(7);
  const stable   = Math.round((S.weights.stable7   || 40)  * ratio);
  const thriving = Math.round((S.weights.thriving7  || 80)  * ratio);
  const cap      = Math.round((S.weights.cap7       || 240) * ratio);
  return { cap, thriving, stable, neutral:0, strained:-stable, depleted:-thriving, critical:-cap };
}

// Returns entries that are still meaningfully contributing right now under
// the experimental decay model — i.e. those whose decayed score has not yet
// faded to zero. Used by the threshold observations on the Insights page so
// "what's going on right now" reflects what's still alive, not a hard
// calendar window. For categories without a scoring path (libido, notes,
// repair), falls back to a 30-day recency window so observations that
// reference them still get a fresh frame.
function aliveEntries(refDate) {
  const ref = refDate || S.today;
  const src = calcEntries();
  const byDate = {};
  for (const e of src) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  const capCache = {};
  const getCap = (date) => {
    if (date in capCache) return capCache[date];
    const dayEs = byDate[date] || [];
    return capCache[date] = bankDayCap(dayEs.find(le => le.category === 'libido'));
  };
  return src.filter(e => {
    if (e.date > ref) return false;
    const daysAgo = daysBetween(e.date, ref);
    const { rel, per } = expEntryScores(e, getCap(e.date));
    if (rel !== 0 || per !== 0) {
      if (rel !== 0 && expRemaining(rel, daysAgo) !== 0) return true;
      if (per !== 0 && expRemaining(per, daysAgo) !== 0) return true;
      return false;
    }
    return daysAgo <= 30;
  });
}

function dateStr(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function fmtDate(s) {
  const [y,m,d]=s.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
}
function addDays(ds, n) {
  const [y,m,d]=ds.split('-').map(Number);
  const dt=new Date(y,m-1,d);
  dt.setDate(dt.getDate()+n);
  return dateStr(dt);
}
function daysBetween(a, b) {
  const parse = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
  return Math.round((parse(b)-parse(a))/(1000*60*60*24));
}

// Calculation-scoped entries: respects the debug "calc start date" filter.
// Visual surfaces (calendar dots, day panel) keep reading S.allEntries directly so
// the user can still see and edit historical entries — only aggregations are filtered.
function calcEntries() {
  return S.calcStartDate
    ? S.allEntries.filter(e => e.date >= S.calcStartDate)
    : S.allEntries;
}
// Short display date e.g. "Apr 1"
function fmtS(ds) {
  const [,m,d] = ds.split('-');
  return ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m]+' '+String(+d);
}

/* ── DOM helper ─────────────────────────────────────── */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k,v] of Object.entries(attrs)) {
      if (v==null) continue;
      if (k==='class') el.className=v;
      else if (k==='style'&&typeof v==='object') Object.assign(el.style,v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(),v);
      else if (k==='selected'||k==='checked') el[k]=!!v;
      else { try { el.setAttribute(k,v); } catch(err) { console.error('setAttribute failed: tag='+tag+' key='+JSON.stringify(k)+' val='+JSON.stringify(v), err); throw err; } }
    }
  }
  function app(c) {
    if (c==null||c===false) return;
    if (Array.isArray(c)) { c.forEach(app); return; }
    el.appendChild(typeof c==='string'||typeof c==='number' ? document.createTextNode(String(c)) : c);
  }
  kids.forEach(app);
  return el;
}
