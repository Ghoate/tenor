'use strict';

/* ── Bonding form ───────────────────────────────────── */
function buildBondingForm() {
  const f=S.form;
  const isEdit = !!f._editId;
  const affTypeNames = S.affectionTypes.map(t=>t.name);
  const affVisibleNames = S.affectionTypes.filter(t=>!t.hidden).map(t=>t.name);
  const typeChips = [
    f.eventType && !affVisibleNames.includes(f.eventType) ? h('div',{
      class:'chip selected',
      style:{opacity:'0.5',cursor:'default',textDecoration:'line-through',pointerEvents:'none'},
      title: affTypeNames.includes(f.eventType) ? 'This type is hidden — unhide it in Library to re-select' : 'This type was removed from your library'
    }, '⚠️ '+f.eventType) : null,
    ...S.affectionTypes.filter(t=>!t.hidden).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>h('div',{class:'chip'+(f.eventType===t.name?' selected sel-bonding':''),onclick:()=>{
      f.eventType=t.name;
      render();
    }},t.name)),
    h('div',{class:'chip add-new',onclick:()=>{
      // Save bonding-form state so we can resume here after the add-activity
      // popup closes (Save → pre-select the new type, Cancel → return as-is).
      S._resetSheetScroll = true;
      S._returnAfterAdd = {
        tab: S.activeTab,
        modal: 'affection',
        formSnapshot: { ...S.form },
        targetField: 'eventType',
      };
      S.activeTab='library';
      S.libBondingExpanded=true;
      S.libIntimacyExpanded=false;  S.libIntimacyForm={};
      S.libRestoreExpanded=false;   S.libRestoreForm={};
      S.libSteadyingExpanded=false; S.libSteadyingForm={};
      S.libWobbleExpanded=false;
      S.libBondingForm = { addingNew: true };
      closeModalSilent();
      render();
    }},'+ Add new'),
  ];
  const ok = !!f.eventType && !!f.connectionQuality && !!f.initiatedBy;
  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'🩷 '+bondingLabel()),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Type of '+bondingLabel().toLowerCase()),
      h('div',{class:'chips'},...typeChips)
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Who initiated'),
      h('div',{class:'btn-grid-3'},
        h('button',{class:'sel-btn'+(f.initiatedBy==='me'?' sel-bonding':''),onclick:()=>{f.initiatedBy='me';render();}},'Me',h('span',{class:'sub'},'I initiated')),
        h('button',{class:'sel-btn'+(f.initiatedBy==='her'?' sel-bonding':''),onclick:()=>{f.initiatedBy='her';render();}},P.Sub,h('span',{class:'sub'},`${P.Sub} initiated`)),
        h('button',{class:'sel-btn'+(f.initiatedBy==='mutual'?' sel-bonding':''),onclick:()=>{f.initiatedBy='mutual';render();}},'Mutual',h('span',{class:'sub'},'Both'))
      )
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Connection quality'),
      h('div',{class:'btn-grid-5'},
        ...CONNECTION_QUALITY.map(q=>h('button',{
          class:'sel-btn flex1'+(f.connectionQuality===q.val?' sel-bonding':''),
          onclick:()=>{f.connectionQuality=q.val;render();}
        }, q.label, h('span',{class:'sub'},resolveSub(q.sub))))
      )
    ),
    buildScoreScaleSlider(f, CAT_COLORS.affection),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'Optional notes…',rows:'3',oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),
    // ── Attachment tags (optional) ────────────────────
    buildAttachmentTagSection({
      f, fieldKey:'attachmentTags', tags: BONDING_ATTACHMENT_TAGS,
      headline:'What was happening in you?',
      hint:'Internal state during the moment — separate from the connection itself. Pick any that fit, or none.',
    }),

    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),h('button',{class:'submit-btn'+(ok?'':' disabled'),onclick:ok?saveBonding:null},isEdit?'Save Changes':'Save Entry')),

    // ── Debug panel ──
    S.showDebug ? (() => {
      if (!f.eventType) return buildDebugPlaceholder('select an activity type to see calculation');

      const breakdown = [];
      const push = (label, value, note) => breakdown.push({label, value, note});
      const cap = bankDayCap(S.dayEntries.find(e=>e.category==='libido'));

      const typeObj = S.affectionTypes.find(t => t.name === f.eventType);
      const raw = typeObj ? deriveActivityWeight(typeObj) : 1.0;
      const wDisplay = Math.round(raw / 5 * 100);
      push('W  Activity weight (normalized)', wDisplay, `raw=${raw.toFixed(4)} — geomean(profile) × needs_weight, scaled 0-100`);

      if (f.connectionQuality) {
        const cqM     = BANK_OUTCOME_M[f.connectionQuality] || 0.60;
        const cqLabel = CONNECTION_QUALITY.find(q=>q.val===f.connectionQuality)?.label||'';
        push('R  Connection quality', cqM, `"${cqLabel}" — ×0.20 to ×1.00`);
        push('C  Day capacity', +cap.toFixed(3), S.showPhysical ? 'From mood/energy/libido — 0.50 to 1.25' : 'From mood/energy — 0.50 to 1.25');
        const scale = f.scoreScale ?? 1;
        let score = (raw * cap * cqM / SCORE_MAX_RAW) * 100;
        if (scale !== 1) {
          push('S  Combined split', scale, `combined activity — counts ${Math.round(scale*100)}%`);
          score *= scale;
          push('Final score', +score.toFixed(1), `(geomean × needs × C × R) / 5 × 100 × split`);
        } else {
          push('Final score', +score.toFixed(1), `(geomean × needs × C × R) / 5 × 100`);
        }
        return buildDebugPanel(score, breakdown);
      }

      return buildDebugPanel(null, breakdown);
    })() : null
  ));
}
function saveBonding(){
  const f=S.form;
  const validType = S.affectionTypes.find(t => t.name === f.eventType) ? f.eventType : null;
  const rec = {
    date:S.selectedDate,
    category:'affection',
    eventType:validType,
    initiatedBy: f.initiatedBy || 'mutual',
    connectionQuality:f.connectionQuality||3,
    attachmentTags: Array.isArray(f.attachmentTags) ? f.attachmentTags.slice() : [],
    notes:f.notes||''
  };
  if (f.scoreScale != null) rec.scoreScale = f.scoreScale;
  if (f._editId) rec.id = f._editId;
  closeModalSilent();
  dbPut('entries', rec).then(loadDay).then(loadAll).then(render).catch(e=>{console.error('Save failed:',e);alert('Save failed — '+e.message);});
}
