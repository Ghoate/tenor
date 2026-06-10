'use strict';

/* ── Steadying form ─────────────────────────────────── */
function buildSteadyingForm() {
  const f=S.form;
  const isEdit = !!f._editId;
  // Multi-select: use selectedSteadyingTypes array; init from existing entry on edit
  if (!Array.isArray(f.selectedSteadyingTypes)) {
    const saved = Array.isArray(f.caretakerTypes) && f.caretakerTypes.length ? f.caretakerTypes
                : f.caretakerType ? [f.caretakerType] : [];
    f.selectedSteadyingTypes = saved;
  }
  // Map legacy ctContext to burnoutInvolvedConflict for old entries
  if (f.burnoutInvolvedConflict === undefined && f.ctContext !== undefined) {
    f.burnoutInvolvedConflict = f.ctContext === 'relationship' ? true : f.ctContext === 'external' ? false : null;
  }
  const toggleType = name => {
    const idx = f.selectedSteadyingTypes.indexOf(name);
    if (idx >= 0) f.selectedSteadyingTypes = f.selectedSteadyingTypes.filter(x=>x!==name);
    else f.selectedSteadyingTypes = [...f.selectedSteadyingTypes, name];
    render();
  };
  const ok = (S.caretakerTypes.length === 0 || f.selectedSteadyingTypes.length > 0) && !!f.steadyingIntensity && !!f.drain && !!f.duration;
  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'💨 Steadying'),

    // Caretaker type selector — multi-select
    S.caretakerTypes.length > 0 ? h('div',{class:'form-section'},
      h('label',{class:'form-label'},'What were you doing — select all that apply'),
      h('div',{class:'chips'},
        ...(f.selectedSteadyingTypes||[]).filter(n=>!S.caretakerTypes.find(t=>t.name===n&&!t.hidden)).map(n=>
          h('div',{class:'chip selected',style:{opacity:'0.5',cursor:'default',textDecoration:'line-through',pointerEvents:'none'},title: S.caretakerTypes.find(t=>t.name===n) ? 'This type is hidden' : 'This type was removed from your library'}, '⚠️ '+n)
        ),
        ...S.caretakerTypes.filter(t=>!t.hidden).slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t=>h('div',{
          class:'chip'+(f.selectedSteadyingTypes.includes(t.name)?' selected sel-steadying':''),
          onclick:()=>toggleType(t.name)
        },t.name)),
        h('div',{class:'chip add-new',onclick:()=>{
          // Save steadying-form state so we can resume here after the
          // add-profile popup closes (Save → add the new profile to the
          // selected chips, Cancel → return as-is).
          S._resetSheetScroll = true;
          S._returnAfterAdd = {
            tab: S.activeTab,
            modal: 'burnout',
            formSnapshot: { ...S.form, selectedSteadyingTypes: [...(S.form.selectedSteadyingTypes||[])] },
            targetField: 'selectedSteadyingTypes',
            targetMode: 'push',
          };
          S.activeTab='library';
          S.libSteadyingExpanded=true;
          S.libBondingExpanded=false;  S.libBondingForm={};
          S.libIntimacyExpanded=false; S.libIntimacyForm={};
          S.libRestoreExpanded=false;  S.libRestoreForm={};
          S.libSteadyingForm = { ctAddingNew: true };
          closeModalSilent();
          render();
        }},'+ Add new'),
      )
    ) : h('div',{class:'form-section'},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'8px'}},
        'No steadying profiles defined yet.'),
      h('div',{class:'chips'},
        h('div',{class:'chip add-new',style:{display:'inline-block'},onclick:()=>{
          S._resetSheetScroll = true;
          S._returnAfterAdd = {
            tab: S.activeTab,
            modal: 'burnout',
            formSnapshot: { ...S.form, selectedSteadyingTypes: [...(S.form.selectedSteadyingTypes||[])] },
            targetField: 'selectedSteadyingTypes',
            targetMode: 'push',
          };
          S.activeTab='library';
          S.libSteadyingExpanded=true;
          S.libBondingExpanded=false;  S.libBondingForm={};
          S.libIntimacyExpanded=false; S.libIntimacyForm={};
          S.libRestoreExpanded=false;  S.libRestoreForm={};
          S.libSteadyingForm = { ctAddingNew: true };
          closeModalSilent();
          render();
        }},'+ Add steadying profile'),
      )
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Intensity'),
      h('div',{class:'btn-grid-5'},
        ...STEADYING_INTENSITY.map(l=>h('button',{
          class:'sel-btn flex1'+(f.steadyingIntensity===l.val?' sel-steadying':''),
          onclick:()=>{f.steadyingIntensity=l.val;render();}
        }, l.label, h('span',{class:'sub'},l.sub)))
      )
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Time spent'),
      h('div',{class:'btn-grid-5'},
        ...DURATION_OPTIONS.map(o=>h('button',{
          class:'sel-btn flex1'+(f.duration===o.v?' sel-steadying':''),
          onclick:()=>{f.duration=o.v;render();}
        }, o.s))
      )
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'How much did it take from me'),
      h('div',{class:'btn-grid-5'},
        ...DRAIN_LEVELS.map(d=>h('button',{
          class:'sel-btn flex1'+(f.drain===d.val?' sel-steadying':''),
          onclick:()=>{f.drain=d.val;render();}
        }, d.label, h('span',{class:'sub'},resolveSub(d.sub))))
      )
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'How did it resolve'),
      h('div',{class:'btn-grid-5'},
        ...CARETAKER_OUTCOME.map(o=>h('button',{
          class:'sel-btn'+(Number(f.caretakerOutcome)===o.val?' sel-steadying':''),
          onclick:()=>{f.caretakerOutcome=o.val;render();}
        }, o.label, h('span',{class:'sub'},resolveSub(o.sub))))
      )
    ),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Did this involve a conflict with your partner?'),
      h('div',{class:'btn-grid-2'},
        h('button',{
          class:'sel-btn'+(f.burnoutInvolvedConflict===true?' sel-steadying':''),
          onclick:()=>{ f.burnoutInvolvedConflict=true; render(); }
        }, 'Yes', h('span',{class:'sub'},'We argued or it became a conflict')),
        h('button',{
          class:'sel-btn'+(f.burnoutInvolvedConflict===false?' sel-steadying':''),
          onclick:()=>{ f.burnoutInvolvedConflict=false; render(); }
        }, 'No', h('span',{class:'sub'},'Supporting without conflict'))
      ),
      f.burnoutInvolvedConflict === true ? h('div',{style:{
        marginTop:'10px', padding:'10px 12px', borderRadius:'10px',
        background:'var(--c-conflict-tint)', border:'1px solid var(--c-conflict-border)',
        fontSize:'12px', color:'var(--muted)', lineHeight:'1.6'
      }},
        '⛈️ After saving this steadying you\'ll be taken to log the conflict — that\'s where the relational impact scores.'
      ) : null
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'What happened, how you feel now…',rows:'3',oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),

    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),h('button',{class:'submit-btn'+(ok?'':' disabled'),onclick:ok?saveSteadying:null},isEdit?'Save Changes':'Save Entry')),

    // ── Debug panel ──
    S.showDebug ? (() => {
      if ((!f.selectedSteadyingTypes?.length && S.caretakerTypes.length > 0) || !f.duration || !f.drain) return buildDebugPlaceholder('select type(s), intensity, duration and drain to see calculation');

      const breakdown = [];
      const push = (label, value, note) => breakdown.push({label, value, note});
      const cap = bankDayCap(S.dayEntries.find(e=>e.category==='libido'));

      const selected = (f.selectedSteadyingTypes||[]).map(n=>S.caretakerTypes.find(t=>t.name===n)).filter(Boolean);
      const rawW = selected.length > 0 ? selected.reduce((s,t)=>s+deriveCaretakerWeight(t),0)/selected.length : 3.0;
      const wDisplay = Math.round(rawW / 5 * 100);
      push('W  Type weight (avg normalized)', wDisplay, `avg of ${selected.length||1} type(s) — geomean of 5 profile questions each`);

      const intensityObj = STEADYING_INTENSITY.find(l => l.val === f.steadyingIntensity);
      const iM = STEAD_INTENSITY_M[f.steadyingIntensity || 3] || 0.60;
      push('I  Intensity', iM, intensityObj ? `"${intensityObj.label}" — ×0.20 to ×1.00` : 'No intensity selected — default ×0.60');

      const durObj = DURATION_OPTIONS.find(o => o.v === f.duration);
      const tM = durObj ? durObj.m : 0.60;
      push('T  Duration', tM, `"${durObj?.s || f.duration}" — ×0.20 to ×1.00`);

      const drainObj = DRAIN_LEVELS.find(d => d.val === f.drain);
      const dM = drainObj ? drainObj.m : 0.60;
      push('D  Drain', dM, `"${drainObj?.label || f.drain}" — ×0.20 to ×1.00`);

      const outcomeObj = CARETAKER_OUTCOME.find(o => o.val === Number(f.caretakerOutcome));
      const rM = outcomeObj ? outcomeObj.m : 0.60;
      push('R  Outcome', rM, outcomeObj ? `"${outcomeObj.label}" — Breakthrough ×0.20 to Worsened ×1.00` : 'No outcome selected — default ×0.60');

      push('C  Day capacity (inverse)', +(1/cap).toFixed(3), 'Inverse cap for negative events — bad day = higher cost (0.77–1.32)');

      const geoMean = Math.pow(tM * dM * rM, 1/3);
      const score = -(rawW * iM * geoMean * (1/cap) / 5) * 100;
      push('Personal gauge cost', +score.toFixed(1), `-(W × I × geomean(T,D,R) × 1/C) / 5 × 100 — Personal only, never Relational`);

      return buildDebugPanel(score, breakdown);
    })() : null
  ));
}
function saveSteadying(){
  const f=S.form;
  const openConflict = f.burnoutInvolvedConflict === true && !f._editId;
  const selectedTypes = Array.isArray(f.selectedSteadyingTypes) ? f.selectedSteadyingTypes : (f.caretakerType ? [f.caretakerType] : []);
  const selectedObjs = selectedTypes.map(n=>S.caretakerTypes.find(t=>t.name===n)).filter(Boolean);
  const effectiveWeight = selectedObjs.length > 0
    ? selectedObjs.reduce((s,t)=>s+(t.weight||deriveCaretakerWeight(t)),0)/selectedObjs.length
    : (f.caretakerWeight || null);

  const validTypes = selectedObjs.map(t => t.name);
  const rec = {
    date:S.selectedDate, category:'burnout',
    caretakerType: validTypes[0]||null,
    caretakerTypes: validTypes,
    caretakerWeight: effectiveWeight,
    steadyingIntensity: f.steadyingIntensity||null,
    caretakerOutcome: f.caretakerOutcome||null,
    ctContext: f.burnoutInvolvedConflict === true ? 'relationship' : f.burnoutInvolvedConflict === false ? 'external' : (f.ctContext||null),
    duration:f.duration||'', drain:f.drain,
    notes:f.notes||''
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
