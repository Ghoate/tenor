'use strict';

/* ── Attachment Panel ───────────────────────────────── */
// Reference / educational layer for the Attachment tab. Collapsible.
// Plain-language descriptions of the four axes plus a few framing notes.
// Voice is observational and warm — not prescriptive, no "if you're X do Y".
function buildAttachmentReference() {
  const expanded = !!S.attachmentRefExpanded;

  // Section header — always visible, clickable to toggle
  const header = h('div',{
    style:{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'14px 16px',cursor:'pointer',
      background:'var(--bg2)',border:'1px solid var(--border)',
      borderRadius: expanded ? '14px 14px 0 0' : '14px',
      borderBottom: expanded ? '1px solid var(--border)' : '1px solid var(--border)',
      transition:'border-radius 0.15s',
    },
    onclick: () => { S.attachmentRefExpanded = !S.attachmentRefExpanded; render(); }
  },
    h('div',{},
      h('div',{style:{
        fontFamily:"'Libre Baskerville',serif",fontSize:'14px',color:'var(--text)',
      }}, '📖 What am I looking at?'),
      h('div',{style:{
        fontSize:'11px',color:'var(--muted-2)',marginTop:'2px',
      }}, expanded ? 'A short reference for the patterns above' : 'Tap to read a short reference')
    ),
    h('span',{style:{
      fontSize:'14px',color:'var(--muted-2)',
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
      transition:'transform 0.2s',
    }}, '›')
  );

  if (!expanded) return header;

  // ── Reference body ────────────────────────────────────────────────
  const subhead = (text) => h('div',{style:{
    fontFamily:"'Libre Baskerville',serif",fontSize:'14px',
    color:'var(--text)',marginTop:'18px',marginBottom:'8px',
  }}, text);

  const para = (text) => h('div',{style:{
    fontSize:'13px',color:'var(--muted)',lineHeight:'1.7',marginBottom:'10px',
  }}, text);

  const axisRow = (axis, body) => {
    const meta = ATTACHMENT_AXIS_META[axis];
    return h('div',{style:{
      padding:'12px 0',borderBottom:'1px solid var(--border)',
    }},
      h('div',{style:{
        display:'flex',alignItems:'baseline',gap:'10px',marginBottom:'6px',
      }},
        h('span',{style:{
          fontSize:'11px',letterSpacing:'0.08em',textTransform:'uppercase',
          color: meta.color, fontWeight:'600',
        }}, meta.label),
        h('span',{style:{fontSize:'10px',color:'var(--muted-2)',fontStyle:'italic'}}, meta.hint)
      ),
      h('div',{style:{fontSize:'12px',color:'var(--muted)',lineHeight:'1.7'}}, body)
    );
  };

  const body = h('div',{style:{
    padding:'4px 16px 18px',background:'var(--bg2)',
    border:'1px solid var(--border)',borderTop:'none',
    borderRadius:'0 0 14px 14px',
  }},
    // Opening framing
    para('Attachment isn\'t a personality test, and this tab isn\'t a diagnosis. What it tracks is how your nervous system tends to move during moments of connection and rupture — the patterns of reaching, withdrawing, settling, and sometimes both at once.'),

    // The four axes
    subhead('The four axes'),
    para('Each tag you place sits on one of four axes. They describe the direction your nervous system pulled in the moment — not who you are.'),
    axisRow('anxiety',
      'The pull toward connection. Reaching, scanning, holding on, escalating to be heard. Often shows up when distance feels threatening — even small distances. The system\'s instinct: get closer to settle.'),
    axisRow('avoidance',
      'The pull toward distance. Withdrawing, going quiet, minimising, needing space. Often shows up when closeness feels overwhelming or unsafe. The system\'s instinct: step back to settle.'),
    axisRow('secure',
      'Staying with what\'s present. Tolerating discomfort without escalating or leaving. Reaching when reaching is needed; resting when rest is needed. Not the absence of difficulty — the capacity to stay engaged through it.'),
    axisRow('disorganized',
      'When both pulls fire at once, or neither does. Going blank, freezing, wanting opposite things at the same time, dissociating. Often more present in relationships with significant past rupture — yours or theirs. The system\'s contradictory instructions cancel each other out.'),

    // Moments vs traits
    subhead('Moments, not traits'),
    para('Most attachment writing talks about types — "I\'m anxious-avoidant," "they\'re a secure attacher." This tab works differently. It treats attachment as a pattern of activation, which means it can shift in different relationships, in different moments, even within a single conversation.'),
    para('A high count in one axis doesn\'t mean that\'s "what you are." It means that\'s where you\'ve been showing up lately, in this relationship, given the conditions you\'ve been navigating. The same person can show very different patterns with a different partner, in a different season, after work that builds new ground.'),

    // Earned secure
    subhead('Earned secure functioning'),
    para('Secure-flavoured tags accumulating over time isn\'t just a positive observation — it\'s the visible record of something the literature calls earned secure functioning. The capacity to stay regulated through difficulty isn\'t a fixed trait you either have or don\'t. It\'s built — through corrective relational experience, repair after rupture, and slow practice of staying with what would once have pulled you away.'),
    para('If you\'re carrying insecure or disorganized patterns, secure tags may show up rarely at first. That\'s data, not a verdict. Watch how the count moves over months — that movement is the work.'),

    // Limits
    subhead('What this can\'t tell you'),
    para('You can only tag your own moments — and only what you can see about them, after the fact. That\'s honest data, but it\'s partial. Activation in real time often blocks the part of you that would notice it; some patterns become visible only days later, or only through patterns you spot here.'),
    para('Likewise, your partner\'s patterns aren\'t in this data. You can sometimes guess at them — especially in long relationships — but the app doesn\'t encourage that. The most useful thing this tool can do is sharpen your read of yourself, not build a case about anyone else.'),
    para('And finally: a tag is just a label. The real thing is what was actually happening in your body, your thinking, your relationships. The tags are a way to point at it. They\'re not the thing itself.')
  );

  return h('div',{style:{marginBottom:'14px'}}, header, body);
}

// ── Activation / Regulation classifier ──────────────────────────────
// Classifies an entry as an 'activation' event (nervous system fired
// beyond regulated baseline), a 'regulation' event (system settled, or
// co-regulation occurred), or null (not relevant to this lens).
//
// Returns { kind: 'activation'|'regulation'|null, axes: [...] }
// where 'axes' lists the attachment axes the event touches (anxiety,
// avoidance, secure, disorganized) — useful for colour-coding.
function classifyAttachmentEvent(e) {
  const dictFor = (entry) => {
    if (entry.category === 'conflict')   return CONFLICT_ATTACHMENT_TAGS;
    if (entry.category === 'regulation') return WOBBLE_ATTACHMENT_TAGS;
    if (entry.category === 'turndown')   return entry.initiatedBy === 'me' ? TURNDOWN_MY_TAGS : TURNDOWN_PARTNER_TAGS;
    if (entry.category === 'affection')  return BONDING_ATTACHMENT_TAGS;
    if (entry.category === 'repair')     return REPAIR_ATTACHMENT_TAGS;
    return null;
  };
  const tagAxes = (entry) => {
    const dict = dictFor(entry);
    if (!dict || !Array.isArray(entry.attachmentTags)) return [];
    const out = new Set();
    for (const val of entry.attachmentTags) {
      const t = dict.find(x => x.val === val);
      if (t) out.add(t.axis);
    }
    return [...out];
  };

  const axes = tagAxes(e);
  const hasInsecureTag = axes.some(a => a !== 'secure');
  const onlySecure = axes.length > 0 && axes.every(a => a === 'secure');

  // Conflict — always activation
  if (e.category === 'conflict') {
    return { kind: 'activation', axes };
  }

  // Wobble — activation unless tagged exclusively secure
  if (e.category === 'regulation') {
    if (onlySecure) return { kind: 'regulation', axes };
    return { kind: 'activation', axes };
  }

  // Your-side relational turn-downs (disconnected / tension) — activation
  if (e.category === 'turndown' && e.initiatedBy === 'me') {
    if (e.tdMyReason === 'disconnected' || e.tdMyReason === 'tension') {
      return { kind: 'activation', axes };
    }
    // Other reasons (depleted/unavailable/protective) are not relational activation
    return { kind: null, axes };
  }
  // Partner-side turn-downs — the moment lands on you; the residue (if tagged
  // with insecure flavour) is activation
  if (e.category === 'turndown' && e.initiatedBy === 'her' && hasInsecureTag) {
    return { kind: 'activation', axes };
  }

  // Repair — always regulation (it IS the regulation work)
  if (e.category === 'repair') {
    return { kind: 'regulation', axes };
  }

  // Bonding — regulation when present without insecure tags, OR when high quality
  if (e.category === 'affection') {
    if (onlySecure) return { kind: 'regulation', axes };
    if (axes.length === 0 && (e.connectionQuality || 0) >= 4) return { kind: 'regulation', axes };
    // Bonding tagged with insecure cues (watched for signs / held back / close-and-afraid)
    // is itself an activation moment dressed as a deposit
    if (hasInsecureTag) return { kind: 'activation', axes };
    return { kind: null, axes };
  }

  // Restore entries with reasonable quality — regulation
  if (e.category === 'restore') {
    const q = migrateRestoreQuality(e.restoreQuality, e);
    if (q != null && q >= 3) return { kind: 'regulation', axes };
    return { kind: null, axes };
  }

  return { kind: null, axes };
}

// Builds the Activation & Regulation lens block for the Attachment tab.
// Returns the rendered DOM element.
function buildActivationRegulationLens(opts) {
  const { wDays, periodRef, windowStart } = opts;

  // Classify ALL entries in the relevant span. We need a tail of look-ahead
  // beyond the window-end (today) so activations near the end can still find
  // their regulation, but since we're looking back from "today", look-ahead
  // doesn't apply — instead we extend the look-back so regulations BEFORE
  // the window start can be referenced if needed (rare). For simplicity we
  // just classify everything from windowStart through today.
  const allInRange = S.allEntries
    .filter(e => e.date >= windowStart && e.date <= S.today)
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.id || 0) - (b.id || 0);
    });

  const classified = allInRange.map(e => ({ entry: e, ...classifyAttachmentEvent(e) }));
  const activations = classified.filter(c => c.kind === 'activation');
  const regulations = classified.filter(c => c.kind === 'regulation');

  // For each activation, find the next regulation event (in days). Cap the
  // search at MAX_LOOKAHEAD days; activations beyond that are 'open'.
  const MAX_LOOKAHEAD = 14;
  const ttrItems = activations.map(c => {
    const e = c.entry;
    const next = regulations.find(r =>
      r.entry !== e &&
      r.entry.date >= e.date &&
      // The regulation must come strictly after, by date or by id within same date
      (r.entry.date > e.date || (r.entry.id || 0) > (e.id || 0))
    );
    let days = null;
    if (next) {
      const gap = daysBetween(e.date, next.entry.date);
      if (gap <= MAX_LOOKAHEAD) days = gap;
    }
    return { activation: c, days };
  });

  const closedItems = ttrItems.filter(t => t.days !== null);
  const openItems   = ttrItems.filter(t => t.days === null);

  // Median helper
  const median = (nums) => {
    if (!nums.length) return null;
    const sorted = nums.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
  };

  const medTTR = median(closedItems.map(t => t.days));

  // ── Empty state ──
  if (activations.length === 0) {
    return h('div',{style:{
      padding:'16px',marginBottom:'14px',
      borderRadius:'14px',background:'var(--bg2)',border:'1px solid var(--border)',
      fontSize:'12px',color:'var(--muted-2)',fontStyle:'italic',
      fontFamily:"'Libre Baskerville',serif",lineHeight:'1.7',
    }},
      'No activation events ' + periodRef + '. Activations are conflicts, wobbles, relational turn-downs, and '+bondingLabel().toLowerCase()+' moments tagged with anxiety, avoidance, or disorganized cues.'
    );
  }

  // ── Headline numbers ──
  const headline = h('div',{style:{
    padding:'14px 16px',marginBottom:'10px',
    borderRadius:'14px',background:'var(--bg2)',border:'1px solid var(--border)',
  }},
    h('div',{style:{
      display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',
    }},
      // Activation count
      h('div',{},
        h('div',{style:{
          fontSize:'10px',letterSpacing:'0.07em',textTransform:'uppercase',
          color:'var(--c-conflict)',fontWeight:'600',marginBottom:'4px',
        }}, 'Activations'),
        h('div',{style:{
          fontFamily:"'Libre Baskerville',serif",fontSize:'24px',color:'var(--text)',lineHeight:'1.1',
        }}, activations.length),
        h('div',{style:{fontSize:'11px',color:'var(--muted-2)',marginTop:'3px'}},
          periodRef)
      ),
      // Regulation count
      h('div',{},
        h('div',{style:{
          fontSize:'10px',letterSpacing:'0.07em',textTransform:'uppercase',
          color:'var(--c-partner)',fontWeight:'600',marginBottom:'4px',
        }}, 'Regulations'),
        h('div',{style:{
          fontFamily:"'Libre Baskerville',serif",fontSize:'24px',color:'var(--text)',lineHeight:'1.1',
        }}, regulations.length),
        h('div',{style:{fontSize:'11px',color:'var(--muted-2)',marginTop:'3px'}},
          'repair · restore · '+bondingLabel().toLowerCase()+' · self-soothed wobbles')
      ),
    ),
    h('div',{style:{
      marginTop:'14px',paddingTop:'12px',borderTop:'1px solid var(--border)',
      display:'flex',gap:'18px',flexWrap:'wrap',alignItems:'baseline',
    }},
      h('div',{style:{flex:'1',minWidth:'140px'}},
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'3px'}},
          'Median time to regulation'),
        h('div',{style:{
          fontFamily:"'Libre Baskerville',serif",fontSize:'18px',color:'var(--text)',
        }},
          medTTR != null
            ? (medTTR === 0 ? 'Same day' : medTTR < 1 ? '< 1 day' : medTTR.toFixed(1) + ' day' + (medTTR === 1 ? '' : 's'))
            : '—')
      ),
      openItems.length > 0 ? h('div',{style:{flex:'0 0 auto',textAlign:'right'}},
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'3px'}}, 'Still open'),
        h('div',{style:{
          fontFamily:"'Libre Baskerville',serif",fontSize:'18px',color:'var(--c-conflict)',
        }}, openItems.length)
      ) : null
    )
  );

  // ── Scatter chart: one dot per activation ──
  // x = days ago (window-relative), y = time-to-regulation (days), 0..MAX_LOOKAHEAD
  // open activations rendered at top with upward marker
  const W = 320, H = 140, PAD_L = 26, PAD_R = 12, PAD_T = 12, PAD_B = 22;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const xRange = Math.max(1, wDays - 1);
  const yMax = MAX_LOOKAHEAD;

  const xOf = (date) => {
    const offset = daysBetween(date, S.today); // 0..xRange
    // Plot oldest (xRange) on left, newest (0) on right
    return PAD_L + (1 - offset / xRange) * innerW;
  };
  const yOf = (days) => {
    return PAD_T + (1 - Math.min(days, yMax) / yMax) * innerH;
  };

  // Pick dot colour based on activation's primary axis
  const dotColor = (axes) => {
    if (axes.includes('disorganized')) return ATTACHMENT_AXIS_META.disorganized.color;
    if (axes.includes('anxiety'))      return ATTACHMENT_AXIS_META.anxiety.color;
    if (axes.includes('avoidance'))    return ATTACHMENT_AXIS_META.avoidance.color;
    return 'var(--c-conflict)'; // untagged activation — use conflict colour as default
  };

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'display:block;width:100%;height:140px;';

  // Y-axis gridlines and labels (0, 3, 7, 14)
  for (const yv of [0, 3, 7, 14]) {
    const yPx = yOf(yv);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', PAD_L); line.setAttribute('x2', W - PAD_R);
    line.setAttribute('y1', yPx);   line.setAttribute('y2', yPx);
    line.setAttribute('stroke', 'var(--border)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', yv === 0 ? '' : '2,3');
    svg.appendChild(line);

    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', PAD_L - 4);
    lbl.setAttribute('y', yPx + 3);
    lbl.setAttribute('text-anchor', 'end');
    lbl.setAttribute('font-size', '9');
    lbl.setAttribute('fill', 'var(--muted-2)');
    lbl.setAttribute('font-family', "'DM Sans', sans-serif");
    lbl.textContent = yv === 0 ? 'same' : yv + 'd';
    svg.appendChild(lbl);
  }

  // X-axis: oldest / newest labels
  const oldLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  oldLbl.setAttribute('x', PAD_L);
  oldLbl.setAttribute('y', H - 6);
  oldLbl.setAttribute('text-anchor', 'start');
  oldLbl.setAttribute('font-size', '9');
  oldLbl.setAttribute('fill', 'var(--muted-2)');
  oldLbl.setAttribute('font-family', "'DM Sans', sans-serif");
  oldLbl.textContent = wDays + ' days ago';
  svg.appendChild(oldLbl);

  const newLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  newLbl.setAttribute('x', W - PAD_R);
  newLbl.setAttribute('y', H - 6);
  newLbl.setAttribute('text-anchor', 'end');
  newLbl.setAttribute('font-size', '9');
  newLbl.setAttribute('fill', 'var(--muted-2)');
  newLbl.setAttribute('font-family', "'DM Sans', sans-serif");
  newLbl.textContent = 'today';
  svg.appendChild(newLbl);

  // Dots for closed activations
  for (const t of closedItems) {
    const c = t.activation;
    const cx = xOf(c.entry.date);
    const cy = yOf(t.days);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', cx.toFixed(1));
    dot.setAttribute('cy', cy.toFixed(1));
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', dotColor(c.axes));
    dot.setAttribute('opacity', '0.75');
    dot.setAttribute('stroke', 'var(--bg2)');
    dot.setAttribute('stroke-width', '1');
    svg.appendChild(dot);
  }

  // Open markers (upward triangles) at top edge
  for (const t of openItems) {
    const c = t.activation;
    const cx = xOf(c.entry.date);
    const cy = PAD_T;
    const tri = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    const pts = [
      [cx, cy - 4],
      [cx - 4, cy + 4],
      [cx + 4, cy + 4],
    ].map(p => p.join(',')).join(' ');
    tri.setAttribute('points', pts);
    tri.setAttribute('fill', dotColor(c.axes));
    tri.setAttribute('opacity', '0.6');
    svg.appendChild(tri);
  }

  const chart = h('div',{class:'line-chart',style:{marginBottom:'10px'}},
    h('div',{class:'line-chart-title'},
      'Time to regulation',
      h('div',{class:'line-legend'},
        h('div',{class:'line-legend-item'},
          h('span',{style:{
            display:'inline-block',width:'8px',height:'8px',borderRadius:'50%',
            background:'var(--c-conflict)',
          }}),
          'each dot = an activation'
        )
      )
    ),
    svg,
    h('div',{style:{
      fontSize:'10px',color:'var(--muted-2)',marginTop:'8px',lineHeight:'1.5',
      fontStyle:'italic',
    }},
      'Lower dots = faster regulation. ',
      openItems.length > 0
        ? 'Triangles at the top mark activations with no regulation event within ' + MAX_LOOKAHEAD + ' days yet.'
        : 'Dot colour shows the activation\'s flavour — anxiety, avoidance, or disorganized.'
    )
  );

  // ── Trend (first half vs second half) for windows 30+ ──
  let trendBlock = null;
  if (wDays >= 30) {
    const midDate = addDays(S.today, -Math.floor((wDays - 1) / 2));
    const firstHalf  = closedItems.filter(t => t.activation.entry.date <  midDate);
    const secondHalf = closedItems.filter(t => t.activation.entry.date >= midDate);
    const firstMed   = median(firstHalf.map(t => t.days));
    const secondMed  = median(secondHalf.map(t => t.days));

    if (firstMed != null && secondMed != null && firstHalf.length >= 2 && secondHalf.length >= 2) {
      const delta = secondMed - firstMed;
      const direction = delta < -0.5 ? 'down' : delta > 0.5 ? 'up' : 'flat';
      const colors = { down: 'var(--c-partner)', up: 'var(--c-conflict)', flat: 'var(--muted)' };
      const phrases = {
        down: 'Time to regulation has shortened — earlier activations took longer to settle than recent ones.',
        up:   'Time to regulation has lengthened — recent activations have taken longer to settle than earlier ones.',
        flat: 'Time to regulation has stayed roughly steady across the period.',
      };
      trendBlock = h('div',{style:{
        padding:'12px 14px',marginBottom:'10px',
        borderRadius:'12px',background:'var(--bg2)',border:'1px solid var(--border)',
        fontSize:'12px',color:'var(--muted)',lineHeight:'1.7',
        fontFamily:"'Libre Baskerville',serif",fontStyle:'italic',
      }},
        h('div',{style:{display:'flex',gap:'12px',alignItems:'baseline',marginBottom:'6px',fontStyle:'normal'}},
          h('span',{style:{
            fontSize:'10px',letterSpacing:'0.07em',textTransform:'uppercase',
            color:'var(--muted)',fontWeight:'600',
          }}, 'Trajectory'),
          h('span',{style:{
            fontSize:'12px',color:colors[direction],fontFamily:"'Libre Baskerville',serif",
          }},
            firstMed.toFixed(1) + 'd → ' + secondMed.toFixed(1) + 'd'
          )
        ),
        phrases[direction]
      );
    }
  }

  return h('div',{}, headline, chart, trendBlock);
}


// ── Repair landscape ──────────────────────────────────────────────────
// Surfaces repair-specific patterns from the window: total repair count,
// median time-to-repair after a logged rupture, count of unrepaired ruptures,
// and proportional breakdowns of who initiated and how repairs landed.
//
// Distinct from the activation/regulation lens — that treats all regulation
// events generically. This treats repairs as their own thing, since they
// have internal structure (initiator, form, reception, aftermath) that
// other regulation events don't.
//
// Renders nothing if the Repair feature is off or no repairs in window.
function buildRepairLandscape(opts) {
  const { wDays, periodRef, windowStart } = opts;

  if (!S.showRepair) return null;

  // Repairs in window
  const winRepairs = S.allEntries.filter(e =>
    e.category === 'repair' && e.date >= windowStart && e.date <= S.today
  );
  if (winRepairs.length === 0) return null;

  // Ruptures in window: conflicts + relational me-turndowns. We compute
  // time-to-repair = days from rupture to its NEXT repair (in any direction,
  // since repairs are unlinked). Cap look-ahead at 14 days.
  const winConflicts = S.allEntries.filter(e =>
    e.category === 'conflict' && e.date >= windowStart && e.date <= S.today
  );
  const winRelTurndowns = S.allEntries.filter(e =>
    e.category === 'turndown' && e.initiatedBy === 'me' &&
    (e.tdMyReason === 'disconnected' || e.tdMyReason === 'tension') &&
    e.date >= windowStart && e.date <= S.today
  );
  const ruptures = [...winConflicts, ...winRelTurndowns]
    .slice().sort((a, b) => a.date.localeCompare(b.date));

  // For each rupture, find the next repair (any) in the next 14 days
  const REPAIR_LOOKAHEAD = 14;
  const allRepairsSorted = S.allEntries
    .filter(e => e.category === 'repair')
    .slice().sort((a, b) => a.date.localeCompare(b.date));

  const ttrItems = ruptures.map(rup => {
    const next = allRepairsSorted.find(r =>
      r.date >= rup.date && daysBetween(rup.date, r.date) <= REPAIR_LOOKAHEAD
    );
    return {
      rupture: rup,
      days: next ? daysBetween(rup.date, next.date) : null,
    };
  });
  const closedRuptures = ttrItems.filter(t => t.days !== null);
  const unrepairedRuptures = ttrItems.filter(t => t.days === null);

  const median = (nums) => {
    if (!nums.length) return null;
    const s = nums.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid-1] + s[mid]) / 2;
  };
  const medTTR = median(closedRuptures.map(t => t.days));

  // Initiator counts
  const initCounts = { me: 0, mutual: 0, partner: 0, unknown: 0 };
  for (const r of winRepairs) {
    const k = r.repairInitiatedBy;
    if (k === 'me' || k === 'mutual' || k === 'partner') initCounts[k]++;
    else initCounts.unknown++;
  }

  // Reception counts (using REPAIR_RECEPTION order)
  const recOrder = ['accepted','halfway','postponed','deflected','refused'];
  const recCounts = Object.fromEntries(recOrder.map(k => [k, 0]));
  let recUnknown = 0;
  for (const r of winRepairs) {
    if (recOrder.includes(r.repairReception)) recCounts[r.repairReception]++;
    else recUnknown++;
  }
  const recTotal = recOrder.reduce((s, k) => s + recCounts[k], 0);

  // ── Headline numbers ──
  const headline = h('div',{style:{
    padding:'14px 16px',marginBottom:'10px',
    borderRadius:'14px',background:'var(--bg2)',border:'1px solid var(--border)',
  }},
    h('div',{style:{
      display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',
    }},
      // Repair count
      h('div',{},
        h('div',{style:{
          fontSize:'10px',letterSpacing:'0.07em',textTransform:'uppercase',
          color:'var(--c-partner)',fontWeight:'600',marginBottom:'4px',
        }}, 'Repairs'),
        h('div',{style:{
          fontFamily:"'Libre Baskerville',serif",fontSize:'24px',color:'var(--text)',lineHeight:'1.1',
        }}, winRepairs.length),
        h('div',{style:{fontSize:'11px',color:'var(--muted-2)',marginTop:'3px'}},
          periodRef)
      ),
      // Median time-to-repair — suppressed when N < 3 (single data points
      // wearing median's clothes are misleading)
      h('div',{},
        h('div',{style:{
          fontSize:'10px',letterSpacing:'0.07em',textTransform:'uppercase',
          color:'var(--muted)',fontWeight:'600',marginBottom:'4px',
        }}, 'Median time to repair'),
        h('div',{style:{
          fontFamily:"'Libre Baskerville',serif",fontSize:'24px',color:'var(--text)',lineHeight:'1.1',
        }},
          (medTTR != null && closedRuptures.length >= 3)
            ? (medTTR === 0 ? 'Same day' : medTTR < 1 ? '< 1 day' : medTTR.toFixed(1) + (medTTR === 1 ? ' day' : ' days'))
            : '—'),
        h('div',{style:{fontSize:'11px',color:'var(--muted-2)',marginTop:'3px'}},
          ruptures.length === 0
            ? 'no ruptures in window'
            : closedRuptures.length < 3
              ? `${closedRuptures.length} of ${ruptures.length} ruptures so far — needs more data`
              : `from ${closedRuptures.length} of ${ruptures.length} ruptures`)
      ),
    ),
    unrepairedRuptures.length > 0 ? h('div',{style:{
      marginTop:'14px',paddingTop:'12px',borderTop:'1px solid var(--border)',
      display:'flex',justifyContent:'space-between',alignItems:'baseline',
    }},
      h('div',{style:{fontSize:'11px',color:'var(--muted)'}},
        'Unrepaired ruptures'),
      h('div',{style:{
        fontFamily:"'Libre Baskerville',serif",fontSize:'16px',color:'var(--c-conflict)',
      }}, unrepairedRuptures.length)
    ) : null
  );

  // ── Stacked bar helper ──
  const stackedBar = (segments, totalCount) => {
    if (totalCount === 0) return null;
    return h('div',{style:{
      display:'flex',width:'100%',height:'24px',borderRadius:'6px',overflow:'hidden',
      background:'var(--bg3)',border:'1px solid var(--border)',
    }},
      ...segments.map((s, i) => {
        const pct = (s.count / totalCount) * 100;
        if (pct === 0) return null;
        return h('div',{
          title: `${s.label}: ${s.count} (${pct.toFixed(0)}%)`,
          style:{
            width: pct.toFixed(2) + '%',
            background: s.color,
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:'10px',color:'#fff',fontWeight:'500',
            minWidth: pct > 6 ? '0' : '0',  // let very small segments still show colour
          }
        }, pct >= 12 ? String(s.count) : null);
      }).filter(Boolean)
    );
  };

  const segmentLegend = (segments, totalCount) => {
    return h('div',{style:{
      display:'flex',flexWrap:'wrap',gap:'8px 14px',marginTop:'8px',fontSize:'11px',
    }},
      ...segments.map(s => {
        if (s.count === 0) return null;
        const pct = totalCount > 0 ? (s.count / totalCount) * 100 : 0;
        return h('div',{style:{
          display:'flex',alignItems:'center',gap:'5px',color:'var(--muted)',
        }},
          h('span',{style:{
            display:'inline-block',width:'8px',height:'8px',borderRadius:'2px',
            background: s.color,
          }}),
          h('span',{}, s.label, h('span',{style:{color:'var(--muted-2)',marginLeft:'3px'}},
            `${s.count} · ${pct.toFixed(0)}%`))
        );
      }).filter(Boolean)
    );
  };

  // ── Initiator breakdown ──
  // Use neutral but distinguishable colors — no value implied between Me/Mutual/Partner
  const initSegments = [
    { key:'me',      label:'Me reached',          count: initCounts.me,      color:'#7a92b8' },
    { key:'mutual',  label:'Mutual',              count: initCounts.mutual,  color:'#9aa6b8' },
    { key:'partner', label:`${P.Sub} reached`,    count: initCounts.partner, color:'#b08aa6' },
  ];
  const initTotal = initSegments.reduce((s, x) => s + x.count, 0);
  const initBlock = h('div',{style:{
    padding:'14px 16px',marginBottom:'10px',
    borderRadius:'14px',background:'var(--bg2)',border:'1px solid var(--border)',
  }},
    h('div',{style:{
      fontSize:'10px',letterSpacing:'0.07em',textTransform:'uppercase',
      color:'var(--muted)',fontWeight:'600',marginBottom:'10px',
    }}, 'Who reached first'),
    initTotal > 0
      ? h('div',{}, stackedBar(initSegments, initTotal), segmentLegend(initSegments, initTotal))
      : h('div',{style:{fontSize:'11px',color:'var(--muted-2)',fontStyle:'italic'}},
          'Initiator not recorded on these repairs.'),
    initCounts.unknown > 0 ? h('div',{style:{
      fontSize:'10px',color:'var(--muted-2)',marginTop:'6px',fontStyle:'italic',
    }}, `${initCounts.unknown} repair${initCounts.unknown === 1 ? '' : 's'} without initiator data`) : null
  );

  // ── Reception breakdown ──
  // Color gradient: secure-green for accepted → muted middle → conflict-red for refused
  const recSegments = [
    { key:'accepted',  label:'Accepted',     count: recCounts.accepted,  color:'#4dc478' },
    { key:'halfway',   label:'Met halfway',  count: recCounts.halfway,   color:'#a8b87a' },
    { key:'postponed', label:'Postponed',    count: recCounts.postponed, color:'#9aa6b8' },
    { key:'deflected', label:'Deflected',    count: recCounts.deflected, color:'#d4a06a' },
    { key:'refused',   label:'Refused',      count: recCounts.refused,   color:'#d47a7a' },
  ];
  const recBlock = h('div',{style:{
    padding:'14px 16px',marginBottom:'10px',
    borderRadius:'14px',background:'var(--bg2)',border:'1px solid var(--border)',
  }},
    h('div',{style:{
      fontSize:'10px',letterSpacing:'0.07em',textTransform:'uppercase',
      color:'var(--muted)',fontWeight:'600',marginBottom:'10px',
    }}, 'How they landed'),
    recTotal > 0
      ? h('div',{}, stackedBar(recSegments, recTotal), segmentLegend(recSegments, recTotal))
      : h('div',{style:{fontSize:'11px',color:'var(--muted-2)',fontStyle:'italic'}},
          'Reception not recorded on these repairs.')
  );

  return h('div',{}, headline, initBlock, recBlock);
}

// ── Attachment grid (Bartholomew & Horowitz 2-axis model) ─────────────
// Renders a 2D scatter where each tagged entry becomes a dot positioned
// by its tag mix on the anxiety axis (Y) and avoidance axis (X). Four
// quadrants emerge: Secure (low/low), Anxious (high anxiety), Avoidant
// (high avoidance), Disorganized (high both).
//
// This is a *position* visualisation, not a typing one — moments cluster
// into clouds; clouds shift over time. The same tag combination always
// lands in the same place, so the cloud's shape and centroid are honest
// reflections of the tagged data, not a personality verdict.
function buildAttachmentGrid(opts) {
  const { taggedEntries, periodRef } = opts;

  const dictFor = (e) => {
    if (e.category === 'conflict')   return CONFLICT_ATTACHMENT_TAGS;
    if (e.category === 'regulation') return WOBBLE_ATTACHMENT_TAGS;
    if (e.category === 'turndown')   return e.initiatedBy === 'me' ? TURNDOWN_MY_TAGS : TURNDOWN_PARTNER_TAGS;
    if (e.category === 'affection')  return BONDING_ATTACHMENT_TAGS;
    if (e.category === 'repair')     return REPAIR_ATTACHMENT_TAGS;
    return null;
  };

  // Compute (x, y) for each tagged entry. Output is in plot space [0..1].
  // Math: for each entry, count tags by axis, then:
  //   anxietyPull   = nA + 0.5*nD - 0.5*nS
  //   avoidancePull = nV + 0.5*nD - 0.5*nS
  // Plus an "absence pull": when one of anxiety/avoidance is tagged and
  // the other isn't, push the dot away from the un-tagged axis. Tagging is
  // intentional multi-select, so an unchecked option carries information.
  // Map to plot coords with a 0.5 baseline (untagged → center) and
  // divide by 4 so typical entries (1-2 tags) sit comfortably inside.
  const positions = taggedEntries.map(e => {
    const dict = dictFor(e);
    if (!dict) return null;
    let nA = 0, nV = 0, nS = 0, nD = 0;
    for (const val of e.attachmentTags) {
      const t = dict.find(x => x.val === val);
      if (!t) continue;
      if (t.axis === 'anxiety')      nA++;
      else if (t.axis === 'avoidance')   nV++;
      else if (t.axis === 'secure')      nS++;
      else if (t.axis === 'disorganized') nD++;
    }
    let anxietyPull   = nA + 0.5 * nD - 0.5 * nS;
    let avoidancePull = nV + 0.5 * nD - 0.5 * nS;
    // Absence pulls — anxiety-tagged-but-no-avoidance pushes dot left;
    // avoidance-tagged-but-no-anxiety pushes dot down. Disorganized tags
    // count as implicit signal on both axes, so they suppress this.
    if (nA > 0 && nV === 0 && nD === 0) avoidancePull -= 0.5;
    if (nV > 0 && nA === 0 && nD === 0) anxietyPull   -= 0.5;
    const x = Math.max(0.02, Math.min(0.98, 0.5 + avoidancePull / 4));
    const y = Math.max(0.02, Math.min(0.98, 0.5 + anxietyPull   / 4));
    return { entry: e, x, y };
  }).filter(Boolean);

  // ── Empty state ──
  if (positions.length === 0) {
    return h('div',{style:{
      padding:'20px',marginBottom:'14px',
      borderRadius:'14px',background:'var(--bg2)',border:'1px solid var(--border)',
      fontSize:'12px',color:'var(--muted-2)',fontStyle:'italic',
      fontFamily:"'Libre Baskerville',serif",lineHeight:'1.7',textAlign:'center',
    }}, 'Tag a few entries to see your moments take shape on the grid.');
  }

  // Centroid — average position
  const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
  const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;

  // ── SVG layout ──
  // Square plot with axis labels around the edges.
  const W = 320, H = 320;
  const PAD_T = 28, PAD_B = 28, PAD_L = 36, PAD_R = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xPx = (x) => PAD_L + x * innerW;
  const yPx = (y) => PAD_T + (1 - y) * innerH; // y=0 (low anxiety) at bottom

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.style.cssText = 'display:block;width:100%;max-width:340px;margin:0 auto;height:auto;';

  // Quadrant tints — each corner gets a faint axis-coloured wash.
  // q.x / q.y is the BOTTOM-LEFT corner in plot data space:
  //   x: 0 = low avoidance (left), 0.5 = high avoidance (right)
  //   y: 0 = low anxiety (bottom of screen), 0.5 = high anxiety (top)
  // Labels: labelY uses plot data space too — 0.04 = near bottom of screen,
  // 0.96 = near top.
  const quadrants = [
    // Bottom-left: low anxiety + low avoidance = Secure
    {x:0,    y:0,    w:0.5, h:0.5, axis:'secure',       label:'Secure',       labelX:0.04, labelY:0.08},
    // Top-left: high anxiety + low avoidance = Anxious
    {x:0,    y:0.5,  w:0.5, h:0.5, axis:'anxiety',      label:'Anxious',      labelX:0.04, labelY:0.92},
    // Bottom-right: low anxiety + high avoidance = Avoidant
    {x:0.5,  y:0,    w:0.5, h:0.5, axis:'avoidance',    label:'Avoidant',     labelX:0.96, labelY:0.08},
    // Top-right: high anxiety + high avoidance = Disorganized
    {x:0.5,  y:0.5,  w:0.5, h:0.5, axis:'disorganized', label:'Disorganized', labelX:0.96, labelY:0.92},
  ];

  for (const q of quadrants) {
    const meta = ATTACHMENT_AXIS_META[q.axis];
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', xPx(q.x));
    rect.setAttribute('y', yPx(q.y + q.h));
    rect.setAttribute('width',  innerW * q.w);
    rect.setAttribute('height', innerH * q.h);
    rect.setAttribute('fill', meta.color);
    rect.setAttribute('opacity', '0.06');
    svg.appendChild(rect);
  }

  // Axis cross-lines (the "midpoint" cross)
  const midH = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  midH.setAttribute('x1', PAD_L); midH.setAttribute('x2', PAD_L + innerW);
  midH.setAttribute('y1', yPx(0.5)); midH.setAttribute('y2', yPx(0.5));
  midH.setAttribute('stroke', 'var(--border-mid)');
  midH.setAttribute('stroke-width', '1');
  midH.setAttribute('stroke-dasharray', '2,3');
  svg.appendChild(midH);

  const midV = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  midV.setAttribute('x1', xPx(0.5)); midV.setAttribute('x2', xPx(0.5));
  midV.setAttribute('y1', PAD_T); midV.setAttribute('y2', PAD_T + innerH);
  midV.setAttribute('stroke', 'var(--border-mid)');
  midV.setAttribute('stroke-width', '1');
  midV.setAttribute('stroke-dasharray', '2,3');
  svg.appendChild(midV);

  // Outer plot border
  const border = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  border.setAttribute('x', PAD_L);
  border.setAttribute('y', PAD_T);
  border.setAttribute('width', innerW);
  border.setAttribute('height', innerH);
  border.setAttribute('fill', 'none');
  border.setAttribute('stroke', 'var(--border)');
  border.setAttribute('stroke-width', '1');
  svg.appendChild(border);

  // Quadrant labels (corner-anchored italics)
  for (const q of quadrants) {
    const meta = ATTACHMENT_AXIS_META[q.axis];
    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', xPx(q.labelX));
    lbl.setAttribute('y', yPx(q.labelY));
    lbl.setAttribute('text-anchor', q.labelX < 0.5 ? 'start' : 'end');
    lbl.setAttribute('font-size', '10');
    lbl.setAttribute('font-style', 'italic');
    lbl.setAttribute('font-family', "'Libre Baskerville', serif");
    lbl.setAttribute('fill', meta.color);
    lbl.setAttribute('opacity', '0.85');
    lbl.textContent = q.label;
    svg.appendChild(lbl);
  }

  // Axis labels (outside the plot)
  const axisLabel = (text, x, y, anchor, rotate) => {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor', anchor);
    t.setAttribute('font-size', '9');
    t.setAttribute('font-family', "'DM Sans', sans-serif");
    t.setAttribute('letter-spacing', '0.07em');
    t.setAttribute('fill', 'var(--muted-2)');
    if (rotate) t.setAttribute('transform', `rotate(${rotate} ${x} ${y})`);
    t.textContent = text;
    return t;
  };

  // X axis: AVOIDANCE (low ← → high) along bottom
  svg.appendChild(axisLabel('LOW',  PAD_L,           H - 8, 'start', 0));
  svg.appendChild(axisLabel('AVOIDANCE →', W/2,      H - 8, 'middle', 0));
  svg.appendChild(axisLabel('HIGH', PAD_L + innerW,  H - 8, 'end',   0));
  // Y axis: ANXIETY (low ← bottom, high ← top) along left, rotated
  svg.appendChild(axisLabel('LOW',  12, PAD_T + innerH, 'middle', -90));
  svg.appendChild(axisLabel('ANXIETY →', 12, PAD_T + innerH/2, 'middle', -90));
  svg.appendChild(axisLabel('HIGH', 12, PAD_T,         'middle', -90));

  // Plot dots — same size, slight transparency so density emerges naturally
  for (const p of positions) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', xPx(p.x).toFixed(1));
    dot.setAttribute('cy', yPx(p.y).toFixed(1));
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', 'var(--text)');
    dot.setAttribute('opacity', '0.32');
    svg.appendChild(dot);
  }

  // Centroid — distinct marker, muted styling
  const centroidGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const cOuter = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  cOuter.setAttribute('cx', xPx(cx).toFixed(1));
  cOuter.setAttribute('cy', yPx(cy).toFixed(1));
  cOuter.setAttribute('r', '9');
  cOuter.setAttribute('fill', 'none');
  cOuter.setAttribute('stroke', 'var(--text)');
  cOuter.setAttribute('stroke-width', '1.5');
  cOuter.setAttribute('opacity', '0.7');
  centroidGroup.appendChild(cOuter);
  const cInner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  cInner.setAttribute('cx', xPx(cx).toFixed(1));
  cInner.setAttribute('cy', yPx(cy).toFixed(1));
  cInner.setAttribute('r', '2');
  cInner.setAttribute('fill', 'var(--text)');
  cInner.setAttribute('opacity', '0.85');
  centroidGroup.appendChild(cInner);
  svg.appendChild(centroidGroup);

  // Container with a small caption
  return h('div',{style:{
    padding:'14px 16px 18px',marginBottom:'14px',
    borderRadius:'14px',background:'var(--bg2)',border:'1px solid var(--border)',
  }},
    svg,
    h('div',{style:{
      marginTop:'10px',
      fontSize:'11px',color:'var(--muted-2)',lineHeight:'1.6',
      display:'flex',justifyContent:'space-between',alignItems:'baseline',gap:'10px',
    }},
      h('span',{style:{flex:'1',minWidth:'0',fontStyle:'italic'}},
        'Each dot is a tagged moment ' + periodRef + '. The ringed marker is your tendency — the average position of all your moments in this window.'),
      h('span',{style:{flexShrink:'0',color:'var(--muted-3)'}}, positions.length + ' moments')
    )
  );
}


// Pattern-observation engine for the Attachment tab.
//
// Inputs:
//   taggedEntries  — entries in window that have attachmentTags
//   axisCounts     — { anxiety:N, avoidance:N, secure:N, disorganized:N }
//   tagCounts      — { 'axis::val': {axis, val, label, count}, ... }
//   wDays          — current window size (0 = all)
//   periodRef      — text to refer to the current period (e.g. "this week")
//   prevAxisCounts — same shape as axisCounts but for the previous equal window
//   winRepairs     — repair entries in window
//   winAllEntries  — all entries (any kind) in window, for sequence checks
function buildAttachmentObservations(opts) {
  const {
    taggedEntries, axisCounts, tagCounts, wDays, periodRef,
    prevAxisCounts, winRepairs, winAllEntries,
  } = opts;

  const totalTagOccurrences = Object.values(tagCounts).reduce((s, t) => s + t.count, 0);

  // Helpers
  const axisHas = (axis) => (axisCounts[axis] || 0) > 0;
  const dominant = (axis) => {
    if (!totalTagOccurrences) return false;
    const others = ATTACHMENT_AXIS_ORDER.filter(a => a !== axis).reduce((s,a) => s + (axisCounts[a]||0), 0);
    return (axisCounts[axis] || 0) >= 2 && (axisCounts[axis] || 0) > others;
  };

  // Find tagged entries that have any tag of a given axis
  const entriesWithAxis = (axis) => taggedEntries.filter(e => {
    const dict =
      e.category === 'conflict'   ? CONFLICT_ATTACHMENT_TAGS :
      e.category === 'regulation' ? WOBBLE_ATTACHMENT_TAGS :
      e.category === 'turndown'   ? (e.initiatedBy === 'me' ? TURNDOWN_MY_TAGS : TURNDOWN_PARTNER_TAGS) :
      e.category === 'affection'  ? BONDING_ATTACHMENT_TAGS :
      e.category === 'repair'     ? REPAIR_ATTACHMENT_TAGS : null;
    if (!dict) return false;
    return e.attachmentTags.some(val => {
      const t = dict.find(x => x.val === val);
      return t && t.axis === axis;
    });
  });

  // Conflicts in window (whether tagged or not)
  const winConflicts = winAllEntries.filter(e => e.category === 'conflict');
  // Bondings in window
  const winBondings = winAllEntries.filter(e => e.category === 'affection');
  // Your-side relational turn-downs
  const winMyTurndowns = winAllEntries.filter(e =>
    e.category === 'turndown' && e.initiatedBy === 'me'
  );

  // Sequence: did entry X precede an entry of category Y within N days?
  const followedBy = (e, cats, days) => {
    const since = e.date;
    const until = addDays(e.date, days);
    return winAllEntries.some(other =>
      other !== e && other.date >= since && other.date <= until &&
      cats.includes(other.category)
    );
  };

  // Conflicts / your-side relational turn-downs that have NO repair within 7 days
  const ruptures = [
    ...winConflicts,
    ...winMyTurndowns.filter(e => e.tdMyReason === 'disconnected' || e.tdMyReason === 'tension')
  ];
  const ruptureRepairGap = 7;
  const unrepairedRuptures = ruptures.filter(e => !followedBy(e, ['repair'], ruptureRepairGap));

  // Repair pattern stats
  const repairsByMe      = winRepairs.filter(r => r.repairInitiatedBy === 'me');
  const repairsByPartner = winRepairs.filter(r => r.repairInitiatedBy === 'partner');
  const repairsAccepted  = winRepairs.filter(r => r.repairReception === 'accepted');
  const repairsRefused   = winRepairs.filter(r => r.repairReception === 'refused' || r.repairReception === 'deflected');

  const candidates = [

    // ── Disorganized presence ─────────────────────────────────────────
    {
      priority: 100,
      icon: '🌀',
      title: 'Disorganized cues clustering',
      tone: 'concern',
      n: () => axisCounts.disorganized || 0,
      test: (axisCounts.disorganized || 0) >= 3,
      body: () => `Disorganized cues showed up ${axisCounts.disorganized} times ${periodRef} — moments of going blank, push-pull, or feeling unreal. These tend to cluster around real strain in the system. Worth noting what was happening around each.`,
    },
    {
      priority: 90,
      icon: '🌀',
      title: 'Disorganized cue appeared',
      tone: 'concern',
      n: () => axisCounts.disorganized || 0,
      test: axisHas('disorganized') && (axisCounts.disorganized || 0) < 3,
      body: () => `Disorganized cue${axisCounts.disorganized === 1 ? '' : 's'} appeared ${periodRef}. Even a single moment of going blank or push-pull is worth paying attention to — these often mark moments where something deeper was activated.`,
    },

    // ── Push-pull dynamic ─────────────────────────────────────────────
    {
      priority: 85,
      icon: '↔',
      title: 'Push-pull dynamic',
      tone: 'mixed',
      n: () => (axisCounts.anxiety || 0) + (axisCounts.avoidance || 0),
      test: (axisCounts.anxiety || 0) >= 2 && (axisCounts.avoidance || 0) >= 2,
      body: () => `Both anxiety and avoidance cues present ${periodRef} — the system pulled in both directions across different moments. Sometimes that's adaptation to a varied landscape; sometimes it's a push-pull rhythm. Worth noticing whether they alternate by day, or fire close together.`,
    },

    // ── Axis dominance ────────────────────────────────────────────────
    {
      priority: 80,
      icon: '🔥',
      title: 'Anxiety-flavoured cues',
      tone: 'concern',
      n: () => axisCounts.anxiety || 0,
      test: dominant('anxiety') && (axisCounts.anxiety || 0) >= 4,
      body: () => `Anxiety-flavoured cues ${periodRef} (${axisCounts.anxiety} of ${totalTagOccurrences}) — your system has been pulling toward connection, scanning for distance. Worth noticing what the reaching has been responding to.`,
    },
    {
      priority: 80,
      icon: '🚪',
      title: 'Avoidance-flavoured cues',
      tone: 'concern',
      n: () => axisCounts.avoidance || 0,
      test: dominant('avoidance') && (axisCounts.avoidance || 0) >= 4,
      body: () => `Avoidance-flavoured cues ${periodRef} (${axisCounts.avoidance} of ${totalTagOccurrences}) — your system has been pulling toward distance, away from closeness. Worth noticing what closeness has been costing.`,
    },

    // ── Unrepaired ruptures ───────────────────────────────────────────
    {
      priority: 75,
      icon: '🛡',
      title: 'Unrepaired ruptures',
      tone: 'critical',
      n: () => unrepairedRuptures.length,
      test: unrepairedRuptures.length >= 2,
      body: () => `${unrepairedRuptures.length} ruptures ${periodRef} without a logged repair within ${ruptureRepairGap} days — conflicts or relational turn-downs left unmetabolised. Repair doesn't always need to be elaborate, but the gap is itself data.`,
    },
    {
      priority: 70,
      icon: '🛡',
      title: 'A rupture without repair',
      tone: 'concern',
      n: () => 1,
      test: unrepairedRuptures.length === 1 && winRepairs.length === 0,
      body: () => `One rupture ${periodRef} with no repair logged afterward. Worth checking whether reconnection happened informally — and if it did, consider logging it.`,
    },

    // ── Repair patterns ───────────────────────────────────────────────
    {
      priority: 65,
      icon: '🤝',
      title: 'You did the reaching',
      tone: 'concern',
      n: () => winRepairs.length,
      test: winRepairs.length >= 2 && repairsByMe.length === winRepairs.length,
      body: () => `Every logged repair ${periodRef} was initiated by you (${winRepairs.length} of ${winRepairs.length}). The reaching has been one-sided — worth noticing what that's costing or whether it's sustainable.`,
    },
    {
      priority: 65,
      icon: '🤝',
      title: `${P.Sub} did the reaching`,
      tone: 'mixed',
      n: () => winRepairs.length,
      test: winRepairs.length >= 2 && repairsByPartner.length === winRepairs.length,
      body: () => `Every logged repair ${periodRef} was initiated by ${P.obj} (${winRepairs.length} of ${winRepairs.length}). Worth noticing what kept you from reaching first.`,
    },
    {
      priority: 60,
      icon: '✕',
      title: 'Repairs not landing',
      tone: 'critical',
      n: () => winRepairs.length,
      test: winRepairs.length >= 2 && repairsRefused.length >= Math.ceil(winRepairs.length / 2),
      body: () => `Repairs ${periodRef} have largely been deflected or refused (${repairsRefused.length} of ${winRepairs.length}). Bridges offered without a meeting on the other side — worth pausing on.`,
    },

    // ── Closeness-then-withdrawal sequence ────────────────────────────
    {
      priority: 55,
      icon: '🩷→🚪',
      title: 'Closeness then withdrawal',
      tone: 'mixed',
      n: () => entriesWithAxis('avoidance').length,
      test: (() => {
        const bondingDates = new Set(winBondings.map(e => e.date));
        const avoidantEntries = entriesWithAxis('avoidance');
        return avoidantEntries.some(e => {
          const dayBefore = addDays(e.date, -1);
          return bondingDates.has(dayBefore) || bondingDates.has(addDays(e.date, -2));
        }) && entriesWithAxis('avoidance').length >= 2;
      })(),
      body: () => `Avoidance cues clustered after ${bondingLabel().toLowerCase()} days ${periodRef} — a pattern where closeness is followed by needing distance. Common rhythm; worth noticing when it shows up.`,
    },

    // ── Anxious reaching met ──────────────────────────────────────────
    {
      priority: 50,
      icon: '🔥→🤝',
      title: 'Anxious reaching met',
      tone: 'positive',
      n: () => entriesWithAxis('anxiety').filter(e =>
        e.category === 'regulation' || e.category === 'conflict'
      ).length,
      test: (() => {
        const anxiousEntries = entriesWithAxis('anxiety').filter(e =>
          e.category === 'regulation' || e.category === 'conflict'
        );
        if (anxiousEntries.length < 2) return false;
        const metCount = anxiousEntries.filter(e =>
          followedBy(e, ['affection', 'repair'], 1)
        ).length;
        return metCount >= 2 && metCount >= anxiousEntries.length / 2;
      })(),
      body: () => `Anxious activation ${periodRef} was followed by ${bondingLabel().toLowerCase()} or repair within a day, more than once — your reaching has been finding a response. Worth naming when it does.`,
    },

    // ── Movement vs prior window ──────────────────────────────────────
    {
      priority: 45,
      icon: '🌤️',
      title: 'No disorganized cues',
      tone: 'positive',
      n: null,
      test: prevAxisCounts && (axisCounts.disorganized || 0) === 0 && (prevAxisCounts.disorganized || 0) >= 2,
      body: () => `No disorganized cues ${periodRef}, down from ${prevAxisCounts.disorganized} in the previous period. A steadier stretch.`,
    },
    {
      priority: 45,
      icon: '🌤️',
      title: 'No anxious cues',
      tone: 'positive',
      n: null,
      test: prevAxisCounts && (axisCounts.anxiety || 0) === 0 && (prevAxisCounts.anxiety || 0) >= 3,
      body: () => `No anxious cues ${periodRef}, down from ${prevAxisCounts.anxiety} in the previous period. Either the conditions changed, or your relationship to them did.`,
    },
    {
      priority: 45,
      icon: '📈',
      title: 'Secure cues rising',
      tone: 'positive',
      n: () => axisCounts.secure || 0,
      test: prevAxisCounts && (axisCounts.secure || 0) >= (prevAxisCounts.secure || 0) + 3 && (axisCounts.secure || 0) >= 4,
      body: () => `Secure cues up ${periodRef} (${axisCounts.secure}, from ${prevAxisCounts.secure || 0} previously). Capacity to stay engaged is showing — that's the visible record of building something.`,
    },

    // ── Positive: secure-dominant ─────────────────────────────────────
    {
      priority: 40,
      icon: '🟢',
      title: 'Secure-dominant pattern',
      tone: 'positive',
      n: () => axisCounts.secure || 0,
      test: dominant('secure') && (axisCounts.secure || 0) >= 4,
      body: () => `Secure cues ${periodRef} (${axisCounts.secure} of ${totalTagOccurrences}) — staying with what's present, hearing things out, taking accountability. The pattern that builds ground.`,
    },

    // ── Repair landing well ───────────────────────────────────────────
    {
      priority: 35,
      icon: '🌉',
      title: 'Repairs landing',
      tone: 'positive',
      n: () => winRepairs.length,
      test: winRepairs.length >= 2 && repairsAccepted.length >= Math.ceil(winRepairs.length * 2 / 3),
      body: () => `Most repairs ${periodRef} were accepted (${repairsAccepted.length} of ${winRepairs.length}). The bridges are holding when offered.`,
    },

    // ── Fast repair pattern ───────────────────────────────────────────
    {
      priority: 38,
      icon: '↻',
      title: 'Fast repair pattern',
      tone: 'positive',
      n: () => winRepairs.length,
      test: (() => {
        if (winRepairs.length < 3) return false;
        const ruptures = winAllEntries.filter(e =>
          e.category === 'conflict' ||
          (e.category === 'turndown' && e.initiatedBy === 'me' &&
            (e.tdMyReason === 'disconnected' || e.tdMyReason === 'tension'))
        );
        if (ruptures.length < 3) return false;
        const sortedRepairs = winAllEntries.filter(e => e.category === 'repair')
          .slice().sort((a, b) => a.date.localeCompare(b.date));
        const gaps = ruptures.map(rup => {
          const next = sortedRepairs.find(r =>
            r.date >= rup.date && daysBetween(rup.date, r.date) <= 14
          );
          return next ? daysBetween(rup.date, next.date) : null;
        }).filter(g => g !== null);
        if (gaps.length < 3) return false;
        const fast = gaps.filter(g => g <= 1).length;
        return fast >= Math.ceil(gaps.length * 2 / 3);
      })(),
      body: () => `Most ruptures ${periodRef} got repaired same-day or next-day. That speed is the visible record of secure functioning — the system finds its way back without long stretches of distance.`,
    },

    // ── Slow repair pattern ───────────────────────────────────────────
    {
      priority: 42,
      icon: '⌛',
      title: 'Slow repair pattern',
      tone: 'concern',
      n: () => winRepairs.length,
      test: (() => {
        if (winRepairs.length < 2) return false;
        const ruptures = winAllEntries.filter(e =>
          e.category === 'conflict' ||
          (e.category === 'turndown' && e.initiatedBy === 'me' &&
            (e.tdMyReason === 'disconnected' || e.tdMyReason === 'tension'))
        );
        if (ruptures.length < 2) return false;
        const sortedRepairs = winAllEntries.filter(e => e.category === 'repair')
          .slice().sort((a, b) => a.date.localeCompare(b.date));
        const gaps = ruptures.map(rup => {
          const next = sortedRepairs.find(r =>
            r.date >= rup.date && daysBetween(rup.date, r.date) <= 14
          );
          return next ? daysBetween(rup.date, next.date) : null;
        }).filter(g => g !== null);
        if (gaps.length < 2) return false;
        const slow = gaps.filter(g => g >= 3).length;
        return slow >= Math.ceil(gaps.length * 2 / 3);
      })(),
      body: () => `Repairs ${periodRef} have been taking three or more days after ruptures. The distance between rupture and bridging is itself data — neither good nor bad, but worth noticing.`,
    },

    // ── Form-of-repair clustering ─────────────────────────────────────
    {
      priority: 30,
      icon: '📐',
      title: 'Repair vocabulary settling',
      tone: 'mixed',
      n: () => winRepairs.length,
      test: (() => {
        if (winRepairs.length < 4) return false;
        const formCounts = {};
        for (const r of winRepairs) {
          const forms = Array.isArray(r.repairForm) ? r.repairForm
            : (typeof r.repairForm === 'string' && r.repairForm ? [r.repairForm] : []);
          for (const v of forms) formCounts[v] = (formCounts[v] || 0) + 1;
        }
        const total = Object.values(formCounts).reduce((s, n) => s + n, 0);
        if (total === 0) return false;
        const top = Object.entries(formCounts).sort((a, b) => b[1] - a[1])[0];
        return top && top[1] >= Math.ceil(total * 2 / 3);
      })(),
      body: () => {
        const formCounts = {};
        for (const r of winRepairs) {
          const forms = Array.isArray(r.repairForm) ? r.repairForm
            : (typeof r.repairForm === 'string' && r.repairForm ? [r.repairForm] : []);
          for (const v of forms) formCounts[v] = (formCounts[v] || 0) + 1;
        }
        const top = Object.entries(formCounts).sort((a, b) => b[1] - a[1])[0];
        const formObj = REPAIR_FORM.find(f => f.val === top[0]);
        const formLabel = formObj ? formObj.label.toLowerCase() : top[0];
        return `Most repairs ${periodRef} took the same shape — ${formLabel}. Repair vocabulary tends to settle into patterns; worth noticing what your dominant form tells you about how reconnection works between you.`;
      },
    },
  ];

  // Pick top 3 matches by priority — return rich card data
  const matched = candidates
    .filter(c => c.test)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  return matched.map(c => ({
    icon: c.icon,
    title: c.title,
    body: c.body(),
    tone: c.tone,
    n: typeof c.n === 'function' ? c.n() : c.n,
  }));
}

// Collapsible section wrapper used on the Lens tab for "deeper data" sections
// that aren't always-on. State is held on S in a per-section flag, so each
// section remembers independently within a session. Defaults to collapsed
// (the user opts in to seeing the data).
//
// opts:
//   stateKey      — name of the boolean flag on S (e.g. 'lensRepairExpanded')
//   title         — section title shown in the header
//   subtitleOpen  — line shown under title when expanded
//   subtitleClosed— line shown under title when collapsed (the "tap to..." invite)
//   body          — DOM element to reveal when expanded
function buildLensCollapsible(opts) {
  const { stateKey, title, subtitleOpen, subtitleClosed, body } = opts;
  const expanded = !!S[stateKey];
  const header = h('div',{
    style:{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'12px 16px',cursor:'pointer',
      background:'var(--bg2)',border:'1px solid var(--border)',
      borderRadius: expanded ? '14px 14px 0 0' : '14px',
      borderBottom: expanded ? '1px solid var(--border)' : '1px solid var(--border)',
    },
    onclick: () => { S[stateKey] = !S[stateKey]; render(); }
  },
    h('div',{style:{flex:'1',minWidth:'0'}},
      h('div',{style:{
        fontSize:'13px',color:'var(--text)',fontWeight:'600',
      }}, title),
      h('div',{style:{
        fontSize:'11px',color:'var(--muted-2)',marginTop:'2px',
      }}, expanded ? subtitleOpen : subtitleClosed)
    ),
    h('span',{style:{
      fontSize:'14px',color:'var(--muted-2)',flexShrink:'0',marginLeft:'10px',
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
      transition:'transform 0.2s',
    }}, '›')
  );
  if (!expanded) return h('div',{style:{marginBottom:'10px'}}, header);
  // When expanded: header + body in a styled container that flows visually
  return h('div',{style:{marginBottom:'14px'}},
    header,
    h('div',{style:{
      padding:'14px 14px 4px',
      background:'var(--bg2)',
      border:'1px solid var(--border)',borderTop:'none',
      borderRadius:'0 0 14px 14px',
    }}, body)
  );
}

function buildAttachmentPanel() {
  const section = (title) => h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},title));

  // Lens uses all entries. windowStart is the earliest entry date so chart
  // axes still scale correctly; wDays is the span in days for any callee
  // that needs a numeric range.
  const earliestDate = S.allEntries.length > 0
    ? S.allEntries.reduce((min, e) => e.date < min ? e.date : min, S.today)
    : S.today;
  const windowStart = earliestDate;
  const wDays = Math.max(1, daysBetween(earliestDate, S.today) + 1);
  const winLabel = 'All Time';

  // Period reference phrase used by observations and section labels
  const periodRef = 'overall';

  // ── Collect tagged entries in window ────────────────────────────────
  // Returns the dictionary used for tag lookup based on entry type
  const dictFor = (e) => {
    if (e.category === 'conflict')   return CONFLICT_ATTACHMENT_TAGS;
    if (e.category === 'regulation') return WOBBLE_ATTACHMENT_TAGS;
    if (e.category === 'turndown')   return e.initiatedBy === 'me' ? TURNDOWN_MY_TAGS : TURNDOWN_PARTNER_TAGS;
    if (e.category === 'affection')  return BONDING_ATTACHMENT_TAGS;
    if (e.category === 'repair')     return REPAIR_ATTACHMENT_TAGS;
    return null;
  };

  const taggedEntries = S.allEntries
    .filter(e => e.date >= windowStart && e.date <= S.today)
    .filter(e => Array.isArray(e.attachmentTags) && e.attachmentTags.length > 0)
    .filter(e => dictFor(e))
    .sort((a, b) => {
      // Newest first, by date then id
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.id || 0) - (a.id || 0);
    });

  // Repair entries in window (counted separately for the data summary)
  const winRepairs = S.allEntries.filter(e =>
    e.category === 'repair' && e.date >= windowStart && e.date <= S.today
  );

  // ── Tag frequency aggregation ───────────────────────────────────────
  // Key: axis::val::label so we can render with proper color and label later
  // Aggregated by exact tag (not just axis) so identical tags from different
  // entry types collapse together when their val matches.
  const tagCounts = {};   // { 'axis::val' : { axis, val, label, count } }
  const axisCounts = { anxiety:0, avoidance:0, secure:0, disorganized:0 };

  for (const e of taggedEntries) {
    const dict = dictFor(e);
    for (const val of e.attachmentTags) {
      const t = dict.find(x => x.val === val);
      if (!t) continue;
      const key = t.axis + '::' + t.val;
      if (!tagCounts[key]) tagCounts[key] = { axis: t.axis, val: t.val, label: t.label, count: 0 };
      tagCounts[key].count++;
      if (axisCounts[t.axis] != null) axisCounts[t.axis]++;
    }
  }

  const totalTagOccurrences = Object.values(tagCounts).reduce((s, t) => s + t.count, 0);
  const maxTagCount = Object.values(tagCounts).reduce((m, t) => Math.max(m, t.count), 0);

  // ── Framing card ────────────────────────────────────────────────────
  const framing = h('div',{style:{
    padding:'16px 18px',marginBottom:'14px',
    borderRadius:'14px',background:'var(--bg2)',border:'1px solid var(--border)',
  }},
    h('div',{style:{
      fontFamily:"'Libre Baskerville',serif",fontStyle:'italic',
      fontSize:'15px',color:'var(--text)',marginBottom:'8px',lineHeight:'1.5',
    }}, 'A lens for noticing — not labelling.'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',lineHeight:'1.65',marginBottom:'12px'}},
      'This lens looks at moments through the framing of attachment — the patterns of reaching, withdrawing, settling, and sometimes both at once that show up across conflicts, wobbles, turn-downs, bonding and repair. What you tag here is your reading of yourself, after the fact. The patterns below are observations, not diagnoses — and they get more honest the more you log.'),
    h('div',{style:{
      paddingTop:'10px',borderTop:'1px solid var(--border)',
      display:'flex',gap:'18px',flexWrap:'wrap',
      fontSize:'11px',color:'var(--muted-2)',
    }},
      h('span',{}, h('strong',{style:{color:'var(--muted)',fontWeight:'500'}}, taggedEntries.length), ' tagged entries'),
      h('span',{}, h('strong',{style:{color:'var(--muted)',fontWeight:'500'}}, totalTagOccurrences), ' tags placed'),
      winRepairs.length > 0 ? h('span',{}, h('strong',{style:{color:'var(--muted)',fontWeight:'500'}}, winRepairs.length), ' repairs') : null,
      h('span',{style:{marginLeft:'auto',color:'var(--muted-3)'}}, 'in ' + winLabel.toLowerCase()),
    )
  );

  // ── Empty state ─────────────────────────────────────────────────────
  if (taggedEntries.length === 0) {
    // Even with no tagged entries, the activation/regulation lens may have
    // signal — untagged conflicts and untagged wobbles still classify as
    // activations. Surface them via the same collapsibles as the main
    // panel, then show the empty-tag message before the reference layer.
    return h('div',{class:'insights-panel'},
      framing,
      h('div',{style:{
        padding:'30px 20px',marginTop:'8px',marginBottom:'14px',textAlign:'center',
        fontSize:'13px',color:'var(--muted)',fontStyle:'italic',lineHeight:'1.7',
        fontFamily:"'Libre Baskerville',serif",
      }},
        'No tagged entries in this window.', h('br',{}),
        'Tag a conflict, wobble, turn-down, bonding moment or repair', h('br',{}),
        'to start seeing patterns.'),
      // Repair landscape collapsible — only when feature on AND repairs in window
      (() => {
        const repairBlock = buildRepairLandscape({ wDays, periodRef, windowStart });
        return repairBlock ? buildLensCollapsible({
          stateKey: 'lensRepairExpanded',
          title: 'Repair landscape',
          subtitleOpen: 'Counts, who reached, how repairs landed',
          subtitleClosed: 'Counts, who reached, how repairs landed',
          body: repairBlock,
        }) : null;
      })(),
      buildLensCollapsible({
        stateKey: 'lensActivationExpanded',
        title: 'Activation & regulation',
        subtitleOpen: 'Time to settle after activation',
        subtitleClosed: 'Time to settle after activation',
        body: buildActivationRegulationLens({ wDays, periodRef, windowStart }),
      }),
      h('div',{style:{marginTop:'18px'}}, buildAttachmentReference())
    );
  }

  // ── Tag distribution by axis ────────────────────────────────────────
  // Render each axis as its own block; within an axis, tags sorted by count descending
  const distributionBlocks = ATTACHMENT_AXIS_ORDER.map(axis => {
    const meta = ATTACHMENT_AXIS_META[axis];
    const tagsInAxis = Object.values(tagCounts)
      .filter(t => t.axis === axis)
      .sort((a, b) => b.count - a.count);
    if (tagsInAxis.length === 0) return null;
    const axisTotal = axisCounts[axis] || 0;

    return h('div',{style:{marginBottom:'18px'}},
      // Axis header
      h('div',{style:{
        display:'flex',alignItems:'baseline',justifyContent:'space-between',
        marginBottom:'10px',paddingBottom:'6px',
        borderBottom:'1px solid '+meta.color+'33',
      }},
        h('div',{style:{display:'flex',alignItems:'baseline',gap:'8px'}},
          h('span',{style:{
            fontSize:'11px',letterSpacing:'0.08em',textTransform:'uppercase',
            color: meta.color, fontWeight:'600',
          }}, meta.label),
          h('span',{style:{fontSize:'10px',color:'var(--muted-2)'}}, meta.hint)
        ),
        h('span',{style:{
          fontSize:'12px',color: meta.color, fontFamily:"'Libre Baskerville',serif",
        }}, axisTotal)
      ),
      // Per-tag bars
      ...tagsInAxis.map(t => {
        const pct = maxTagCount > 0 ? Math.round((t.count / maxTagCount) * 100) : 0;
        return h('div',{style:{marginBottom:'6px'}},
          h('div',{style:{
            display:'flex',justifyContent:'space-between',alignItems:'baseline',
            fontSize:'12px',marginBottom:'3px',
          }},
            h('span',{style:{color:'var(--text)'}}, t.label),
            h('span',{style:{color:'var(--muted-2)',fontSize:'11px'}}, t.count)
          ),
          h('div',{style:{
            height:'4px',borderRadius:'3px',
            background: meta.color + '14',
            overflow:'hidden',
          }},
            h('div',{style:{
              height:'100%',
              width: Math.max(pct, 4) + '%',
              background: meta.color,
              borderRadius:'3px',
              opacity: 0.75,
            }})
          )
        );
      })
    );
  }).filter(Boolean);

  // ── Pattern observations ────────────────────────────────────────────
  // Build the inputs for the observation engine: previous-window axis
  // counts and all entries in current window.

  // Previous equal-length window (skipped for "All" since there's no prior)
  let prevAxisCounts = null;
  if (wDays > 0) {
    const prevStart = addDays(S.today, -(2 * wDays - 1));
    const prevEnd   = addDays(S.today, -wDays);
    const prevTagged = S.allEntries
      .filter(e => e.date >= prevStart && e.date <= prevEnd)
      .filter(e => Array.isArray(e.attachmentTags) && e.attachmentTags.length > 0)
      .filter(e => dictFor(e));
    prevAxisCounts = { anxiety:0, avoidance:0, secure:0, disorganized:0 };
    for (const e of prevTagged) {
      const dict = dictFor(e);
      for (const val of e.attachmentTags) {
        const t = dict.find(x => x.val === val);
        if (t && prevAxisCounts[t.axis] != null) prevAxisCounts[t.axis]++;
      }
    }
  }

  const winAllEntries = S.allEntries.filter(e => e.date >= windowStart && e.date <= S.today);

  const observations = buildAttachmentObservations({
    taggedEntries, axisCounts, tagCounts, wDays, periodRef,
    prevAxisCounts, winRepairs, winAllEntries,
  });

  // Card-format render for Lens patterns — mirrors the Correlations card
  // style on the Insights tab (icon + title + body + tone-colored border)
  // but without strength badges since these aren't statistical patterns.
  // n is shown where it makes sense (count of qualifying events).
  const patternsBlock = (() => {
    if (observations.length === 0) {
      return h('div',{style:{
        padding:'14px 16px',marginBottom:'14px',
        borderRadius:'14px',background:'var(--bg2)',border:'1px solid var(--border)',
      }},
        h('div',{style:{
          fontSize:'12px',color:'var(--muted-2)',fontStyle:'italic',
          fontFamily:"'Libre Baskerville',serif",lineHeight:'1.7',
          padding:'4px 0',
        }},
          `A varied period — no single pattern stands out ${periodRef}.`
        )
      );
    }
    const borderForTone = (tone) => {
      if (tone === 'positive') return 'var(--c-partner-subtle)';
      if (tone === 'critical') return 'var(--c-conflict-border)';
      return 'var(--border)';  // concern + mixed = neutral border
    };
    return h('div',{style:{marginBottom:'14px'}},
      ...observations.map(o => h('div',{style:{
        background:'var(--bg2)',
        border:'1px solid '+borderForTone(o.tone),
        borderRadius:'12px', padding:'10px 12px', marginBottom:'6px',
        display:'flex', gap:'10px', alignItems:'flex-start',
      }},
        h('span',{style:{fontSize:'18px',flexShrink:'0',lineHeight:'1.4'}}, o.icon || '·'),
        h('div',{style:{flex:'1',minWidth:'0'}},
          h('div',{style:{
            display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'3px',gap:'8px',
          }},
            h('span',{style:{
              fontSize:'13px',fontFamily:"'Libre Baskerville',serif",color:'var(--text)',
            }}, o.title || 'Pattern'),
            (o.n != null && o.n > 0) ? h('span',{style:{
              fontSize:'10px',color:'var(--muted)',flexShrink:'0',
            }}, 'n='+o.n) : null
          ),
          h('div',{style:{fontSize:'12px',color:'var(--muted)',lineHeight:'1.5'}}, o.body)
        )
      ))
    );
  })();

  return h('div',{class:'insights-panel'},
    framing,

    section('Where your moments land'),
    buildAttachmentGrid({ taggedEntries, periodRef }),

    section('Patterns'),
    patternsBlock,

    // ── Deeper data sections — collapsed by default ──
    (() => {
      const repairBlock = buildRepairLandscape({ wDays, periodRef, windowStart });
      return repairBlock ? buildLensCollapsible({
        stateKey: 'lensRepairExpanded',
        title: 'Repair landscape',
        subtitleOpen: 'Counts, who reached, how repairs landed',
        subtitleClosed: 'Counts, who reached, how repairs landed',
        body: repairBlock,
      }) : null;
    })(),

    buildLensCollapsible({
      stateKey: 'lensActivationExpanded',
      title: 'Activation & regulation',
      subtitleOpen: 'Time to settle after activation',
      subtitleClosed: 'Time to settle after activation',
      body: buildActivationRegulationLens({ wDays, periodRef, windowStart }),
    }),

    buildLensCollapsible({
      stateKey: 'lensTagsExpanded',
      title: 'Tag distribution',
      subtitleOpen: 'Counts of every tag placed',
      subtitleClosed: 'Counts of every tag placed',
      body: h('div',{style:{
        padding:'14px 16px',marginBottom:'4px',
        borderRadius:'14px',background:'var(--bg3)',border:'1px solid var(--border)',
      }}, ...distributionBlocks),
    }),

    h('div',{style:{marginTop:'18px'}}, buildAttachmentReference())
  );
}

