'use strict';

/* ── Wobble form ─────────────────────────────────────── */
const WOBBLE_INTENSITY = [
  {val:1, label:'A blip',      sub:'Minor, passed easily'},
  {val:2, label:'Notable',  sub:'Felt it, managed it'},
  {val:3, label:'Hard',  sub:'Took real effort'},
  {val:4, label:'Very hard', sub:'Depleted me'},
  {val:5, label:'Max',  sub:'Hardest it gets'},
];
const WOBBLE_TRIGGER = [
  {val:'internal',    label:'Internal',       sub:'Tired, body, mood'},
  {val:'external',    label:'External',  sub:'Work, news, environment'},
  {val:'relational',  label:'Us',   sub:'Something in our dynamic'},
];
const WOBBLE_SUPPORT_SOURCE = [
  {val:'self',      label:'Myself',    sub:'Worked through it alone'},
  {val:'friends',   label:'Friends',   sub:'Friend or family'},
  {val:'partner',   label:'Us',        sub:'My relationship'},
  {val:'therapist', label:'Therapist', sub:'Professional support'},
  {val:'other',     label:'Other',     sub:'Something else helped'},
];
const WOBBLE_RESOLUTION = [
  {val:'resolved',    label:'At peace',   sub:'Fully settled'},
  {val:'coming-down', label:'Better',     sub:'Moving in the right direction'},
  {val:'still-on',    label:'Still on',   sub:'Present and ongoing'},
  {val:'no-better',   label:'No better',  sub:'Where I started, no change'},
  {val:'heavier',     label:'Heavier',    sub:'Harder than when it started'},
];

function buildWobbleForm() {
  const f = S.form;
  const isEdit = !!f._editId;
  if (f.regulationIntensity   == null) f.regulationIntensity   = null;
  // Map legacy 'internal' trigger to 'external' (No) — the Yes/No question only has relational/external
  if (f.regulationTrigger === 'internal') f.regulationTrigger = 'external';
  if (f.regulationTrigger    == null) f.regulationTrigger    = null;

  if (!f.regulationSupportSources) f.regulationSupportSources = [];
  if (!f.regulationEmotions) f.regulationEmotions = [];
  const ok = !!f.regulationIntensity;

  // Single source of truth: the user's configured list. Empty means empty —
  // no phantom defaults. New users are seeded with defaults at load time.
  const allEmotionTags = S.challengingEmotionTags || [];

  // Group tags by emotional family. Include the user's active list, plus
  // any canonical (system) tag already on this entry even if it's been
  // removed from the list — those still render as normal chips. Only truly
  // custom removed tags fall through to the crossed-out "Removed" group.
  const byFamily = {};
  for (const fam of EMOTION_TONES) byFamily[fam.val] = [];
  byFamily['other'] = [];
  const grouped = new Set();
  const addToFamily = (tag) => {
    if (grouped.has(tag)) return;
    grouped.add(tag);
    const fv = (S.tagToneOverrides && S.tagToneOverrides[tag]) || TAG_TO_EMOTION_TONE[tag] || 'other';
    (byFamily[fv] || byFamily['other']).push(tag);
  };
  for (const tag of allEmotionTags) addToFamily(tag);
  for (const tag of (f.regulationEmotions || [])) {
    if (!grouped.has(tag) && (tag in TAG_TO_EMOTION_TONE)) addToFamily(tag);
  }

  const makeChip = tag => {
    const sel = f.regulationEmotions.includes(tag);
    return h('div',{
      class:'chip'+(sel?' selected':''),
      style: sel ? {borderColor:'var(--c-wobble)',color:'var(--c-wobble)',background:'rgba(160,127,212,0.12)'} : {},
      onclick:()=>{
        f.regulationEmotions = sel
          ? f.regulationEmotions.filter(x=>x!==tag)
          : [...f.regulationEmotions, tag];
        render();
      }
    }, tag);
  };

  const makeFamilyGroup = (label, tags) => [
    h('div',{style:{display:'flex',alignItems:'center',gap:'8px',margin:'10px 0 6px'}},
      h('span',{style:{fontSize:'11px',color:'var(--muted)',whiteSpace:'nowrap'}}, label),
      h('hr',{style:{flex:'1',border:'none',borderTop:'1px solid var(--border)',margin:'0'}})
    ),
    h('div',{class:'chips',style:{marginBottom:'0'}}, ...tags.map(makeChip)),
  ];

  const manageLink = h('span',{
    style:{fontSize:'12px',color:'var(--muted)',cursor:'pointer',textDecoration:'underline',
      textDecorationColor:'var(--border)',textUnderlineOffset:'3px',marginLeft:'8px'},
    onclick:()=>{S.activeTab='library';S.libWobbleExpanded=true;S.libBondingExpanded=false;S.libBondingForm={};S.libIntimacyExpanded=false;S.libIntimacyForm={};S.libRestoreExpanded=false;S.libRestoreForm={};S.libSteadyingExpanded=false;S.libSteadyingForm={};closeModalSilent();render();}
  }, 'Manage');

  const familyGroups = [
    ...EMOTION_TONES
      .filter(fam => (byFamily[fam.val]||[]).length > 0)
      .flatMap(fam => makeFamilyGroup(
        fam.label,
        (byFamily[fam.val]||[]).slice().sort((a,b)=>a.localeCompare(b))
      )),
    ...(byFamily['other'].length > 0 ? makeFamilyGroup('Other', byFamily['other'].slice().sort((a,b)=>a.localeCompare(b))) : []),
  ];

  // Tags on this entry that are no longer in the user's list (removed from
  // Library). Shown crossed-out so the user can see what was tagged here
  // before — and tap to drop it from the entry if they want.
  const orphanTags = (f.regulationEmotions || []).filter(t => !allEmotionTags.includes(t) && !(t in TAG_TO_EMOTION_TONE));
  const orphanGroup = orphanTags.length > 0 ? [
    h('div',{style:{display:'flex',alignItems:'center',gap:'8px',margin:'10px 0 6px'}},
      h('span',{style:{fontSize:'11px',color:'var(--muted)',whiteSpace:'nowrap'}}, 'Removed (was tagged here)'),
      h('hr',{style:{flex:'1',border:'none',borderTop:'1px solid var(--border)',margin:'0'}})
    ),
    h('div',{class:'chips',style:{marginBottom:'0'}}, ...orphanTags.slice().sort((a,b)=>a.localeCompare(b)).map(tag =>
      h('div',{class:'chip selected',
        style:{opacity:'0.6',textDecoration:'line-through',borderColor:'var(--border)',
          color:'var(--muted)',background:'transparent',cursor:'pointer'},
        title:'Removed from your library — tap to drop it from this entry',
        onclick:()=>{ f.regulationEmotions = f.regulationEmotions.filter(x=>x!==tag); render(); }
      }, '⚠️ ' + tag))),
  ] : [];

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'🌪️ Wobble'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'14px',marginTop:'-4px',lineHeight:'1.5'}},
      'Any internally hard stretch — not just emotional or relational struggles. A run-down or off day (poor sleep, illness, depletion) counts too.'),

    h('div',{class:'form-section'},
      h('div',{style:{display:'flex',alignItems:'baseline',justifyContent:'space-between'}},
        h('label',{class:'form-label'},'What\'s present'),
        manageLink
      ),
      h('button',{
        style:{display:'flex',alignItems:'center',gap:'8px',width:'100%',
          background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:'10px',
          padding:'10px 12px',margin:'2px 0 12px',cursor:'pointer',
          color:'var(--text)',fontSize:'12px',fontFamily:"'DM Sans',sans-serif",textAlign:'left'},
        onclick:()=>{ f._guideStep='category'; f._guideFam=null; S.modal='wobble-emotion-guide'; render(); }
      },
        h('span',{style:{fontSize:'15px'}},'🧭'),
        h('span',{style:{flex:'1'}},'Not sure what you’re feeling? Walk through it'),
        h('span',{style:{color:'var(--muted)'}},'›')
      ),
      (familyGroups.length > 0 || orphanGroup.length > 0)
        ? h('div',{}, ...familyGroups, ...orphanGroup)
        : h('div',{style:{fontSize:'12px',color:'var(--muted)',padding:'8px 0',lineHeight:'1.5'}},
            'No emotion tags in your list yet — use the walkthrough above to find and add what fits, or add some in Library → Wobble.')
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'How was it overall'),
      h('div',{class:'btn-grid-5'},
        ...WOBBLE_INTENSITY.map(o => h('button',{
          class:'sel-btn'+(f.regulationIntensity===o.val?' sel-wobble':''),
          onclick:()=>{ f.regulationIntensity=o.val; render(); }
        }, o.label, h('span',{class:'sub'}, o.sub)))
      )
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Support came from'),
      h('div',{class:'btn-grid-5'},
        ...WOBBLE_SUPPORT_SOURCE.map(o => {
          const sel = (f.regulationSupportSources||[]).includes(o.val);
          return h('button',{
            class:'sel-btn'+(sel?' sel-wobble':''),
            onclick:()=>{
              const cur = f.regulationSupportSources||[];
              f.regulationSupportSources = sel ? cur.filter(x=>x!==o.val) : [...cur, o.val];
              render();
            }
          }, o.label, h('span',{class:'sub'}, o.sub));
        })
      )
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Where I landed'),
      h('div',{class:'btn-grid-5'},
        ...WOBBLE_RESOLUTION.map(o => h('button',{
          class:'sel-btn'+(f.regulationResolution===o.val?' sel-wobble':''),
          onclick:()=>{ f.regulationResolution=o.val; render(); }
        }, o.label, h('span',{class:'sub'}, o.sub)))
      )
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'What\'s present right now…',rows:'3',
        oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),

    // ── Attachment tags (optional) ────────────────────
    buildAttachmentTagSection({
      f, fieldKey:'attachmentTags', tags: WOBBLE_ATTACHMENT_TAGS,
      headline:'How did the wobble pull you?',
      hint:'Which direction was your nervous system trying to go? Pick any that fit, or none.',
    }),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Did this involve a conflict with '+P.pos+' partner?'),
      h('div',{class:'btn-grid-2'},
        h('button',{
          class:'sel-btn'+(f.regulationTrigger==='relational'?' sel-wobble':''),
          onclick:()=>{ f.regulationTrigger='relational'; render(); }
        }, 'Yes', h('span',{class:'sub'},'We argued or it became a conflict')),
        h('button',{
          class:'sel-btn'+(f.regulationTrigger==='external'?' sel-wobble':''),
          onclick:()=>{ f.regulationTrigger='external'; render(); }
        }, 'No', h('span',{class:'sub'},'Personal or unrelated to '+P.obj))
      ),
      f.regulationTrigger === 'relational' ? h('div',{style:{
        marginTop:'10px', padding:'10px 12px', borderRadius:'10px',
        background:'var(--c-conflict-tint)', border:'1px solid var(--c-conflict-border)',
        fontSize:'12px', color:'var(--muted)', lineHeight:'1.6'
      }},
        '⛈️ After saving this wobble you\'ll be taken to log the conflict — that\'s where the relational impact scores.'
      ) : null
    ),

    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},
      h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),
      h('button',{class:'submit-btn'+(ok?'':' disabled'),onclick:ok?saveWobble:null},
        isEdit?'Save Changes':'Save Entry')),

    // ── Debug panel ──
    S.showDebug ? (() => {
      const mockEntry = {
        regulationIntensity:      f.regulationIntensity,
        regulationTrigger:        f.regulationTrigger,
        regulationSupportSources: f.regulationSupportSources||[],
        regulationResolution:     f.regulationResolution,
      };
      const cap = bankDayCap(S.dayEntries.find(e=>e.category==='libido'));
      const { score, balanceScore, restoreScore: wRestoreScore, breakdown } = regulationBankScoreDebug(mockEntry, cap);
      const hasBalanceImpact = !!balanceScore;
      const hasRestoreImpact = !!wRestoreScore;
      const displayScore = hasBalanceImpact ? score : (hasRestoreImpact ? wRestoreScore : 0);
      const scoreColor = hasBalanceImpact ? 'var(--c-conflict)' : 'var(--c-restore)';
      const badge = hasRestoreImpact
          ? h('div',{style:{padding:'3px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:'600',background:'rgba(90,184,212,0.12)',border:'1px solid rgba(90,184,212,0.35)',color:'var(--c-restore)'}}, '→ Personal only')
          : h('div',{style:{padding:'3px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:'600',background:'var(--surface-2)',border:'1px solid var(--border)',color:'var(--muted)'}}, 'No impact yet');
      return h('div',{style:{
        background:'var(--bg3)', border:'1px solid var(--border)',
        borderRadius:'12px', padding:'12px 14px', marginTop:'20px', marginBottom:'16px', fontFamily:'monospace',
      }},
        h('div',{style:{fontSize:'10px',letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'10px'}},
          '⚙ Balance impact debug'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'10px'}},
          displayScore !== 0 ? h('div',{style:{fontSize:'16px',fontWeight:'600',color:scoreColor}},
            (displayScore>0?'+':'')+displayScore.toFixed(1)+' pts') : null,
          badge
        ),
        ...breakdown.map(row => h('div',{style:{
          display:'flex',justifyContent:'space-between',alignItems:'baseline',
          padding:'4px 0',borderBottom:'1px solid var(--surface-1)',gap:'12px',
        }},
          h('div',{style:{fontSize:'11px',color:'var(--muted)',flex:'1'}},
            row.label,
            row.note ? h('div',{style:{fontSize:'10px',color:'var(--muted-2)',marginTop:'1px'}},row.note) : null
          ),
          row.value !== null && row.value !== undefined
            ? h('div',{style:{fontSize:'12px',color:'var(--text)',flexShrink:'0',textAlign:'right'}},String(row.value))
            : null
        ))
      );
    })() : null
  ));
}

function saveWobble() {
  const f = S.form;
  const openConflict = f.regulationTrigger === 'relational' && !f._editId;
  const rec = {
    date:                   S.selectedDate,
    category:               'regulation',
    regulationIntensity:    f.regulationIntensity,
    regulationTrigger:      f.regulationTrigger   || null,
    regulationEmotions:     Array.isArray(f.regulationEmotions) ? f.regulationEmotions.slice() : [],
    regulationSupportSources: f.regulationSupportSources || [],
    regulationResolution:   f.regulationResolution || null,
    attachmentTags:         Array.isArray(f.attachmentTags) ? f.attachmentTags.slice() : [],
    notes:                  f.notes || '',
  };
  if (f._editId) rec.id = f._editId;
  closeModalSilent();
  dbPut('entries', rec).then(loadDay).then(loadAll).then(() => {
    if (openConflict) {
      S.modal = 'conflict';
      S.form = {};
      S._resetSheetScroll = true;
    }
    render();
  }).catch(e=>{console.error('Save failed:',e);alert('Save failed — '+e.message);});
}

// Guided emotion finder for users who can't name what they feel.
// Step 1: pick a family (descriptions aid identification).
// Step 2: pick tags within it. Loop back to step 1 for more families.
// Writes straight into S.form.regulationEmotions so picks are already
// applied when returning to the Wobble form. Lives over the form
// modal: it swaps S.modal without clearing S.form, and exits back to
// 'regulation' (NOT closeModal, which would discard the in-progress entry).
function buildWobbleEmotionGuide() {
  const f = S.form;
  if (!Array.isArray(f.regulationEmotions)) f.regulationEmotions = [];
  const tags = S.challengingEmotionTags || [];

  const byFamily = {};
  for (const fam of EMOTION_TONES) byFamily[fam.val] = [];
  byFamily['other'] = [];
  for (const tag of tags) {
    const fv = (S.tagToneOverrides && S.tagToneOverrides[tag]) || TAG_TO_EMOTION_TONE[tag] || 'other';
    (byFamily[fv] || byFamily['other']).push(tag);
  }

  const backToForm = () => { f._guideStep = null; f._guideFam = null; S.modal = 'regulation'; render(); };

  // Custom overlay: backdrop click returns to the form rather than
  // discarding the entry (which is what the shared overlay() does).
  const wrap = (content) => {
    // Fixed min-height so the sheet doesn't shrink/jump between the
    // (taller) category step and the (shorter) options step.
    const ov = h('div',{class:'overlay'}, h('div',{class:'sheet'},
      h('div',{class:'sheet-handle'}),
      h('div',{style:{minHeight:'min(560px, 80dvh)'}}, content)
    ));
    const t = Date.now();
    ov.addEventListener('click', e => { if (e.target === ov && Date.now() - t > 300) backToForm(); });
    return ov;
  };

  // The full menu of options for a family = its curated presets ∪ any of
  // the user's tags that map to it (covers custom tags). 'other' has no
  // preset, so it's just the user's unmapped/custom tags.
  const presetFor = (famVal) => EMOTION_TONE_PRESETS[famVal] || [];
  const familyOptions = (famVal) => {
    if (famVal === 'other') return (byFamily['other'] || []).slice().sort((a,b)=>a.localeCompare(b));
    const set = new Set(presetFor(famVal).map(p => p.tag));
    for (const t of (byFamily[famVal] || [])) set.add(t);
    return [...set].sort((a,b)=>a.localeCompare(b));
  };
  const presetPv = (famVal, tag) => {
    const p = presetFor(famVal).find(x => x.tag === tag);
    return p ? p.pv : null;
  };

  // Selecting a tag not yet in the user's list adds it (the guide doubles
  // as a way to grow the list, so the pick survives save and shows on the
  // form). Deselecting only removes it from this entry, never the list.
  const pick = (tag, famVal) => {
    if (f.regulationEmotions.includes(tag)) {
      f.regulationEmotions = f.regulationEmotions.filter(x => x !== tag);
    } else {
      f.regulationEmotions = [...f.regulationEmotions, tag];
      if (!(S.challengingEmotionTags || []).includes(tag)) {
        S.challengingEmotionTags = [...(S.challengingEmotionTags || []), tag];
        const pv = presetPv(famVal, tag);
        if (pv) {
          if (!S.tagPolyvagalOverrides) S.tagPolyvagalOverrides = {};
          if (!S.tagPolyvagalOverrides[tag]) S.tagPolyvagalOverrides[tag] = pv;
        }
        saveSettings();
      }
    }
    render();
  };

  const sel = f.regulationEmotions;
  const selectedSummary = sel.length > 0
    ? h('div',{style:{marginTop:'16px',paddingTop:'12px',borderTop:'1px solid var(--border)'}},
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'7px'}}, 'Selected · ' + sel.length),
        h('div',{class:'chips'}, ...sel.slice().sort((a,b)=>a.localeCompare(b)).map(tag =>
          h('div',{class:'chip selected',
            style:{borderColor:'var(--c-wobble)',color:'var(--c-wobble)',background:'rgba(160,127,212,0.12)'},
            onclick:()=>{ f.regulationEmotions = f.regulationEmotions.filter(x => x !== tag); render(); }},
            tag + '  ×')))
      )
    : null;

  // ── Step 2: tags within the chosen family ──
  if (f._guideStep === 'tags' && f._guideFam) {
    const famVal = f._guideFam;
    const fam = EMOTION_TONES.find(x => x.val === famVal)
             || {val:'other', label:'Other', color:'var(--muted)', desc:'Tags that don’t fit a family'};
    const options = familyOptions(famVal);

    // Default polyvagal state for a custom tag added here — majority pv
    // among this family's starred presets ('other' has none → leave unset).
    const famDefaultPv = (() => {
      const preset = presetFor(famVal);
      if (!preset.length) return null;
      const counts = {};
      for (const p of preset) if (p.starred) counts[p.pv] = (counts[p.pv] || 0) + 1;
      const top = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
      return top ? top[0] : null;
    })();
    const addKey = '_guideAdd_' + famVal;
    if (f[addKey] == null) f[addKey] = '';
    const addCustom = (val) => {
      val = (val || '').trim();
      if (!val) return;
      if (!(S.challengingEmotionTags || []).includes(val)) {
        S.challengingEmotionTags = [...(S.challengingEmotionTags || []), val];
        if (!S.tagToneOverrides) S.tagToneOverrides = {};
        S.tagToneOverrides[val] = famVal;
        if (famDefaultPv) {
          if (!S.tagPolyvagalOverrides) S.tagPolyvagalOverrides = {};
          if (!S.tagPolyvagalOverrides[val]) S.tagPolyvagalOverrides[val] = famDefaultPv;
        }
        saveSettings();
      }
      if (!f.regulationEmotions.includes(val)) f.regulationEmotions = [...f.regulationEmotions, val];
      f[addKey] = '';
      render();
    };

    return wrap(h('div',{},
      h('div',{style:{fontSize:'11px',fontWeight:'700',letterSpacing:'0.07em',textTransform:'uppercase',color:fam.color,marginBottom:'4px'}}, fam.label),
      fam.desc ? h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}}, fam.desc) : null,
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'10px'}}, 'Tap everything that fits. New picks are added to your tag list. Add from other families next.'),
      options.length > 0
        ? h('div',{class:'chips'}, ...options.map(tag => {
            const on = sel.includes(tag);
            return h('div',{class:'chip'+(on?' selected':''),
              style: on ? {borderColor:fam.color,color:fam.color} : {},
              onclick:()=>pick(tag, famVal)}, tag);
          }))
        : h('div',{style:{fontSize:'12px',color:'var(--muted)',fontStyle:'italic'}},'No options here yet.'),

      h('div',{style:{marginTop:'14px'}},
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'6px'}},
          'Don’t see it? Add your own to ' + fam.label),
        h('div',{style:{display:'flex',gap:'6px'}},
          h('input',{
            id:'guide-add-input', type:'text', placeholder:'New emotion…',
            value: f[addKey] || '',
            style:{flex:'1',background:'var(--surface-1)',border:'1px solid var(--border)',
              borderRadius:'8px',padding:'9px 11px',fontSize:'13px',
              color:'var(--text)',outline:'none',fontFamily:"'DM Sans',sans-serif"},
            oninput: e => { f[addKey] = e.target.value; },
            onkeydown: e => {
              if (e.key === 'Enter') {
                const inp = document.getElementById('guide-add-input');
                addCustom(inp ? inp.value : f[addKey]);
              }
            }
          }),
          h('button',{
            style:{background:'transparent',border:'1px solid var(--border)',borderRadius:'8px',
              color:'var(--muted)',fontSize:'12px',cursor:'pointer',padding:'9px 14px',
              fontFamily:"'DM Sans',sans-serif",fontWeight:'500',flexShrink:'0'},
            onclick: () => {
              const inp = document.getElementById('guide-add-input');
              addCustom(inp ? inp.value : f[addKey]);
            }
          }, 'Add custom')
        )
      ),

      selectedSummary,
      h('button',{class:'submit-btn',style:{width:'100%',marginTop:'18px'},
        onclick:()=>{ f._guideStep='category'; f._guideFam=null; render(); }}, 'Back to categories'),
      h('div',{style:{fontSize:'11px',color:'var(--muted)',textAlign:'center',marginTop:'8px'}},
        'Check other categories too — finish from the category screen.')
    ));
  }

  // ── Step 1: category picker (always all families, for discovery) ──
  const catCard = (val,label,color,desc,picked) => h('div',{
    style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',
      padding:'12px 14px',borderRadius:'10px',cursor:'pointer',
      background:'var(--bg3)',border:'1px solid var(--border)',borderLeft:'3px solid '+color,marginBottom:'8px'},
    onclick:()=>{ f._guideFam=val; f._guideStep='tags'; render(); }
  },
    h('div',{style:{flex:'1',minWidth:'0'}},
      h('div',{style:{fontSize:'11px',fontWeight:'700',letterSpacing:'0.07em',textTransform:'uppercase',color:color}}, label),
      desc ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'3px',lineHeight:'1.4'}}, desc) : null
    ),
    h('div',{style:{display:'flex',alignItems:'center',gap:'8px',flexShrink:'0'}},
      picked > 0 ? h('span',{style:{fontSize:'11px',color:color}}, picked + ' picked') : null,
      h('span',{style:{fontSize:'15px',color:'var(--muted)'}}, '›')
    )
  );

  const famCards = EMOTION_TONES.map(fam => catCard(
    fam.val, fam.label, fam.color, fam.desc,
    familyOptions(fam.val).filter(t => sel.includes(t)).length
  ));
  if ((byFamily['other'] || []).length > 0) {
    famCards.push(catCard('other','Other','var(--muted)','Tags that don’t fit a family',
      familyOptions('other').filter(t => sel.includes(t)).length));
  }

  return wrap(h('div',{},
    h('div',{class:'sheet-title'}, 'What are you feeling?'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',marginTop:'-4px',marginBottom:'16px',lineHeight:'1.5'}},
      'Hard to name it? Start with the family that feels closest — the descriptions help. You can keep adding from more than one.'),
    h('div',{}, ...famCards),
    selectedSummary,
    h('button',{class: sel.length > 0 ? 'submit-btn' : 'sec-btn',
      style:{width:'100%',marginTop:'18px'}, onclick:backToForm}, 'Done')
  ));
}
