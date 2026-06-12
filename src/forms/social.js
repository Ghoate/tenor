'use strict';

/* ── Social form (Individual mode) ───────────────────── */
function buildSocialForm() {
  const f = S.form;
  const isEdit = !!f._editId;
  const socTypeNames    = (S.socialTypes||[]).map(t=>t.name);
  const socVisibleNames = (S.socialTypes||[]).filter(t=>!t.hidden).map(t=>t.name);
  const typeChips = [
    f.eventType && !socVisibleNames.includes(f.eventType) ? h('div',{
      class:'chip selected',
      style:{opacity:'0.5',cursor:'default',textDecoration:'line-through',pointerEvents:'none'},
      title: socTypeNames.includes(f.eventType) ? 'This type is hidden — unhide it in Activities to re-select' : 'This type was removed from your library'
    }, '⚠️ '+f.eventType) : null,
    ...(S.socialTypes||[]).filter(t=>!t.hidden).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>h('div',{
      class:'chip'+(f.eventType===t.name?' selected sel-social':''),
      onclick:()=>{ f.eventType=t.name; render(); }
    }, t.name)),
    h('div',{class:'chip add-new',onclick:()=>{
      // Resume the social entry form after add-activity popup dismisses.
      S._resetSheetScroll = true;
      S._returnAfterAdd = {
        tab: S.activeTab,
        modal: 'social',
        formSnapshot: { ...S.form },
        targetField: 'eventType',
      };
      S.activeTab='library';
      S.libSocialExpanded=true;
      S.libBondingExpanded=false;   S.libBondingForm={};
      S.libIntimacyExpanded=false;  S.libIntimacyForm={};
      S.libRestoreExpanded=false;   S.libRestoreForm={};
      S.libSteadyingExpanded=false; S.libSteadyingForm={};
      S.libWobbleExpanded=false;
      S.libSocialForm = { addingNew: true };
      closeModalSilent();
      render();
    }},'+ Add new'),
  ];

  const ok = !!f.eventType && !!f.connectionQuality;

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'🫂 Social'),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Activity'),
      h('div',{class:'chips'},...typeChips)
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'How was the connection'),
      h('div',{class:'btn-grid-5'},
        ...SOCIAL_QUALITY.map(q=>h('button',{
          class:'sel-btn flex1'+(f.connectionQuality===q.val?' sel-social':''),
          onclick:()=>{ f.connectionQuality=q.val; render(); }
        }, q.label, h('span',{class:'sub'},resolveSub(q.sub))))
      )
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'Optional notes…',rows:'3',oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),

    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},
      h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),
      h('button',{class:'submit-btn'+(ok?'':' disabled'),onclick:ok?saveSocial:null}, isEdit?'Save Changes':'Save Entry')
    ),

    // ── Debug panel ──
    S.showDebug ? (() => {
      if (!f.eventType) return buildDebugPlaceholder('select an activity to see calculation');
      const breakdown = [];
      const push = (label, value, note) => breakdown.push({label, value, note});
      const cap = bankDayCap(S.dayEntries.find(e=>e.category==='libido'));
      const typeObj = (S.socialTypes||[]).find(t => t.name === f.eventType);
      const raw = typeObj ? deriveSocialActivityWeight(typeObj) : 1.0;
      const wDisplay = Math.round(raw / 5 * 100);
      push('W  Activity weight (normalized)', wDisplay, `raw=${raw.toFixed(4)} — geomean(profile) × SN_weight, scaled 0-100`);
      if (f.connectionQuality) {
        const cqM     = BANK_OUTCOME_M[f.connectionQuality] || 0.60;
        const cqLabel = CONNECTION_QUALITY.find(q=>q.val===f.connectionQuality)?.label||'';
        push('R  Connection quality', cqM, `"${cqLabel}" — ×0.20 to ×1.00`);
        push('C  Day capacity', +cap.toFixed(3), 'From mood/energy — capacity multiplier');
        const score = (raw * cap * cqM / SCORE_MAX_RAW) * 100;
        push('Final score', +score.toFixed(1), `(W × C × R) / 5 × 100 → Social balance`);
        return buildDebugPanel(score, breakdown);
      }
      return buildDebugPanel(null, breakdown);
    })() : null
  ));
}

function saveSocial(){
  const f = S.form;
  const validType = (S.socialTypes||[]).find(t => t.name === f.eventType) ? f.eventType : null;
  const rec = {
    date: S.selectedDate,
    category: 'social',
    eventType: validType,
    connectionQuality: f.connectionQuality || 3,
    notes: f.notes || '',
  };
  if (f._editId) rec.id = f._editId;
  closeModalSilent();
  dbPut('entries', rec).then(loadDay).then(loadAll).then(render).catch(e=>{console.error('Save failed:',e); alert('Save failed — '+e.message);});
}
