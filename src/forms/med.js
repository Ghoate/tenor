'use strict';

/* ── MED form (Mood, Energy, Desire) ────────────────── */
function buildMedForm() {
  const f=S.form;
  const isEdit = !!f._editId;
  if(f.libiLevel==null)f.libiLevel=3;
  if(f.mood==null)f.mood=3;
  if(f.energy==null)f.energy=3;

  const lvl = LIBIDO_LEVELS[f.libiLevel-1];
  const lp  = ((f.libiLevel-1)/4*100).toFixed(1);
  const mp  = ((f.mood-1)/4*100).toFixed(1);
  const ep  = ((f.energy-1)/4*100).toFixed(1);

  const sliderRow = (label, val, pct, valueEl, min, max, onInput, labelId, onRelease) =>
    h('div',{style:{marginBottom:'12px'}},
      h('label',{class:'form-label'}, label),
      h('div',{class:'scale-wrap'},
        h('input',{type:'range',class:'scale-slider',min:String(min),max:String(max),value:String(val),
          style:{background:`linear-gradient(to right,var(--c-libido) ${pct}%,var(--bg3) ${pct}%)`},
          oninput: e => {
            const v = Number(e.target.value);
            const p = ((v - min) / (max - min) * 100).toFixed(1);
            e.target.style.background = `linear-gradient(to right,var(--c-libido) ${p}%,var(--bg3) ${p}%)`;
            if (labelId) {
              const el = document.getElementById(labelId);
              if (el) el.textContent = onInput(v, true);
            } else {
              onInput(v, true);
            }
          },
          onchange: e => {
            onInput(Number(e.target.value), false);
            if (onRelease) onRelease();
          }}),
        h('div',{id:labelId||null,style:{textAlign:'center',padding:'6px 0 2px',fontSize:'13px',fontFamily:"'Libre Baskerville',serif",fontStyle:'italic',color:'var(--text)',lineHeight:'1.4',minHeight:'36px'}}, valueEl)
      )
    );

  return overlay(h('div',{},
    h('div',{class:'sheet-title',style:{marginBottom:'6px'}},(isEdit?'Edit: ':'')+'🌡️ Daily Check In'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'14px',lineHeight:'1.5'}},
      'How were these overall today? Capture the day as a whole, not just this moment.'),

    sliderRow('Overall mood today', f.mood, mp,
      MOOD_EMOJIS[f.mood-1]+' '+MOOD_LABELS[f.mood-1],
      1, 5, (v, labelOnly) => {
        f.mood = v;
        return MOOD_EMOJIS[v-1]+' '+MOOD_LABELS[v-1];
      }, 'slider-label-mood', saveMedBackground),

    sliderRow('Overall energy today', f.energy, ep,
      ENERGY_EMOJIS[f.energy-1]+' '+ENERGY_LABELS[f.energy-1],
      1, 5, (v, labelOnly) => {
        f.energy = v;
        return ENERGY_EMOJIS[v-1]+' '+ENERGY_LABELS[v-1];
      }, 'slider-label-energy', saveMedBackground),

    S.showPhysical ? sliderRow('Overall desire today', f.libiLevel, lp,
      '"'+lvl.label+'" — '+lvl.desc,
      1, 5, (v, labelOnly) => {
        f.libiLevel = v;
        const l = LIBIDO_LEVELS[v-1];
        return '"'+l.label+'" — '+l.desc;
      }, 'slider-label-desire', saveMedBackground) : null,

    h('div',{style:{marginBottom:'16px'}},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'Optional…',rows:'2',
        oninput:e=>{f.notes=e.target.value;},
        onblur:()=>{ if(f._editId || f.mood || f.energy) saveMedBackground(); }
      },f.notes||'')
    ),
    deleteEntryRow(isEdit, S.form._editId),
    h('button',{class:'submit-btn',style:{width:'100%'},onclick:saveMed},'Done'),
  ));
}
function saveMed(){
  const f=S.form;
  const rec = {date:S.selectedDate,category:'libido',libiLevel:f.libiLevel,mood:f.mood,energy:f.energy,notes:f.notes||''};
  if (f._editId) rec.id = f._editId;
  closeModalSilent();
  dbPut('entries', rec).then(loadDay).then(loadAll).then(render).catch(e=>{console.error('Save failed:',e);alert('Save failed — '+e.message);});
}
function saveMedBackground(){
  // Auto-save on slider release — stays open, updates editId so next save updates same record
  const f=S.form;
  const rec = {date:S.selectedDate,category:'libido',libiLevel:f.libiLevel,mood:f.mood,energy:f.energy,notes:f.notes||''};
  if (f._editId) rec.id = f._editId;
  dbPut('entries', rec).then(result=>{
    // Store the new/existing id so next auto-save updates same record
    if (!f._editId && result) f._editId = result;
    return loadDay();
  }).then(loadAll).catch(e=>console.error('Auto-save failed:',e));
}
