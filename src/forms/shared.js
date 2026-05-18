'use strict';

// Renders a labelled, axis-grouped, multi-select tag-chip block for use
// inside any entry form. Mutates f[fieldKey] (creates it if absent).
// Caller is responsible for wrapping in a form-section and providing the
// outer label — this returns just the inner stack of axis groups.
//
// When the Attachment lens feature is turned off in Config, returns null
// so the section disappears from the form. Existing tagged data on the
// entry is preserved on disk and will reappear if the toggle is re-enabled.
//
// A small (i) toggle next to the headline expands per-tag descriptions
// in-place — useful on mobile where hover tooltips don't work. The toggle
// state lives on the form object (`f._showTagDescs`) so it's per-session,
// not persisted globally.
function buildAttachmentTagSection(opts) {
  if (!S.showAttachment) return null;
  const { f, fieldKey, tags, headline, hint } = opts;
  if (!Array.isArray(f[fieldKey])) f[fieldKey] = [];
  // Per-axis description visibility: each axis remembers its own state so
  // a user can expand only the axis they don't yet understand without
  // bloating the rest of the form. Stored on the form object so it's
  // per-session, not persisted globally.
  const descKey = (axis) => '_showTagDescs_' + axis;
  return h('div',{class:'form-section'},
    h('label',{class:'form-label'}, headline,
      h('span',{style:{color:'var(--muted)',fontWeight:'400',marginLeft:'6px',fontSize:'10px'}},'optional · multi-select')
    ),
    hint ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'4px',marginBottom:'12px',lineHeight:'1.5'}}, hint) : null,
    ...ATTACHMENT_AXIS_ORDER.map(axis => {
      const tagsInAxis = tags.filter(t => t.axis === axis);
      if (!tagsInAxis.length) return null;
      const meta = ATTACHMENT_AXIS_META[axis];
      const showDescs = !!f[descKey(axis)];
      return h('div',{style:{marginBottom:'14px'}},
        h('div',{style:{
          display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:'8px',marginBottom:'7px',
        }},
          h('div',{style:{display:'flex',alignItems:'baseline',gap:'8px',flex:'1',minWidth:'0'}},
            h('span',{style:{
              fontSize:'10px',letterSpacing:'0.07em',textTransform:'uppercase',
              color: meta.color, fontWeight:'500',flexShrink:'0',
            }}, meta.label),
            h('span',{style:{fontSize:'10px',color:'var(--muted-2)'}}, meta.hint)
          ),
          h('button',{
            type:'button',
            style:{
              fontSize:'10px',padding:'2px 8px',borderRadius:'9px',cursor:'pointer',
              border:'1px solid '+(showDescs ? meta.color+'66' : 'var(--border)'),
              background: showDescs ? meta.color+'14' : 'transparent',
              color: showDescs ? meta.color : 'var(--muted-2)',
              fontFamily:"'DM Sans',sans-serif",letterSpacing:'0.04em',
              flexShrink:'0',
            },
            onclick:(ev)=>{ ev.preventDefault(); f[descKey(axis)] = !showDescs; render(); }
          }, showDescs ? 'Hide' : 'Explain')
        ),
        h('div',{class:'chips'},
          ...tagsInAxis.map(t => {
            const isSel = (f[fieldKey] || []).includes(t.val);
            const baseStyle = {
              padding: showDescs ? '8px 12px' : '7px 14px',
              borderRadius:'14px',fontSize:'13px',cursor:'pointer',
              border:'1px solid var(--border)',
              background: isSel ? meta.color + '22' : 'var(--bg3)',
              color: isSel ? meta.color : 'var(--muted)',
              borderColor: isSel ? meta.color : 'var(--border)',
              transition:'all 0.12s',
              whiteSpace: showDescs ? 'normal' : 'nowrap',
              maxWidth: showDescs ? '100%' : null,
              flex: showDescs ? '1 1 220px' : null,
              display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'2px',
            };
            return h('div',{
              style: baseStyle,
              title: showDescs ? null : t.sub,
              onclick: () => {
                const cur = Array.isArray(f[fieldKey]) ? [...f[fieldKey]] : [];
                const i = cur.indexOf(t.val);
                if (i >= 0) cur.splice(i, 1); else cur.push(t.val);
                f[fieldKey] = cur;
                render();
              }
            },
              h('span',{style:{
                fontSize:'13px',
                color: isSel ? meta.color : 'var(--text)',
                lineHeight:'1.3',
              }}, t.label),
              showDescs ? h('span',{style:{
                fontSize:'11px',color:'var(--muted-2)',lineHeight:'1.4',
                fontWeight:'400',
              }}, t.sub) : null
            );
          })
        )
      );
    })
  );
}

// Renders a multi-select chip group with an Explain toggle that expands
// each chip's longer description inline. Generic helper for option lists
// where users may not recognise the labels without context (e.g. forms
// of repair). The selected values live as an array in f[fieldKey].
//
// opts:
//   f          — form state object
//   fieldKey   — name of the array field on f
//   options    — [{val, label, sub}, ...]
//   accentColor — colour used for selected chips and the Explain toggle
//   descKey    — distinct state key for this section's expansion (so multiple
//                sections in one form can expand independently)
function buildMultiSelectChips(opts) {
  const { f, fieldKey, options, accentColor, descKey } = opts;
  if (!Array.isArray(f[fieldKey])) f[fieldKey] = [];
  const expandKey = '_showDescs_' + (descKey || fieldKey);
  const showDescs = !!f[expandKey];
  return h('div',{},
    h('div',{style:{
      display:'flex',justifyContent:'flex-end',marginBottom:'7px',
    }},
      h('button',{
        type:'button',
        style:{
          fontSize:'10px',padding:'2px 8px',borderRadius:'9px',cursor:'pointer',
          border:'1px solid '+(showDescs ? accentColor+'66' : 'var(--border)'),
          background: showDescs ? accentColor+'14' : 'transparent',
          color: showDescs ? accentColor : 'var(--muted-2)',
          fontFamily:"'DM Sans',sans-serif",letterSpacing:'0.04em',
        },
        onclick:(ev)=>{ ev.preventDefault(); f[expandKey] = !showDescs; render(); }
      }, showDescs ? 'Hide' : 'Explain')
    ),
    h('div',{class:'chips'},
      ...options.map(o => {
        const isSel = (f[fieldKey] || []).includes(o.val);
        return h('div',{
          style:{
            padding: showDescs ? '8px 12px' : '7px 14px',
            borderRadius:'14px',fontSize:'13px',cursor:'pointer',
            border:'1px solid '+(isSel ? accentColor : 'var(--border)'),
            background: isSel ? accentColor + '22' : 'var(--bg3)',
            color: isSel ? accentColor : 'var(--muted)',
            transition:'all 0.12s',
            whiteSpace: showDescs ? 'normal' : 'nowrap',
            maxWidth: showDescs ? '100%' : null,
            flex: showDescs ? '1 1 220px' : null,
            display:'flex',flexDirection:'column',alignItems:'flex-start',gap:'2px',
          },
          title: showDescs ? null : o.sub,
          onclick: () => {
            const cur = Array.isArray(f[fieldKey]) ? [...f[fieldKey]] : [];
            const i = cur.indexOf(o.val);
            if (i >= 0) cur.splice(i, 1); else cur.push(o.val);
            f[fieldKey] = cur;
            render();
          }
        },
          h('span',{style:{
            fontSize:'13px',
            color: isSel ? accentColor : 'var(--text)',
            lineHeight:'1.3',
          }}, o.label),
          showDescs ? h('span',{style:{
            fontSize:'11px',color:'var(--muted-2)',lineHeight:'1.4',
            fontWeight:'400',
          }}, o.sub) : null
        );
      })
    )
  );
}


// Per-entry score-scale slider. Only rendered when the entry carries a
// `scoreScale` (i.e. it was logged through the Combined screen as one side
// of a split). Plain entries have no scoreScale and get nothing here.
//
// The slider adjusts ONLY this entry's multiplier — the sibling entry from
// the same Combined log is independent, so the two can sum to more or less
// than 100% if the user wants. Mutates f.scoreScale; commits on release
// (live DOM update during drag, mirroring the Daily Check-In sliders).
function buildScoreScaleSlider(f, accentColor) {
  if (f.scoreScale == null) return null;
  const pct = Math.round(f.scoreScale * 100);
  const col = accentColor || 'var(--interactive)';
  return h('div',{class:'form-section'},
    h('label',{class:'form-label'},'How much does this combined event count?'),
    h('div',{style:{fontSize:'11px',color:'var(--muted)',margin:'-4px 0 8px'}},
      'This was logged as one side of a combined activity. Adjusting this only changes this entry — the paired entry is independent.'),
    h('div',{class:'scale-wrap'},
      h('input',{type:'range',class:'scale-slider',min:'0',max:'100',value:String(pct),
        style:{background:`linear-gradient(to right,${col} ${pct}%,var(--bg3) ${pct}%)`},
        oninput: e => {
          const v = Number(e.target.value);
          e.target.style.background = `linear-gradient(to right,${col} ${v}%,var(--bg3) ${v}%)`;
          const el = document.getElementById('scorescale-label');
          if (el) el.textContent = `Counts ${v}%`;
        },
        onchange: e => { f.scoreScale = Number(e.target.value) / 100; render(); }
      }),
      h('div',{id:'scorescale-label',style:{textAlign:'center',padding:'6px 0 2px',fontSize:'13px',fontFamily:"'Libre Baskerville',serif",fontStyle:'italic',color:'var(--text)'}},
        `Counts ${pct}%`)
    )
  );
}

/* ── Shared debug panel renderer ───────────────────── */
// breakdown: [{label, value, note}] — value null = label-only row
// score: number — shown large at top, null = hide score line
function buildDebugPanel(score, breakdown) {
  const scoreColor = score > 0 ? 'var(--c-partner)' : score < 0 ? 'var(--c-conflict)' : 'var(--muted)';
  return h('div',{style:{
    background:'var(--bg3)', border:'1px solid var(--border)',
    borderRadius:'12px', padding:'12px 14px', marginTop:'20px', marginBottom:'16px',
    fontFamily:'monospace',
  }},
    h('div',{style:{fontSize:'10px',letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'10px'}},
      '⚙ Balance impact debug'),
    score !== null ? h('div',{style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}},
      h('div',{style:{fontSize:'16px',fontWeight:'600',color:scoreColor}},
        (score>0?'+':'')+score.toFixed(1)+' pts')
    ) : null,
    ...breakdown.map(row => h('div',{style:{
      display:'flex', justifyContent:'space-between', alignItems:'baseline',
      padding:'4px 0', borderBottom:'1px solid var(--surface-1)', gap:'12px',
    }},
      h('div',{style:{fontSize:'11px',color:'var(--muted)',flex:'1'}},
        row.label,
        row.note ? h('div',{style:{fontSize:'10px',color:'var(--muted-2)',marginTop:'1px'}}, row.note) : null
      ),
      row.value !== null && row.value !== undefined
        ? h('div',{style:{fontSize:'12px',color:'var(--text)',flexShrink:'0',textAlign:'right'}}, String(row.value))
        : null
    ))
  );
}

function buildDebugPlaceholder(msg) {
  return h('div',{style:{
    background:'var(--bg3)', border:'1px solid var(--border)',
    borderRadius:'12px', padding:'12px 14px', marginTop:'20px', marginBottom:'16px',
    fontFamily:'monospace', fontSize:'11px', color:'var(--muted)',
  }}, '⚙ Balance impact debug — '+msg);
}

