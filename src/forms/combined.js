'use strict';

/* ── Combined form ──────────────────────────────────────
 * One activity that is both a positive-axis activity and a restorative
 * (personal). The user picks a positive type AND a restorative type,
 * then answers both forms' questions on a single sheet. Each side is
 * scored independently on its own merit so an activity that was strongly
 * both is not forced into a zero-sum split.
 *
 * In Partner/Dating mode the positive side is Bonding (category:'affection').
 * In Individual mode the positive side is Social (category:'social') —
 * Bonding doesn't exist there. Either way one entry is written per side.
 */
function buildCombinedForm() {
  const f = S.form;
  const isIndividual = S.relationshipMode === 'individual';
  const isDating = S.relationshipMode === 'dating';
  if (!f.restoreObstacles) f.restoreObstacles = [];
  if (f.comboSplit == null) f.comboSplit = 0.5;
  const split   = f.comboSplit;
  const relPct  = Math.round((1 - split) * 100);
  const perPct  = Math.round(split * 100);

  // Mode-dependent positive-side configuration. In Individual mode the
  // positive side is Social; everywhere else it's Bonding/Affection.
  const posCfg = isIndividual ? {
    category:   'social',
    types:      S.socialTypes || [],
    typeKey:    'socialTypes',
    chipClass:  'sel-social',
    accent:     CAT_COLORS.social,
    accentVar:  'var(--c-social)',
    icon:       '🫂',
    headLabel:  'Social',
    typeLabel:  'Type of social activity',
    libExpand:  'libSocialExpanded',
    libForm:    'libSocialForm',
    leftLegend: '🫂 Social',
  } : {
    category:   'affection',
    types:      S.affectionTypes || [],
    typeKey:    'affectionTypes',
    chipClass:  'sel-bonding',
    accent:     CAT_COLORS.affection,
    accentVar:  'var(--c-affection)',
    icon:       '🩷',
    headLabel:  bondingLabel(),
    typeLabel:  'Type of '+bondingLabel().toLowerCase(),
    libExpand:  'libBondingExpanded',
    libForm:    'libBondingForm',
    leftLegend: '🩷 Relational',
  };

  // ── Positive-side type chips ──
  const posTypeNames    = posCfg.types.map(t => t.name);
  const posVisibleTypes = posCfg.types.filter(t => !t.hidden);
  const bondingChips = [
    f.eventType && !posVisibleTypes.map(t=>t.name).includes(f.eventType) ? h('div',{
      class:'chip selected',
      style:{opacity:'0.5',cursor:'default',textDecoration:'line-through',pointerEvents:'none'},
      title: posTypeNames.includes(f.eventType) ? 'This type is hidden — unhide it in Activities' : 'This type was removed from your library'
    }, '⚠️ '+f.eventType) : null,
    ...posVisibleTypes.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>h('div',{
      class:'chip'+(f.eventType===t.name?' selected '+posCfg.chipClass:''),
      onclick:()=>{ f.eventType=t.name; render(); }
    }, t.name)),
    h('div',{class:'chip add-new',onclick:()=>{
      S.activeTab='library';
      S[posCfg.libExpand]=true;
      S.libBondingExpanded   = (posCfg.libExpand === 'libBondingExpanded');
      S.libSocialExpanded    = (posCfg.libExpand === 'libSocialExpanded');
      S.libIntimacyExpanded=false; S.libRestoreExpanded=false;
      S.libSteadyingExpanded=false; S.libWobbleExpanded=false;
      closeModalSilent(); render();
    }},'+ Manage types'),
  ];

  // ── Restorative type chips ──
  const restName = t => typeof t === 'string' ? t : t.name;
  const restVisible = S.restoreTypes.filter(t => !(typeof t==='object' && t.hidden));
  const restAllNames = S.restoreTypes.map(restName);
  const restoreChips = [
    f.restoreType && !restVisible.map(restName).includes(f.restoreType) ? h('div',{
      class:'chip selected',
      style:{opacity:'0.5',cursor:'default',textDecoration:'line-through',pointerEvents:'none'},
      title: restAllNames.includes(f.restoreType) ? 'This type is hidden — unhide it in Activities' : 'This type was removed from your library'
    }, '⚠️ '+f.restoreType) : null,
    ...restVisible.slice().sort((a,b)=>restName(a).localeCompare(restName(b))).map(t=>h('div',{
      class:'chip'+(f.restoreType===restName(t)?' selected sel-restore':''),
      onclick:()=>{ f.restoreType=restName(t); render(); }
    }, restName(t))),
    h('div',{class:'chip add-new',onclick:()=>{
      S.activeTab='library'; S.libRestoreExpanded=true;
      S.libBondingExpanded=false; S.libIntimacyExpanded=false;
      S.libSocialExpanded=false; S.libSteadyingExpanded=false; S.libWobbleExpanded=false;
      closeModalSilent(); render();
    }},'+ Manage types'),
  ];

  // Save gate: Social side requires only connection quality; Bonding side
  // (partner or dating) requires initiator.
  const ok = !!f.eventType && !!f.restoreType && !!f.connectionQuality
    && !!f.restoreImmersion && !!f.restoreQuality
    && (isIndividual ? true : !!f.initiatedBy);

  const sideHeader = (icon, text, color, topDivider) => h('div',{
    style:{
      display:'flex', alignItems:'center', gap:'8px',
      margin: topDivider ? '28px 0 14px' : '6px 0 14px',
      paddingTop: topDivider ? '20px' : '0',
      borderTop: topDivider ? '1px solid var(--border)' : 'none',
    }},
    h('span',{style:{fontSize:'15px'}}, icon),
    h('span',{style:{
      fontSize:'11px', letterSpacing:'0.09em', textTransform:'uppercase',
      color: color, fontWeight:'600', flexShrink:'0',
    }}, text),
    h('span',{style:{flex:'1', height:'1px', background:`linear-gradient(to right, ${color}55, transparent)`}})
  );

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},'🔀 Combined'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'14px',marginTop:'-4px',lineHeight:'1.5'}},
      isIndividual
        ? 'Use this when a social moment also doubled as a personal, restorative activity — a hike with a friend, a meditation group, a long walk with someone. When you can\'t tell which it was more, this is usually the right place to log it.'
        : 'Use this only if a bonding activity also included something you would normally do on your own as a personal, restorative activity. Whenever you are struggling to tell whether it was bonding or personally restorative, this is usually the right place to log it.'),

    // ── Positive side (Bonding or Social) ──
    sideHeader(posCfg.icon, posCfg.headLabel, posCfg.accent, false),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'}, posCfg.typeLabel),
      h('div',{class:'chips'},...bondingChips)
    ),
    // Initiator section (Bonding side only — Social doesn't track it)
    isIndividual ? null : h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Who initiated'),
      h('div',{class:'btn-grid-3'},
        h('button',{class:'sel-btn'+(f.initiatedBy==='me'?' sel-bonding':''),onclick:()=>{f.initiatedBy='me';render();}},'Me',h('span',{class:'sub'},'I initiated')),
        h('button',{class:'sel-btn'+(f.initiatedBy==='her'?' sel-bonding':''),onclick:()=>{f.initiatedBy='her';render();}},P.Sub,h('span',{class:'sub'},`${P.Sub} initiated`)),
        h('button',{class:'sel-btn'+(f.initiatedBy==='mutual'?' sel-bonding':''),onclick:()=>{f.initiatedBy='mutual';render();}},'Mutual',h('span',{class:'sub'},'Both'))
      )
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'}, isIndividual ? 'How was the connection' : 'Connection quality'),
      h('div',{class:'btn-grid-5'},
        ...(isIndividual ? SOCIAL_QUALITY : CONNECTION_QUALITY).map(q=>h('button',{
          class:'sel-btn flex1'+(f.connectionQuality===q.val?' '+posCfg.chipClass:''),
          onclick:()=>{f.connectionQuality=q.val;render();}
        }, q.label, h('span',{class:'sub'},resolveSub(q.sub))))
      )
    ),

    // ── Restorative side ──
    sideHeader('🌊', 'Restorative', CAT_COLORS.restore, true),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Restorative activity'),
      h('div',{class:'chips'},...restoreChips)
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'How immersed were you?'),
      h('div',{class:'btn-grid-5'},
        ...RESTORE_IMMERSION.map(i=>h('button',{
          class:'sel-btn flex1'+(f.restoreImmersion===i.val?' sel-restore':''),
          onclick:()=>{f.restoreImmersion=i.val;render();}
        }, i.label, h('span',{class:'sub'},i.sub)))
      )
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'How restorative was it'),
      h('div',{class:'btn-grid-5'},
        ...RESTORE_QUALITY.map(q=>h('button',{
          class:'sel-btn flex1'+(f.restoreQuality===q.val?' sel-restore':''),
          onclick:()=>{f.restoreQuality=q.val;render();}
        }, q.label, h('span',{class:'sub'},resolveSub(q.sub))))
      )
    ),
    f.restoreQuality !== null && f.restoreQuality != null && f.restoreQuality <= 2 ? h('div',{class:'form-section'},
      h('label',{class:'form-label'},'What prevented it from being better? (select all that apply)'),
      h('div',{style:{display:'flex',flexDirection:'column',gap:'6px'}},
        ...RESTORE_OBSTACLES.map(o => {
          const selected = (f.restoreObstacles||[]).includes(o.val);
          return h('button',{
            class:'sel-btn'+(selected?' sel-restore':''),
            style:{textAlign:'left',padding:'10px 14px'},
            onclick:()=>{
              f.restoreObstacles = selected
                ? (f.restoreObstacles||[]).filter(x=>x!==o.val)
                : [...(f.restoreObstacles||[]), o.val];
              render();
            }
          },
            h('span',{style:{fontSize:'13px'}}, o.label),
            h('span',{class:'sub',style:{display:'inline',marginLeft:'8px'}}, o.sub)
          );
        })
      )
    ) : null,

    // ── Split slider ──
    h('div',{style:{borderTop:'1px solid var(--border)',margin:'28px 0 0'}}),
    h('div',{class:'form-section',style:{marginTop:'18px'}},
      h('label',{class:'form-label'},'How this one event counts'),
      h('div',{style:{fontSize:'11px',color:'var(--muted)',margin:'-2px 0 10px',lineHeight:'1.5'}},
        'A single activity counts toward both sides, so its weight is divided rather than doubled. Set how it leaned.'),
      h('div',{class:'scale-wrap'},
        h('input',{type:'range',class:'scale-slider',min:'0',max:'100',value:String(relPct),
          style:{background:`linear-gradient(to right,${posCfg.accent} ${relPct}%,${CAT_COLORS.restore} ${relPct}%)`},
          oninput: e => {
            const v = Number(e.target.value);
            e.target.style.background = `linear-gradient(to right,${posCfg.accent} ${v}%,${CAT_COLORS.restore} ${v}%)`;
            const el = document.getElementById('combo-split-label');
            if (el) el.textContent = `${posCfg.headLabel} ${v}%   ·   Personal ${100 - v}%`;
          },
          onchange: e => { f.comboSplit = (100 - Number(e.target.value)) / 100; render(); }
        }),
        h('div',{id:'combo-split-label',style:{textAlign:'center',padding:'6px 0 2px',fontSize:'13px',fontFamily:"'Libre Baskerville',serif",fontStyle:'italic',color:'var(--text)'}},
          `${posCfg.headLabel} ${relPct}%   ·   Personal ${perPct}%`)
      ),
      h('div',{style:{display:'flex',justifyContent:'space-between',fontSize:'11px',marginTop:'2px'}},
        h('span',{style:{color:posCfg.accent}}, posCfg.leftLegend),
        h('span',{style:{color:CAT_COLORS.restore}},'Personal 🌊')
      )
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'Optional notes…',rows:'3',oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),

    h('div',{style:{display:'flex',gap:'8px'}},
      h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),
      h('button',{class:'submit-btn'+(ok?'':' disabled'),onclick:ok?saveCombined:null},'Log Both')
    ),

    // ── Debug panel ──
    S.showDebug ? (() => {
      if (!f.eventType || !f.restoreType) return buildDebugPlaceholder('select a '+posCfg.headLabel.toLowerCase()+' type and a restorative type to see both scores');
      const cap = bankDayCap(S.dayEntries.find(e=>e.category==='libido'));
      const relMult = 1 - split, perMult = split;
      const relRaw = bankScoreEntry({ category:posCfg.category, eventType:f.eventType, connectionQuality:f.connectionQuality||3 }, cap).score;
      const rt  = S.restoreTypes.find(x => (typeof x==='string'?x:x.name) === f.restoreType);
      const perRaw = restoreScore({ restoreQuality:f.restoreQuality||4, restoreImmersion:f.restoreImmersion||3, rqMigrated:true }, rt, cap);
      const breakdown = [
        {label:posCfg.headLabel+' (full)', value:+relRaw.toFixed(1), note:`${f.eventType} · connection quality`},
        {label:`× split ${relPct}% → ${isIndividual ? 'Social' : 'Relational'}`, value:+(relRaw*relMult).toFixed(1), note: relMult===0 ? 'no '+posCfg.category+' entry created' : ''},
        {label:'Restore (full)', value:+perRaw.toFixed(1), note:`${f.restoreType} · immersion × quality`},
        {label:`× split ${perPct}% → Personal`, value:+(perRaw*perMult).toFixed(1), note: perMult===0 ? 'no restore entry created' : ''},
      ];
      return buildDebugPanel(null, breakdown);
    })() : null
  ));
}

// Writes TWO independent, ordinary entries: the positive-side entry
// (affection in Partner/Dating, social in Individual) and a restore entry.
// Nothing downstream needs to know they came from the Combined screen.
function saveCombined(){
  const f = S.form;
  const isIndividual = S.relationshipMode === 'individual';
  const isDating = S.relationshipMode === 'dating';
  const restName = t => typeof t === 'string' ? t : t.name;
  const posCategory = isIndividual ? 'social' : 'affection';
  const posTypeList = isIndividual ? (S.socialTypes || []) : S.affectionTypes;
  const posLabel    = isIndividual ? 'Social' : bondingLabel();
  const validPos    = posTypeList.find(t => t.name === f.eventType) ? f.eventType : null;
  const validRest   = S.restoreTypes.find(t => restName(t) === f.restoreType) ? f.restoreType : null;

  const split   = f.comboSplit == null ? 0.5 : f.comboSplit;
  const relMult = 1 - split;
  const perMult = split;

  const bothSides = relMult > 0 && perMult > 0;
  const userNotes = f.notes || '';
  const posNotes = bothSides
    ? `↔ Combined activity — also logged as Restorative: "${validRest || f.restoreType}".` + (userNotes ? '\n' + userNotes : '')
    : userNotes;
  const restNotes = bothSides
    ? `↔ Combined activity — also logged as ${posLabel}: "${validPos || f.eventType}".` + (userNotes ? '\n' + userNotes : '')
    : userNotes;

  const writes = [];
  if (relMult > 0) {
    const posRec = {
      date: S.selectedDate,
      category: posCategory,
      eventType: validPos,
      connectionQuality: f.connectionQuality || 3,
      notes: posNotes,
    };
    // Partner/Dating bonding tracks who initiated; Individual social doesn't.
    if (!isIndividual) {
      posRec.initiatedBy = isDating ? (f.initiatedBy || null) : (f.initiatedBy || 'mutual');
      posRec.attachmentTags = [];
    }
    if (relMult < 1) posRec.scoreScale = relMult;
    writes.push(dbPut('entries', posRec));
  }
  if (perMult > 0) {
    const restoreRec = {
      date: S.selectedDate,
      category: 'restore',
      eventType: validRest,
      restoreQuality: f.restoreQuality || 4,
      restoreImmersion: f.restoreImmersion || 3,
      restoreObstacles: (f.restoreQuality != null && f.restoreQuality <= 2) ? (f.restoreObstacles || []) : [],
      notes: restNotes,
      rqMigrated: true,
    };
    if (perMult < 1) restoreRec.scoreScale = perMult;
    writes.push(dbPut('entries', restoreRec));
  }

  closeModalSilent();
  Promise.all(writes)
    .then(loadDay).then(loadAll).then(render)
    .catch(e=>{ console.error('Save failed:',e); alert('Save failed — '+e.message); });
}
