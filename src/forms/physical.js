'use strict';

/* ── Physical form ──────────────────────────────────── */
function buildPhysicalForm() {
  const f=S.form;
  const isEdit = !!f._editId;
  // Solo state comes from the selected type definition
  const selectedType = S.physicalTypes.find(t=>t.name===f.eventType);
  const isSolo = selectedType ? !!selectedType.defaultSolo : (f.solo === true);
  f.solo = isSolo; // keep in sync
  const ok = !!f.eventType && (isSolo || (!!f.initiatedBy && !!f.connectionQuality));
  const physTypeNames = S.physicalTypes.map(t=>t.name);
  const physVisibleNames = S.physicalTypes.filter(t=>!t.hidden).map(t=>t.name);
  const typeChips = [
    f.eventType && !physVisibleNames.includes(f.eventType) ? h('div',{
      class:'chip selected',
      style:{opacity:'0.5',cursor:'default',textDecoration:'line-through',pointerEvents:'none'},
      title: physTypeNames.includes(f.eventType) ? 'This type is hidden — unhide it in Library to re-select' : 'This type was removed from your library'
    }, '⚠️ '+f.eventType) : null,
    ...S.physicalTypes.filter(t=>!t.hidden).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>h('div',{
      class:'chip'+(f.eventType===t.name?' selected sel-physical':''),
      onclick:()=>{
        f.eventType=t.name;
        f.solo = !!t.defaultSolo;
        render();
      }
    }, t.name + (t.defaultSolo ? ' · solo' : ''))),
    h('div',{class:'chip add-new',onclick:()=>{
      // Save intimacy-form state so we can resume here after the add-activity
      // popup closes (Save → pre-select the new type, Cancel → return as-is).
      S._resetSheetScroll = true;
      S._returnAfterAdd = {
        tab: S.activeTab,
        modal: 'physical',
        formSnapshot: { ...S.form },
        targetField: 'eventType',
      };
      S.activeTab='library';
      S.libIntimacyExpanded=true;
      S.libBondingExpanded=false;   S.libBondingForm={};
      S.libRestoreExpanded=false;   S.libRestoreForm={};
      S.libSteadyingExpanded=false; S.libSteadyingForm={};
      S.libWobbleExpanded=false;
      S.libIntimacyForm = { addingNew: true };
      closeModalSilent();
      render();
    }},'+ Add new'),
  ];
  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'🌹 Intimacy'),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Event type'),
      h('div',{class:'chips'},...typeChips)
    ),
    !isSolo ? h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Who initiated?'),
      h('div',{class:'btn-grid-3'},
        h('button',{class:'sel-btn'+(f.initiatedBy==='me'?' sel-physical':''),onclick:()=>{f.initiatedBy='me';render();}},'Me',h('span',{class:'sub'},'I initiated')),
        h('button',{class:'sel-btn'+(f.initiatedBy==='her'?' sel-physical':''),onclick:()=>{f.initiatedBy='her';render();}},P.Sub,h('span',{class:'sub'},`${P.Sub} initiated`)),
        h('button',{class:'sel-btn'+(f.initiatedBy==='mutual'?' sel-physical':''),onclick:()=>{f.initiatedBy='mutual';render();}},'Mutual',h('span',{class:'sub'},'Both'))
      )
    ) : null,
    isSolo ? h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Context'),
      h('div',{class:'btn-grid-5'},
        ...SOLO_CONTEXT.map(c=>h('button',{
          class:'sel-btn flex1'+(f.soloContext===c.val?' sel-physical':''),
          onclick:()=>{f.soloContext=c.val;render();}
        }, c.label, h('span',{class:'sub'},resolveSub(c.sub))))
      )
    ) : null,
    // Shared: connection quality. Solo: intensity
    !isSolo ? h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Connection quality'),
      h('div',{class:'btn-grid-5'},
        ...CONNECTION_QUALITY.map(q=>h('button',{
          class:'sel-btn flex1'+(f.connectionQuality===q.val?' sel-physical':''),
          onclick:()=>{f.connectionQuality=q.val;render();}
        }, q.label, h('span',{class:'sub'},resolveSub(q.sub))))
      )
    ) : null,
    isSolo ? h('div',{class:'form-section'},
      h('label',{class:'form-label'},'How was it?'),
      h('div',{class:'btn-grid-5'},
        ...PHYSICAL_INTENSITY.map(r=>h('button',{
          class:'sel-btn flex1'+(f.intensity===r.val?' sel-physical':''),
          onclick:()=>{f.intensity=r.val;render();}
        }, r.label, h('span',{class:'sub'},r.desc)))
      )
    ) : null,
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'Optional notes…',rows:'3',oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),

    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),h('button',{class:'submit-btn'+(ok?'':' disabled'),onclick:ok?savePhysical:null},isEdit?'Save Changes':'Save Entry')),

    // ── Debug panel ──
    S.showDebug ? (() => {
      if (!f.eventType) return buildDebugPlaceholder('select an event type to see calculation');

      const breakdown = [];
      const push = (label, value, note) => breakdown.push({label, value, note});
      const cap = bankDayCap(S.dayEntries.find(e=>e.category==='libido'));

      if (isSolo) {
        const ctxLabel = SOLO_CONTEXT.find(c=>c.val===f.soloContext)?.label||'';
        push('Solo event', null, ctxLabel || 'Select context');
        push('Balance impact', 'None', 'Solo events are logged for pattern insight only — not scored');
        return buildDebugPanel(0, breakdown);
      } else {
        const typeObj = S.physicalTypes.find(t => t.name === f.eventType);
        const raw = typeObj ? deriveActivityWeight(typeObj) : 1.0;
        const wDisplay = Math.round(raw / 5 * 100);
        push('W  Activity weight (normalized)', wDisplay, `raw=${raw.toFixed(4)} — geomean(profile) × needs_weight, scaled 0-100`);
        if (f.connectionQuality) {
          const cqM     = BANK_OUTCOME_M[f.connectionQuality] || 0.60;
          const cqLabel = CONNECTION_QUALITY.find(q=>q.val===f.connectionQuality)?.label||'';
          push('R  Connection quality', cqM, `"${cqLabel}" — ×0.20 to ×1.00`);
          push('C  Day capacity', +cap.toFixed(3), S.showPhysical ? 'From mood/energy/desire — capacity multiplier' : 'From mood/energy — 0.76 to 1.302');
          const score = (raw * cap * cqM / SCORE_MAX_RAW) * 100;
          push('Final score', +score.toFixed(1), `(geomean × needs × C × R) / 5 × 100`);
          return buildDebugPanel(score, breakdown);
        }
      }

      return buildDebugPanel(null, breakdown);
    })() : null
  ));
}
function savePhysical(){
  const f=S.form;
  const isSolo = !!f.solo;
  const validType = S.physicalTypes.find(t => t.name === f.eventType) ? f.eventType : null;
  const rec = {
    date:S.selectedDate, category:'physical',
    eventType:validType, solo:isSolo,
    initiatedBy: isSolo ? null : (f.initiatedBy||null),
    connectionQuality: isSolo ? null : (f.connectionQuality||null),
    intensity: isSolo ? (f.intensity||null) : null,
    soloContext: isSolo ? (f.soloContext||null) : null,
    notes:f.notes||''
  };
  if (f._editId) rec.id = f._editId;
  closeModalSilent();
  dbPut('entries', rec).then(loadDay).then(loadAll).then(render).catch(e=>{console.error('Save failed:',e);alert('Save failed — '+e.message);});
}
