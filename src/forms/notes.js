'use strict';

/* ── Notes form ─────────────────────────────────────── */
function buildNotesForm() {
  const f=S.form;
  const isEdit = !!f._editId;
  const ok = !!f.stressorTitle;

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'🌿 Notes'),

    // Title
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Title'),
      h('input',{type:'text',class:'form-input',
        placeholder:'e.g. Mom\'s birthday, work milestone, something notable…',
        value:f.stressorTitle||'',
        oninput:e=>{
          f.stressorTitle=e.target.value;
          // Update save button state without full render to avoid losing focus
          const btn = document.getElementById('notes-save-btn');
          if (btn) {
            const isOk = !!e.target.value.trim();
            btn.className = 'submit-btn' + (isOk ? '' : ' disabled');
            btn.onclick = isOk ? saveNotes : null;
          }
        }})
    ),

    // Notes
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Details'),
      h('textarea',{class:'form-input',
        placeholder:'Any details worth recording…',
        rows:'4',oninput:e=>{f.observed=e.target.value;}},f.observed||'')
    ),

    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},
      h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),
      h('button',{id:'notes-save-btn',class:'submit-btn'+(ok?'':' disabled'),onclick:ok?saveNotes:null},
        isEdit?'Save Changes':'Save Entry'))
  ));
}
function saveNotes(){
  const f=S.form;
  const rec = {
    date:S.selectedDate,
    category:'notes',
    stressorTitle:f.stressorTitle||'',
    observed:f.observed||'',
  };
  if (f._editId) rec.id = f._editId;
  closeModalSilent();
  dbPut('entries', rec).then(loadDay).then(loadAll).then(render).catch(e=>{console.error('Save failed:',e);alert('Save failed — '+e.message);});
}
