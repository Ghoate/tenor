'use strict';

/* ── Friction form (Individual mode — Social negative) ── */
function buildFrictionForm() {
  const f = S.form;
  const isEdit = !!f._editId;
  const ok = !!f.impact && !!f.intensity && !!f.resolution;

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'🌧️ Friction'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'14px',marginTop:'-4px',lineHeight:'1.5'}},
      'A rough social moment — argument, exclusion, depleting obligation, one-sided dynamic, or unspoken tension. Scores against your Social balance.'),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Impact',
        h('span',{style:{color:'var(--muted)',fontWeight:'400',marginLeft:'6px',fontSize:'10px'}},'how much it hit you')
      ),
      h('div',{class:'btn-grid-5'},
        ...FRICTION_IMPACT.map(i=>h('button',{
          class:'sel-btn flex1'+(f.impact===i.val?' sel-friction':''),
          onclick:()=>{ f.impact=i.val; render(); }
        }, i.label, h('span',{class:'sub'},resolveSub(i.sub))))
      )
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Intensity',
        h('span',{style:{color:'var(--muted)',fontWeight:'400',marginLeft:'6px',fontSize:'10px'}},'how heavy in the moment')
      ),
      h('div',{class:'btn-grid-5'},
        ...FRICTION_INTENSITY.map(i=>h('button',{
          class:'sel-btn flex1'+(f.intensity===i.val?' sel-friction':''),
          onclick:()=>{ f.intensity=i.val; render(); }
        }, i.label, h('span',{class:'sub'},resolveSub(i.sub))))
      )
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Where it landed'),
      h('div',{class:'btn-grid-5'},
        ...FRICTION_RESOLUTION.map(r=>h('button',{
          class:'sel-btn flex1'+(f.resolution===r.val?' sel-friction':''),
          onclick:()=>{ f.resolution=r.val; render(); }
        }, r.label, h('span',{class:'sub'},resolveSub(r.sub))))
      )
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'Optional notes…',rows:'3',oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),

    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},
      h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),
      h('button',{class:'submit-btn'+(ok?'':' disabled'),onclick:ok?saveFriction:null}, isEdit?'Save Changes':'Save Entry')
    ),

    // ── Debug panel ──
    S.showDebug ? (() => {
      if (!f.impact || !f.intensity || !f.resolution) {
        return buildDebugPlaceholder('select impact, intensity, and resolution to see calculation');
      }
      const breakdown = [];
      const push = (label, value, note) => breakdown.push({label, value, note});
      const cap = bankDayCap(S.dayEntries.find(e=>e.category==='libido'));
      const intM    = FRICTION_INTENSITY_M[f.intensity] || 0.60;
      const resObj  = FRICTION_RESOLUTION.find(r=>r.val===f.resolution);
      const resM    = resObj ? resObj.m : 0.60;
      const intLab  = FRICTION_INTENSITY.find(i=>i.val===f.intensity)?.label||'';
      const resLab  = resObj?.label||'';
      const impLab  = FRICTION_IMPACT.find(i=>i.val===f.impact)?.label||'';
      const invCap = 1 / (cap || 1.0);
      push('W  Impact', f.impact, `"${impLab}" — raw 1-5 weight`);
      push('I  Intensity', intM, `"${intLab}" — ×0.20 to ×1.00`);
      push('R  Resolution', resM, `"${resLab}" — ×0.20 to ×1.00`);
      push('C  Day capacity', +cap.toFixed(3), 'mood/energy capacity — lower amplifies negatives');
      const score = -(f.impact * intM * resM * invCap / SCORE_MAX_RAW) * 100;
      push('Final score', +score.toFixed(1), '−(W × I × R × invCap) / 5 × 100 → Social balance');
      return buildDebugPanel(score, breakdown);
    })() : null
  ));
}

function saveFriction(){
  const f = S.form;
  const rec = {
    date: S.selectedDate,
    category: 'friction',
    impact: f.impact || 3,
    intensity: f.intensity || 3,
    resolution: f.resolution || 'still-rough',
    notes: f.notes || '',
  };
  if (f._editId) rec.id = f._editId;
  closeModalSilent();
  dbPut('entries', rec).then(loadDay).then(loadAll).then(render).catch(e=>{console.error('Save failed:',e); alert('Save failed — '+e.message);});
}
