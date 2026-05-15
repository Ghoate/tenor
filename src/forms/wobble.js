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
  {val:'internal',    label:'Internal',       sub:'Body, memory, mood'},
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

  const allEmotionTags = S.challengingEmotionTags && S.challengingEmotionTags.length > 0
    ? S.challengingEmotionTags
    : [...DEFAULT_CHALLENGING_EMOTION_TAGS];

  // Group tags by emotional family
  const byFamily = {};
  for (const fam of EMOTION_TONES) byFamily[fam.val] = [];
  byFamily['other'] = [];
  for (const tag of allEmotionTags) {
    const fv = (S.tagToneOverrides && S.tagToneOverrides[tag]) || TAG_TO_EMOTION_TONE[tag] || 'other';
    (byFamily[fv] || byFamily['other']).push(tag);
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

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'🫧 Life Wobble'),

    h('div',{class:'form-section'},
      h('div',{style:{display:'flex',alignItems:'baseline',justifyContent:'space-between'}},
        h('label',{class:'form-label'},'What\'s present'),
        manageLink
      ),
      h('div',{}, ...familyGroups)
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
        '⚡ After saving this wobble you\'ll be taken to log the conflict — that\'s where the relational impact scores.'
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
    regulationEmotions:     (f.regulationEmotions || []).filter(t => (S.challengingEmotionTags || DEFAULT_CHALLENGING_EMOTION_TAGS).includes(t)),
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
