'use strict';



/* ── Calendar ───────────────────────────────────────── */
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ── Calendar filter defs ───────────────────────────── */
const CAL_FILTER_DEFS = [
  {key:'affection',     label:'Bonding',     color:CAT_COLORS.affection},
  {key:'burnout',       label:'Steadying',   color:CAT_COLORS.burnout},
  {key:'conflict',      label:'Conflict',    color:CAT_COLORS.conflict},
  {key:'libido',        label:'Mood, Energy & Desire', color:CAT_COLORS.libido},
  {key:'regulation',    label:'Life Wobble', color:CAT_COLORS.regulation},
  {key:'physical',      label:'Intimacy',    color:CAT_COLORS.physical},
  {key:'notes',         label:'Notes',       color:CAT_COLORS.partner},
  {key:'repair',        label:'Repair',      color:CAT_COLORS.repair},
  {key:'restore',       label:'Restorative', color:CAT_COLORS.restore},
  {key:'turndown',      label:'Turn down',   color:CAT_COLORS.turndown},
];

function buildCalFilterModal() {
  const filters = S.calFilters;
  const expiredHidden = filters.has('__expired');
  return overlay(h('div',{},
    h('div',{class:'sheet-title'},'Show / hide on calendar'),
    h('div',{style:{display:'flex',flexDirection:'column',gap:'2px'}},
      ...CAL_FILTER_DEFS.filter(f => {
        if (!S.showCaretaker && f.key === 'burnout') return false;
        if (!S.showRegulation && f.key === 'regulation') return false;
        if (!S.showPhysical  && (f.key === 'physical' || f.key === 'turndown')) return false;
        if (!S.showRepair    && f.key === 'repair') return false;
        return true;
      }).map(f => {
        const hidden = filters.has(f.key);
        return h('div',{
          style:{display:'flex',alignItems:'center',justifyContent:'space-between',
                 padding:'10px 0',borderBottom:'1px solid var(--border)',cursor:'pointer'},
          onclick:()=>{
            if(filters.has(f.key)) filters.delete(f.key); else filters.add(f.key);
            render();
          }
        },
          h('div',{style:{display:'flex',alignItems:'center',gap:'10px'}},
            h('div',{style:{width:'10px',height:'10px',borderRadius:'50%',background:f.color,opacity:hidden?'0.3':'1'}}),
            h('span',{style:{fontSize:'14px',color:hidden?'var(--muted)':'var(--text)'}},CAT_LABELS[f.key] || f.label)
          ),
          h('span',{style:{fontSize:'12px',color:hidden?'var(--muted)':'var(--c-partner)'}},
            hidden ? 'Hidden' : 'Visible'
          )
        );
      })
    ),
    // ── Scoring filter ─────────────────────────────────────────────
    h('div',{style:{
      marginTop:'12px',padding:'12px 0 4px 0',borderTop:'1px solid var(--border-mid)',
      fontSize:'10px',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted-2)',
    }}, 'By scoring status'),
    h('div',{
      style:{display:'flex',alignItems:'center',justifyContent:'space-between',
             padding:'10px 0',borderBottom:'1px solid var(--border)',cursor:'pointer'},
      onclick:()=>{
        if (filters.has('__expired')) filters.delete('__expired');
        else                          filters.add('__expired');
        render();
      }
    },
      h('div',{style:{display:'flex',alignItems:'center',gap:'10px',flex:'1'}},
        h('div',{style:{width:'10px',height:'10px',borderRadius:'2px',background:'var(--muted-3)',opacity:expiredHidden?'1':'0.3'}}),
        h('div',{style:{display:'flex',flexDirection:'column',gap:'2px'}},
          h('span',{style:{fontSize:'14px',color:expiredHidden?'var(--text)':'var(--muted)'}},'Hide expired entries'),
          h('span',{style:{fontSize:'11px',color:'var(--muted-2)'}},'Only show entries still contributing points'),
        ),
      ),
      h('span',{style:{fontSize:'12px',color:expiredHidden?'var(--c-partner)':'var(--muted)'}},
        expiredHidden ? 'On' : 'Off'
      )
    ),
    filters.size > 0 ? h('button',{
      style:{marginTop:'16px',width:'100%',padding:'10px',borderRadius:'10px',
             border:'1px solid var(--border)',background:'var(--bg3)',color:'var(--muted)',
             fontSize:'13px',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"},
      onclick:()=>{S.calFilters.clear();render();}
    },'Show all') : null
  ));
}

// True if the entry still has a non-zero decayed score contribution as of today.
// Used by the "Hide expired entries" calendar filter so the user can scope the
// log to only entries that are still actively scoring under the lifetime-sum model.
// Categories without a scoring path (libido / notes / repair) are always
// considered "active" — they're context, not score points.
function entryIsScoring(e) {
  if (e.category === 'libido' || e.category === 'notes' || e.category === 'repair') return true;
  const dayLibido = S.allEntries.find(x => x.date === e.date && x.category === 'libido');
  const cap = bankDayCap(dayLibido);
  const daysAgo = daysBetween(e.date, S.today);
  const { rel, per } = expEntryScores(e, cap);
  if (rel !== 0 && expRemaining(rel, daysAgo) !== 0) return true;
  if (per !== 0 && expRemaining(per, daysAgo) !== 0) return true;
  return false;
}

function entryHasMissingType(e) {
  if (e.category === 'affection' && e.eventType)
    return !S.affectionTypes.find(t => t.name === e.eventType);
  if (e.category === 'physical' && e.eventType)
    return !S.physicalTypes.find(t => t.name === e.eventType);
  if (e.category === 'restore' && e.eventType)
    return !S.restoreTypes.find(t => (typeof t === 'string' ? t : t.name) === e.eventType);
  if (e.category === 'burnout' && Array.isArray(e.caretakerTypes) && e.caretakerTypes.length > 0)
    return e.caretakerTypes.some(n => !S.caretakerTypes.find(t => t.name === n));
  if (e.category === 'regulation' && Array.isArray(e.regulationEmotions) && e.regulationEmotions.length > 0) {
    // Only warn for genuinely lost CUSTOM tags. Canonical/system tags
    // (anything in TAG_TO_EMOTION_TONE) are still recognised and easily
    // re-added, so removing them from the active list isn't data loss.
    const activeTags = new Set(S.challengingEmotionTags || DEFAULT_CHALLENGING_EMOTION_TAGS);
    return e.regulationEmotions.some(t => !activeTags.has(t) && !(t in TAG_TO_EMOTION_TONE));
  }
  return false;
}

function buildCalendar() {
  const {calYear,calMonth,selectedDate,today} = S;

  // Build dotMap. Per-category filters are applied later at render time (line ~247);
  // here we only honor the show* toggles and the "hide expired" toggle (which gates
  // by per-entry scoring state, not category).
  const dotMap = {};
  const hideExpired = S.calFilters.has('__expired');
  for (const e of S.allEntries) {
    if (!S.showCaretaker  && e.category === 'burnout') continue;
    if (!S.showRegulation && e.category === 'regulation') continue;
    if (!S.showPhysical   && (e.category === 'physical' || e.category === 'turndown')) continue;
    if (!S.showRepair     && e.category === 'repair') continue;
    if (hideExpired && !entryIsScoring(e)) continue;
    if (!dotMap[e.date]) dotMap[e.date] = new Set();
    dotMap[e.date].add(e.category);
  }

  // Dates that have at least one entry with a deleted/missing type
  const warnDates = new Set();
  for (const e of S.allEntries) {
    if (entryHasMissingType(e)) warnDates.add(e.date);
  }

  // Balance tint map — tint based on what that day contributed (combined balance)
  // Only count entries from enabled features so hidden features don't affect the tint
  const visibleEntries = S.allEntries.filter(e => {
    if (!S.showCaretaker  && e.category === 'burnout')     return false;
    if (!S.showRegulation && e.category === 'regulation')  return false;
    if (!S.showPhysical   && (e.category === 'physical' || e.category === 'turndown')) return false;
    if (!S.showRepair     && e.category === 'repair')      return false;
    return true;
  });

  // Build per-day personal-delta map: restore (positive) + wobble (negative) + steadying (negative)
  // Mirrors the personal balance computation in the gauge.
  const personalDeltaMap = {};
  const entriesByDate = {};
  for (const e of visibleEntries) {
    if (!entriesByDate[e.date]) entriesByDate[e.date] = [];
    entriesByDate[e.date].push(e);
  }
  for (const d in entriesByDate) {
    const dayEs = entriesByDate[d];
    const le = dayEs.find(e => e.category === 'libido');
    const cap = bankDayCap(le);
    let pDelta = 0;
    for (const e of dayEs) {
      if (e.category === 'restore') {
        const t = S.restoreTypes.find(x => (typeof x === 'string' ? x : x.name) === e.eventType);
        pDelta += restoreScore(e, t, cap);
      } else if (e.category === 'regulation') {
        pDelta += wobbleRestoreScore(e, cap);
      } else if (e.category === 'burnout') {
        pDelta += caretakerPersonalScore(e, cap);
      }
    }
    personalDeltaMap[d] = pDelta;
  }

  // Only tint days that have at least one scoring entry (not just libido/notes)
  const scoringDates = new Set(
    visibleEntries.filter(e => e.category !== 'libido' && e.category !== 'notes').map(e => e.date)
  );

  const calS = S.weights.calStable   || 11;
  const calT = S.weights.calThriving || 25;
  const calTint = r => {
    if (r === 0) return null;
    if (r >= calT)  return 'var(--c-partner-subtle)';
    if (r >= calS)  return 'rgba(30,160,80,0.08)';
    if (r > 0)      return 'rgba(30,160,80,0.04)';
    if (r > -calS)  return 'rgba(224,130,40,0.12)';
    if (r > -calT)  return 'rgba(220,80,40,0.14)';
    return 'var(--c-conflict-border)';
  };

  const balTintMap = {};
  const timeline = computeLoveBankScore(visibleEntries);
  for (const pt of timeline) {
    if (!scoringDates.has(pt.date)) continue;
    const r = pt.raw + (personalDeltaMap[pt.date] || 0);
    const tint = calTint(r);
    if (tint) balTintMap[pt.date] = tint;
  }
  // Account for personal-only days (entries on days that aren't in the relational timeline)
  for (const d in personalDeltaMap) {
    if (balTintMap[d] !== undefined) continue;
    if (!scoringDates.has(d)) continue;
    const r = personalDeltaMap[d];
    const tint = calTint(r);
    if (tint) balTintMap[d] = tint;
  }

  const filters = S.calFilters;
  const activeCount = filters.size;
  const filterBtn = h('div',{style:{display:'flex',justifyContent:'flex-end',padding:'0 16px 8px'}},
    h('button',{
      class:'cal-filter-btn'+(activeCount>0?' active':''),
      style:{fontSize:'11px',padding:'4px 10px'},
      onclick:()=>openModal('cal-filter')
    },
      '⊙ Filter',
      activeCount > 0 ? h('span',{style:{
        marginLeft:'5px',background:'var(--c-physical)',color:'#fff',
        borderRadius:'8px',padding:'1px 5px',fontSize:'10px'
      }}, filters.size+' hidden') : null
    )
  );

  const firstDay    = new Date(calYear,calMonth,1).getDay();
  const daysInMonth = new Date(calYear,calMonth+1,0).getDate();
  const daysInPrev  = new Date(calYear,calMonth,0).getDate();
  const cells = [];

  for (let i=firstDay-1;i>=0;i--) {
    const d2 = daysInPrev-i;
    const prevM = calMonth===0?11:calMonth-1;
    const prevY = calMonth===0?calYear-1:calYear;
    const ds2 = prevY+'-'+String(prevM+1).padStart(2,'0')+'-'+String(d2).padStart(2,'0');
    cells.push(h('div',{class:'cal-day other-month',onclick:()=>selectDate(ds2)},h('span',{class:'cal-num'},String(d2))));
  }

  for (let d=1;d<=daysInMonth;d++) {
    const ds  = calYear+'-'+String(calMonth+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const cats = dotMap[ds] ? [...dotMap[ds]].filter(c=>!filters.has(c)) : [];
    const dotColors = cats.slice(0,5).map(c => CAT_COLORS[c]||'#888');
    const dots = dotColors.map(col=>h('div',{class:'cal-dot',style:{background:col}}));
    const isSelected = ds === selectedDate;
    const isToday    = ds === today;
    const hasWarn    = warnDates.has(ds);
    const cls  = ['cal-day', isToday?'today':'', isSelected?'selected':''].filter(Boolean).join(' ');
    const tint = balTintMap[ds] || null;
    cells.push(h('div',{
      class:cls,
      style: {...(tint ? {background:tint} : {}), ...(hasWarn ? {position:'relative'} : {})},
      onclick:()=>selectDate(ds)
    },
      h('span',{class:'cal-num'},String(d)),
      hasWarn ? h('span',{style:{
        position:'absolute',top:'1px',right:'2px',
        fontSize:'11px',lineHeight:'1',
      }}, '⚠️') : null,
      dots.length ? h('div',{class:'cal-dots'},...dots) : null
    ));
  }

  const rem = (cells.length%7===0) ? 0 : (7-cells.length%7);
  const nextM = calMonth===11?0:calMonth+1;
  const nextY = calMonth===11?calYear+1:calYear;
  for (let d=1;d<=rem;d++) {
    const ds2 = nextY+'-'+String(nextM+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    cells.push(h('div',{class:'cal-day other-month',onclick:()=>selectDate(ds2)},h('span',{class:'cal-num'},String(d))));
  }

  return h('div',{class:'calendar-wrap'},
    h('div',{class:'cal-nav'},
      h('button',{class:'cal-arrow',onclick:prevMonth},'‹'),
      h('span',  {class:'cal-month'},MONTHS[calMonth]+' '+calYear),
      h('button',{class:'cal-arrow',onclick:nextMonth},'›')
    ),
    filterBtn,
    h('div',{class:'cal-grid'},
      ...['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=>h('div',{class:'cal-dow'},d)),
      ...cells
    )
  );
}
function prevMonth(){S.calMonth--;if(S.calMonth<0){S.calMonth=11;S.calYear--;}render();}
function nextMonth(){S.calMonth++;if(S.calMonth>11){S.calMonth=0;S.calYear++;}render();}
function selectDate(ds){
  S.selectedDate=ds;
  // If the selected date lives in a different month than the calendar is showing,
  // advance the calendar to that month so the highlighted day is visible.
  const [y, m] = ds.split('-').map(Number);
  S.calYear = y;
  S.calMonth = m - 1;
  loadDay().then(render);
}

/* ── Day panel ──────────────────────────────────────── */
function buildDayPanel() {
  const allEntries=[...S.dayEntries].sort((a,b)=>a.id-b.id);
  // Apply calendar filters to day entries too
  const filters = S.calFilters;
  const hideExpired = filters.has('__expired');
  const entries = allEntries.filter(e => {
    if (!S.showCaretaker && e.category === 'burnout') return false;
    if (!S.showRegulation && e.category === 'regulation') return false;
    if (!S.showRepair && e.category === 'repair') return false;
    if (filters.has(e.category)) return false;
    if (hideExpired && !entryIsScoring(e)) return false;
    return true;
  });
  const hiddenCount = allEntries.length - entries.length;
  const CAT_ORDER = ['affection','burnout','conflict','libido','notes','physical','regulation','repair','restore','turndown'];
  const sortedEntries = [...entries].sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a.category);
    const bi = CAT_ORDER.indexOf(b.category);
    if (ai !== bi) return ai - bi;
    const al = (a.eventType || a.caretakerType || a.category).toLowerCase();
    const bl = (b.eventType || b.caretakerType || b.category).toLowerCase();
    return al.localeCompare(bl);
  });
  const isToday = S.selectedDate === S.today;

  // Mini score panel — lifetime sums as of the selected date.
  const _miniAnchor = S.selectedDate;
  const _expMini = computeExperimentalScores(_miniAnchor);
  const _miniRel = _expMini.rel;
  const _miniPer = _expMini.per;
  const _miniCom = _expMini.tenor;
  const _miniZones = getBounds();
  const _miniBg = v => {
    const r = Math.round(v);
    if (r >= _miniZones.thriving)  return 'rgba(30,160,80,0.18)';
    if (r >= _miniZones.stable)    return 'rgba(77,196,120,0.09)';
    if (r >= 0)                    return 'rgba(210,160,40,0.12)';
    if (r >= _miniZones.strained)  return 'rgba(224,130,40,0.14)';
    if (r >= _miniZones.depleted)  return 'rgba(224,100,40,0.16)';
    return 'rgba(224,53,53,0.18)';
  };
  const _miniLabel = S.selectedDate === S.today
    ? 'Today'
    : new Date(S.selectedDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const _miniScores = [
    {label:'Relational', val:_miniRel},
    {label:'Personal',   val:_miniPer},
    {label:'Tenor',      val:_miniCom},
  ];

  return h('div',{class:'day-panel'},
    h('div',{class:'day-header'},
      h('span',{class:'day-title'},fmtDate(S.selectedDate)),
      h('button',{class:'add-btn',onclick:()=>openModal('picker')},
        isToday ? '+ Add' : '+ Add to this day')
    ),
    h('div',{style:{borderBottom:'1px solid var(--border)', marginBottom:'10px'}},
      h('div',{style:{display:'flex', gap:'1px'}},
        ..._miniScores.map(s => h('div',{style:{
          flex:'1', textAlign:'center', padding:'7px 10px', background:_miniBg(s.val),
        }},
          h('div',{style:{fontSize:'9px',fontWeight:'600',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'2px'}}, s.label),
          h('div',{style:{fontFamily:"'Libre Baskerville',serif",fontSize:'15px',color:'var(--text-strong)',lineHeight:'1'}},
            (Math.round(s.val) >= 0 ? '+' : '') + Math.round(s.val))
        ))
      ),
      h('div',{style:{
        textAlign:'right', padding:'3px 8px',
        fontSize:'9px', color:'var(--muted-2)', letterSpacing:'0.04em',
      }}, _miniLabel)
    ),
    hiddenCount > 0 ? h('div',{style:{fontSize:'11px',color:'var(--muted)',padding:'4px 0 8px',textAlign:'center'}},
      hiddenCount+' entr'+(hiddenCount===1?'y':'ies')+' hidden by filter'
    ) : null,
    entries.length===0
      ? h('div',{class:'empty-day'}, allEntries.length > 0
          ? 'All entries hidden by filter.'
          : h('div',{},
              h('div',{},'Nothing logged for this day.'),
              h('div',{style:{marginTop:'6px'}},'Tap + Add to record an entry.')
            )
        )
      : h('div',{},...sortedEntries.map(buildCard)),

    S.showDebug && allEntries.length > 0 ? (() => {
      const _isToday   = S.selectedDate === S.today;
      const daysAgo    = daysBetween(S.selectedDate, S.today);
      const cap        = bankDayCap(allEntries.find(e => e.category === 'libido'));
      const relRaw     = allEntries.reduce((s, e) => s + bankScoreEntry(e, cap).score, 0);
      const persRaw    = allEntries.reduce((s, e) => {
        if (e.category === 'restore') { const t = S.restoreTypes.find(x => (typeof x==='string'?x:x.name) === e.eventType); return s + restoreScore(e, t, cap); }
        if (e.category === 'regulation') return s + wobbleRestoreScore(e, cap);
        if (e.category === 'burnout')    return s + caretakerPersonalScore(e, cap);
        return s;
      }, 0);
      const fmt = n => (n >= 0 ? '+' : '') + n.toFixed(1);
      const row = (label, total, contrib) => h('div',{style:{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid var(--surface-2)',fontSize:'11px'}},
        h('span',{style:{color:'var(--muted)'}}, label),
        h('span',{style:{display:'flex',gap:'16px'}},
          h('span',{style:{color:'var(--text-strong)',fontFamily:"'Libre Baskerville',serif"}}, fmt(total)),
          h('span',{style:{color:'var(--muted)'}}, fmt(contrib)+' from this day'),
        )
      );
      const exp    = computeExperimentalScores(S.today);
      const relRem = expRemaining(relRaw,  daysAgo);
      const perRem = expRemaining(persRaw, daysAgo);
      return h('div',{style:{
        marginTop:'16px', padding:'10px 12px', borderRadius:'10px',
        background:'var(--surface-1)', border:'1px solid var(--surface-2)',
        fontSize:'11px', fontFamily:"'DM Sans',sans-serif",
      }},
        h('div',{style:{fontWeight:'600',color:'var(--text-strong)',marginBottom:'8px',fontSize:'11px',letterSpacing:'0.06em',textTransform:'uppercase'}},
          'Day debug · ' + (_isToday ? 'today' : daysAgo+'d ago')),
        row('Relational', exp.rel,   relRem),
        row('Personal',   exp.per,   perRem),
        row('Tenor',      exp.tenor, (relRem + perRem) / 2),
      );
    })() : null,
  );
}

function buildCard(e) {
  let title='', meta='', note='';
  // Get today's capacity for score display — use the libido entry for this day if present
  const dayLibido = S.allEntries.find(x => x.date === e.date && x.category === 'libido');
  const cardCap   = bankDayCap(dayLibido);
  const fmtScore  = s => {
    if (!S.showCardPoints) return null;
    const r = Math.round(s * 10) / 10;          // keep one decimal
    if (r === 0) return null;                    // only hide a true ~0
    const txt = Number.isInteger(r) ? String(r) : r.toFixed(1);
    return (r > 0 ? '+' : '') + txt + ' pts';
  };

  if (e.category==='physical') {
    title = e.eventType || 'Intimacy';
    const solo = e.solo ? 'Solo' : null;
    const who  = !e.solo && e.initiatedBy ? (e.initiatedBy==='me'?'I initiated':e.initiatedBy==='her'?`${P.Sub} initiated`:'Mutual') : null;
    // connectionQuality for new entries, fall back to intensity mapping for old entries
    const cqVal = !e.solo ? (e.connectionQuality || (e.intensity ? e.intensity : null)) : null;
    const quality = cqVal ? CONNECTION_QUALITY.find(q=>q.val===cqVal)?.label : null;
    const intensity = e.solo && e.intensity ? PHYSICAL_INTENSITY[e.intensity-1].label : null;
    const context = e.solo && e.soloContext ? SOLO_CONTEXT.find(c=>c.val===e.soloContext)?.label : null;
    const scored = bankScoreEntry(e, cardCap);
    const scoreStr = fmtScore(scored.score);
    meta  = [solo||who, context, quality||intensity, scoreStr].filter(Boolean).join(' · ');
    note  = e.notes;
  } else if (e.category==='affection') {
    title = e.eventType || (S.relationshipMode === 'dating' ? 'Date' : 'Bonding moment');
    const cq  = CONNECTION_QUALITY.find(q=>q.val===(e.connectionQuality||3));
    const who = e.initiatedBy==='me'?'I initiated':e.initiatedBy==='her'?`${P.Sub} initiated`:e.initiatedBy==='mutual'?'Mutual':'';
    // Whom is shown when present — works in both modes (dating-mode entries
    // will have it, partner-mode entries can be edited to set it later)
    const whom = e.whom ? 'with '+e.whom : '';
    const scored = bankScoreEntry(e, cardCap);
    const scoreStr = fmtScore(scored.score);
    // Order matches form: whom (or initiator), connection quality
    meta  = [whom || who, cq?cq.label:'', scoreStr].filter(Boolean).join(' · ');
    note  = e.notes;
  } else if (e.category==='libido') {
    const l = LIBIDO_LEVELS[e.libiLevel-1]||LIBIDO_LEVELS[2];
    title = (MOOD_EMOJIS[e.mood-1]||'') + ' ' + (MOOD_LABELS[e.mood-1]||'') +
            ' · ' + (ENERGY_EMOJIS[e.energy-1]||'') + ' ' + (ENERGY_LABELS[e.energy-1]||'');
    meta  = 'Desire — ' + l.label;
    note  = e.notes;
  } else if (e.category==='conflict') {
    const l = CONFLICT_LEVELS.find(x=>x.val===e.intensity)||CONFLICT_LEVELS[0];
    const r = CONFLICT_RESOLUTION.find(x=>x.val===(e.resolution||'unresolved'));
    const c = e.conduct ? CONFLICT_CONDUCT.find(x=>x.val===e.conduct) : null;
    const h2 = e.harm ? CONFLICT_HARM.find(x=>x.val===e.harm) : null;
    const scored = bankScoreEntry(e, cardCap);
    const scoreStr = fmtScore(scored.score);
    title = 'Conflict';
    meta  = [h2?h2.label:null, l.label, c?c.label:null, r?r.label:'', scoreStr].filter(Boolean).join(' · ');
    note  = e.notes;
  } else if (e.category==='turndown') {
    const t = TURNDOWN_TYPES.find(x=>x.val===e.turndownType);
    title = t ? t.label : 'Turn Down';
    const who = e.initiatedBy==='me' ? `I turned ${P.obj} down` : `${P.Sub} turned down`;
    const sig    = e.tdSignificance ? (TURNDOWN_SIGNIFICANCE.find(s=>s.val===e.tdSignificance)?.label||'') : '';
    const impact = e.tdImpact ? (TURNDOWN_IMPACT.find(i=>i.val===e.tdImpact)?.label||'') : '';
    const reason = e.tdMyReason ? (TD_MY_REASONS.find(r=>r.val===e.tdMyReason)?.label||'') : '';
    const scored = bankScoreEntry(e, cardCap);
    const scoreStr = scored.score !== 0 ? fmtScore(scored.score) : null;
    meta = e.initiatedBy === 'her'
      ? [who, impact, sig, t?t.label:'', scoreStr].filter(Boolean).join(' · ')
      : [who, reason, t?t.label:'', scoreStr].filter(Boolean).join(' · ');
    note = e.notes;
  } else if (e.category==='notes') {
    title = e.stressorTitle || 'Note';
    note  = e.observed;
  } else if (e.category==='burnout') {
    const types = Array.isArray(e.burnoutTypes) ? e.burnoutTypes : (e.burnoutType ? [e.burnoutType] : []);
    const d = DRAIN_LEVELS.find(x=>x.val===e.drain);
    const outcome = e.caretakerOutcome ? CARETAKER_OUTCOME.find(o=>o.val===Number(e.caretakerOutcome)) : null;
    const stIntensity = e.steadyingIntensity ? STEADYING_INTENSITY.find(s=>s.val===e.steadyingIntensity) : null;
    const personalScore = caretakerPersonalScore(e, cardCap);
    const scoreStr = personalScore !== 0 ? fmtScore(personalScore) : '';
    // Title: steadying types if set
    const typeNames = Array.isArray(e.caretakerTypes) && e.caretakerTypes.length ? e.caretakerTypes : (e.caretakerType ? [e.caretakerType] : []);
    title = typeNames.length > 0
      ? typeNames.join(', ')
      : (types.length > 0 ? types.map(t=>burnoutLabel(t).label).join(', ') : 'Steadying moment');
    const ctxLabel = e.ctContext === 'relationship' ? 'With partner' : e.ctContext === 'external' ? null : null;
    meta  = [stIntensity?stIntensity.label:'', e.duration||'', d?d.label:'', outcome?outcome.label:'', ctxLabel, scoreStr].filter(Boolean).join(' · ');
    note  = e.notes;
  } else if (e.category==='restore') {
    const rq = RESTORE_QUALITY.find(q=>q.val===migrateRestoreQuality(e.restoreQuality, e));
    const ri = RESTORE_IMMERSION.find(i=>i.val===(e.restoreImmersion||3));
    title = e.eventType || 'Restorative activity';
    const typeObj = S.restoreTypes.find(t => (typeof t==='string'?t:t.name) === e.eventType);
    const cap = bankDayCap(S.allEntries.find(le => le.date === e.date && le.category === 'libido'));
    const score = restoreScore(e, typeObj, cap);
    const scoreStr = score > 0 ? fmtScore(score) : '';
    // Obstacles only shown when quality was low (form behaviour)
    const obstacles = (e.restoreObstacles || [])
      .map(v => RESTORE_OBSTACLES.find(o => o.val === v)?.label)
      .filter(Boolean).join(', ');
    // Order matches form: immersion, quality, obstacles
    meta = [ri ? ri.label : '', rq ? rq.label : '', obstacles, scoreStr].filter(Boolean).join(' · ');
    note  = e.notes;} else if (e.category==='regulation') {
    const act = WOBBLE_INTENSITY.find(x=>x.val===e.regulationIntensity);
    const trg = WOBBLE_TRIGGER.find(x=>x.val===e.regulationTrigger);
    const sources = (e.regulationSupportSources||[]).map(v=>WOBBLE_SUPPORT_SOURCE.find(x=>x.val===v)?.label).filter(Boolean);
    const res = WOBBLE_RESOLUTION.find(x=>x.val===e.regulationResolution);
    const emotions = (e.regulationEmotions||[]);
    title = act ? act.label : 'Life wobble';
    if (emotions.length > 0) title = emotions.join(', ');
    const scored = bankScoreEntry(e, cardCap);
    const wobbleScore = wobbleRestoreScore(e, cardCap);
    const scoreStr = wobbleScore !== 0 ? fmtScore(wobbleScore) : '';
    const actLabel = emotions.length > 0 ? (act ? act.label : '') : '';
    meta  = [actLabel, trg?trg.label:'', sources.length?sources.join(', '):'', res?res.label:'', scoreStr].filter(Boolean).join(' · ');
    note  = e.notes;
  } else if (e.category==='repair') {
    const init = REPAIR_INITIATED_BY.find(x=>x.val===e.repairInitiatedBy);
    // repairForm may be an array (multi-select) or legacy single string
    const formVals = Array.isArray(e.repairForm) ? e.repairForm
      : (typeof e.repairForm === 'string' && e.repairForm ? [e.repairForm] : []);
    const formLabels = formVals
      .map(v => REPAIR_FORM.find(x=>x.val===v)?.label)
      .filter(Boolean);
    const recv = REPAIR_RECEPTION.find(x=>x.val===e.repairReception);
    const aft  = REPAIR_AFTERMATH.find(x=>x.val===e.repairAftermath);
    const initLabel = init ? (init.val==='me' ? 'I reached' : init.val==='partner' ? `${P.Sub} reached` : 'Mutual') : '';
    title = formLabels.length ? formLabels.join(' + ') : 'Repair';
    meta  = [initLabel, recv?recv.label:'', aft?aft.label:''].filter(Boolean).join(' · ');
    note  = e.notes;
  }

  // ── Fallback for unknown/orphaned categories ──────────
  if (!title && !meta && !note) {
    const rawFields = Object.entries(e)
      .filter(([k]) => !['id','date','category'].includes(k) && e[k] != null && e[k] !== '')
      .map(([k,v]) => k+': '+(typeof v === 'object' ? JSON.stringify(v) : v))
      .join('\n');
    const confirmingDelete = S._confirmDeleteId === e.id;
    return h('div',{class:'entry-card',style:{opacity:'0.7'},
      onclick:()=>{
        // Open as a Notes entry with raw data pre-filled so user can rescue/clean up
        S.selectedDate = e.date;
        S.form = { _editId: e.id, stressorTitle: '', observed: rawFields };
        S.modal = 'notes';
        render();
      }},
      h('div',{class:'entry-top'},
        h('span',{class:'entry-cat',style:{color:'var(--muted)'}},'🌿 Notes'),
        confirmingDelete
          ? h('div',{style:{display:'flex',gap:'6px'}},
              h('button',{style:{fontSize:'11px',padding:'2px 8px',borderRadius:'6px',border:'1px solid var(--c-conflict-border)',background:'var(--c-conflict-tint)',color:'var(--c-conflict)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"},
                onclick:ev=>{ev.stopPropagation(); S._confirmDeleteId=null; delEntry(e.id);}}, 'Delete'),
              h('button',{style:{fontSize:'11px',padding:'2px 8px',borderRadius:'6px',border:'1px solid var(--border)',background:'var(--bg3)',color:'var(--muted)',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"},
                onclick:ev=>{ev.stopPropagation(); S._confirmDeleteId=null; render();}}, 'Keep')
            )
          : h('button',{class:'entry-delete',style:{display:'block'},
              onclick:ev=>{ev.stopPropagation(); S._confirmDeleteId=e.id; render();}}, '×')
      ),
      h('div',{class:'entry-title',style:{fontSize:'11px',color:'var(--muted)',fontWeight:'400'}}, rawFields.split('\n')[0] || 'No data'),
      confirmingDelete
        ? h('div',{style:{fontSize:'11px',color:'var(--c-conflict)',marginTop:'4px'}}, 'Delete this entry?')
        : h('div',{style:{fontSize:'10px',color:'var(--muted)',marginTop:'4px',opacity:'0.6'}}, 'Tap to open as Note · × to delete')
    );
  }

  const cardColor = CAT_COLORS[e.category] || 'var(--muted)';

  // Small attachment tag pills (currently conflict + wobble + turndown entries)
  // Only shown when the Attachment lens feature is enabled — saved tag data
  // is preserved on disk regardless and reappears if the toggle is re-enabled.
  let tagPills = null;
  if (S.showAttachment && Array.isArray(e.attachmentTags) && e.attachmentTags.length) {
    let tagDict = null;
    if (e.category === 'conflict')   tagDict = CONFLICT_ATTACHMENT_TAGS;
    else if (e.category === 'regulation') tagDict = WOBBLE_ATTACHMENT_TAGS;
    else if (e.category === 'turndown')   tagDict = e.initiatedBy === 'me' ? TURNDOWN_MY_TAGS : TURNDOWN_PARTNER_TAGS;
    else if (e.category === 'affection')  tagDict = BONDING_ATTACHMENT_TAGS;
    else if (e.category === 'repair')     tagDict = REPAIR_ATTACHMENT_TAGS;
    if (tagDict) {
      const pills = e.attachmentTags.map(val => {
        const t = tagDict.find(x => x.val === val);
        if (!t) return null;
        const meta = ATTACHMENT_AXIS_META[t.axis] || {color:'var(--muted)'};
        return h('span',{style:{
          fontSize:'10px',padding:'2px 8px',borderRadius:'10px',
          background: meta.color + '1f',
          color: meta.color,
          border:'1px solid '+meta.color+'33',
          whiteSpace:'nowrap',
        }}, t.label);
      }).filter(Boolean);
      if (pills.length) {
        tagPills = h('div',{style:{display:'flex',flexWrap:'wrap',gap:'4px',marginTop:'6px'}}, ...pills);
      }
    }
  }

  return h('div',{class:'entry-card '+e.category,style:{cursor:'pointer'},onclick:()=>editEntry(e)},
    h('div',{class:'entry-top'},
      h('span',{class:'entry-cat',style:{color:cardColor}},CAT_LABELS[e.category]||e.category),
      entryHasMissingType(e) ? h('span',{style:{
        fontSize:'10px',fontWeight:'600',color:'var(--muted)',
        background:'rgba(240,180,41,0.12)',borderRadius:'5px',
        padding:'1px 5px',marginLeft:'6px',
      }}, e.category === 'regulation' ? '⚠️ tags removed' : '⚠️ type deleted') : null,
      S.showQuickDelete ? h('button',{class:'entry-delete',onclick:ev=>{ev.stopPropagation();delEntry(e.id);}},'×') : null
    ),
    h('div',{class:'entry-title'},title),
    meta ? h('div',{class:'entry-meta'},meta) : null,
    tagPills,
    note ? h('div',{
      class: 'entry-note' + (S.expandedNotes.has(e.id) ? ' expanded' : ''),
      onclick: ev => {
        ev.stopPropagation();
        if (S.expandedNotes.has(e.id)) S.expandedNotes.delete(e.id);
        else S.expandedNotes.add(e.id);
        render();
      }
    }, note) : null
  );
}
/* ── Picker ─────────────────────────────────────────── */
function buildPicker() {

  const left  = [
    {key:'libido',     icon:'🌡️', name:'Daily Check In', desc:'My daily state'},
    {key:'restore',    icon:'🌊', name:'Restorative',   desc:'Activities that restore me'},
    {key:'turndown',   icon:'🌒', name:'Turn Down',      desc:'Desire unmet or turned down'},
    {key:'burnout',    icon:'🕯️', name:'Steadying',      desc:'You showed up to steady someone'},
    {key:'notes',    icon:'🌿', name:'Notes', desc:'Log anything worth remembering today'},
    {key:'combined',   icon:'🔀', name:'Combined',       desc:'One activity — both bonding & restorative'},
  ].filter(c => c.key !== 'turndown' || S.showPhysical)
   .filter(c => c.key !== 'burnout'  || S.showCaretaker);

  const right = [
    {key:'affection',  icon:'🩷', get name(){ return bondingLabel(); }, desc:'Genuine bonding experiences'},
    {key:'physical',   icon:'🌹', name:'Intimacy',              desc:'Sexual intimacy & desire'},
    {key:'conflict',   icon:'⚡', name:'Conflict',              desc:'Arguments & hard talks'},
    {key:'regulation', icon:'🫧', name:'Life Wobble',           desc:'Your personal difficult moment'},
    {key:'repair',     icon:'🤝', name:'Repair',                desc:'Reconnection work after a rupture'},
  ].filter(c => c.key !== 'physical'    || S.showPhysical)
   .filter(c => c.key !== 'regulation'  || S.showRegulation)
   .filter(c => c.key !== 'repair'      || S.showRepair);
  const singlePerDay = new Set(['libido']);

  const makeCard = c => {
    const existing = singlePerDay.has(c.key)
      ? S.dayEntries.find(e => e.category === c.key)
      : null;
    return h('div',{
      class:'cat-card',
      style:{
        borderColor:(CAT_COLORS[c.key]||'var(--muted)')+'28',
        opacity: existing?'0.35':'1',
        cursor: existing?'default':'pointer',
        pointerEvents: existing?'none':'auto',
      },
      onclick: existing ? null : ()=>openModal(c.key)
    },
      h('span',{class:'cat-icon'},c.icon),
      h('span',{class:'cat-name',style:{color:CAT_COLORS[c.key]||'var(--text)'}},c.name),
      h('span',{class:'cat-desc'}, existing?'Already logged today':c.desc)
    );
  };

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},'What are you logging?'),
    h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px'}},
      ...(() => {
        // Interleave left/right for the familiar personal|relational pairing,
        // but skip empty slots so the shorter column's tail is back-filled by
        // the longer one — no holes, fewest possible rows.
        const maxLen = Math.max(left.length, right.length);
        const cells = [];
        for (let i = 0; i < maxLen; i++) {
          if (left[i])  cells.push(makeCard(left[i]));
          if (right[i]) cells.push(makeCard(right[i]));
        }
        return cells;
      })()
    ),
    h('button',{class:'sec-btn',style:{width:'100%',marginTop:'12px'},onclick:()=>closeModal()},'Cancel')
  ));
}

function buildScoreBar() {
  // Lifetime sums via the active scoring model.
  const exp = computeExperimentalScores();
  const scores = [
    { label:'Relational', val:exp.rel,   key:'relational' },
    { label:'Personal',   val:exp.per,   key:'personal'   },
    { label:'Tenor',      val:exp.tenor, key:'combined'   },
  ];

  const zones = getBounds();
  // Background color using the same red→gold→green palette as the relational arc.
  // Use the same rounded value the user sees, so a displayed "50" lands in the
  // same band the home page would put it in (which also rounds before testing).
  const scoreBg = val => {
    const r = Math.round(val);
    if (r >= zones.thriving)  return 'rgba(30,160,80,0.18)';
    if (r >= zones.stable)    return 'rgba(77,196,120,0.09)';
    if (r >= 0)               return 'rgba(210,160,40,0.12)';
    if (r >= zones.strained)  return 'rgba(224,130,40,0.14)';
    if (r >= zones.depleted)  return 'rgba(224,100,40,0.16)';
    return 'rgba(224,53,53,0.18)';
  };

  return h('div',{style:{
    display:'flex', gap:'1px', flexShrink:'0',
    borderBottom:'1px solid var(--border)',
    position:'relative',
  }},
    ...scores.map(s => {
      const bg = scoreBg(s.val);
      const isActive = S.activeTab==='insights' && S.gaugeMode===s.key;
      return h('div',{
        style:{
          flex:'1', padding:'7px 10px', cursor:'pointer',
          textAlign:'center',
          background: bg,
          borderBottom: isActive ? '2px solid var(--text-strong)' : '2px solid transparent',
          transition:'border-color 0.15s',
        },
        onclick:()=>{
          S.activeTab='insights';
          S.gaugeMode=s.key;
          saveSettings();
          render();
        }
      },
        h('div',{style:{fontSize:'9px',fontWeight:'600',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'2px'}},
          s.label),
        h('div',{style:{fontFamily:"'Libre Baskerville',serif",fontSize:'15px',color:'var(--text-strong)',lineHeight:'1'}},
          (Math.round(s.val) >= 0 ? '+' : '') + Math.round(s.val))
      );
    }),
  );
}
