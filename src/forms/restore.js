'use strict';

/* ── Restorative form ───────────────────────────────── */
function buildRestoreForm() {
  const f=S.form;
  const isEdit  = !!f._editId;
  const ok      = !!f.eventType && !!f.restoreQuality && !!f.restoreImmersion;
  if (!f.restoreObstacles) f.restoreObstacles = [];

  const restTypeNames = S.restoreTypes.map(t=>typeof t==='string'?t:t.name);
  const restVisibleNames = S.restoreTypes.filter(t=>!(typeof t==='object'&&t.hidden)).map(t=>typeof t==='string'?t:t.name);
  const typeChips = [
    f.eventType && !restVisibleNames.includes(f.eventType) ? h('div',{
      class:'chip selected',
      style:{opacity:'0.5',cursor:'default',textDecoration:'line-through',pointerEvents:'none'},
      title: restTypeNames.includes(f.eventType) ? 'This type is hidden — unhide it in Library to re-select' : 'This type was removed from your library'
    }, '⚠️ '+f.eventType) : null,
    ...S.restoreTypes.filter(t=>!(typeof t==='object'&&t.hidden)).slice().sort((a,b)=>(typeof a==="string"?a:a.name).localeCompare(typeof b==="string"?b:b.name)).map(t=>h('div',{
      class:'chip'+(f.eventType===(typeof t==='string'?t:t.name)?' selected':''),
      onclick:()=>{ f.eventType=typeof t==='string'?t:t.name; render(); }
    }, typeof t==='string'?t:t.name)),
    h('div',{class:'chip add-new',onclick:()=>{S.activeTab='library';S.libRestoreExpanded=true;S.libBondingExpanded=false;S.libBondingForm={};S.libIntimacyExpanded=false;S.libIntimacyForm={};S.libSteadyingExpanded=false;S.libSteadyingForm={};S.libWobbleExpanded=false;closeModalSilent();render();}},'+ Manage types'),
  ];

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'🌊 Restorative'),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Activity'),
      h('div',{class:'chips'},...typeChips)
    ),
    h('div',{},
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
      f.restoreQuality !== null && f.restoreQuality <= 2 ? h('div',{class:'form-section'},
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
      ) : null
    ),
    buildScoreScaleSlider(f, CAT_COLORS.restore),
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'Optional notes…',rows:'3',oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),

    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),h('button',{class:'submit-btn'+(ok?'':' disabled'),onclick:ok?saveRestore:null},isEdit?'Save Changes':'Save Entry')),

    // ── Debug panel ──
    S.showDebug ? (() => {
      if (!f.eventType) return buildDebugPlaceholder('select an activity type to see needs contribution');

      const typeObj = S.restoreTypes.find(t => (typeof t==='string'?t:t.name) === f.eventType);
      if (!typeObj || typeof typeObj === 'string' || !typeObj.needsMap)
        return buildDebugPlaceholder('this type has no needs profile yet — edit it in Manage types');

      const qualityVal    = f.restoreQuality || 4;
      const immersionVal  = f.restoreImmersion || 3;
      const rq            = RESTORE_QUALITY.find(q=>q.val===qualityVal);
      const ri            = RESTORE_IMMERSION.find(i=>i.val===immersionVal);
      const qualityLabel  = rq?.label || '';
      const immersionLabel= ri?.label || '';
      const qualityMult   = rq?.mult || 0.80;
      const immersionMult = ri?.mult || 0.60;
      const cap           = bankDayCap(S.dayEntries.find(e=>e.category==='libido'));

      const rawW      = deriveRestoreWeight(typeObj);
      const pnWeight  = derivePersonalNeedsWeight(typeObj.needsMap);
      const wDisplay  = Math.round(rawW / SCORE_MAX_RAW * 100);
      const scale     = f.scoreScale ?? 1;
      let totalScore  = (rawW * immersionMult * qualityMult * cap / SCORE_MAX_RAW) * 100;

      const breakdown = [];
      const push = (label, value, note) => breakdown.push({label, value, note});

      push('W  Activity profile (normalized)', wDisplay, `raw=${rawW.toFixed(4)} — geomean(5 dims) × PN weight`);
      push('PN Personal needs weight', +pnWeight.toFixed(3), 'How well this activity matches your PN ranking (0–1)');
      push('I  Immersion', immersionMult, `"${immersionLabel}" — ×0.20 to ×1.00`);
      push('R  Quality', qualityMult, `"${qualityLabel}" — ×0.20 to ×1.00`);
      push('C  Day capacity', +cap.toFixed(3), S.showPhysical ? 'From mood/energy/desire — capacity multiplier' : 'From mood/energy — 0.76 to 1.302');
      if (scale !== 1) {
        push('S  Combined split', scale, `combined activity — counts ${Math.round(scale*100)}%`);
        totalScore *= scale;
        push('Final score', +totalScore.toFixed(1), `(W × I × R × C) / 5 × 100 × split`);
      } else {
        push('Final score', +totalScore.toFixed(1), `(W × I × R × C) / 5 × 100`);
      }

      return buildDebugPanel(totalScore, breakdown);
    })() : null
  ));
}
function saveRestore(){
  const f=S.form;
  const validType = S.restoreTypes.find(t => (typeof t === 'string' ? t : t.name) === f.eventType) ? f.eventType : null;
  const rec = {
    date: S.selectedDate,
    category: 'restore',
    eventType: validType,
    restoreQuality: f.restoreQuality || 4,
    restoreImmersion: f.restoreImmersion || 3,
    restoreObstacles: (f.restoreQuality != null && f.restoreQuality <= 2) ? (f.restoreObstacles || []) : [],
    notes: f.notes || '',
    rqMigrated: true,
  };
  if (f.scoreScale != null) rec.scoreScale = f.scoreScale;
  if (f._editId) rec.id = f._editId;
  closeModalSilent();
  dbPut('entries', rec).then(loadDay).then(loadAll).then(render).catch(e=>{console.error('Save failed:',e);alert('Save failed — '+e.message);});
}
