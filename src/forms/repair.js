'use strict';

/* ── Repair form ────────────────────────────────────── */
function buildRepairForm() {
  const f = S.form;
  const isEdit = !!f._editId;
  // Migrate legacy single-value repairForm to array for multi-select
  if (typeof f.repairForm === 'string') f.repairForm = [f.repairForm];
  if (!Array.isArray(f.repairForm)) f.repairForm = [];
  const ok = !!f.repairInitiatedBy && f.repairForm.length > 0 && !!f.repairReception && !!f.repairAftermath;

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'🤝 Repair'),
    h('div',{style:{
      fontSize:'12px',color:'var(--muted)',marginBottom:'18px',lineHeight:'1.6',
      padding:'10px 12px',background:'var(--surface-1)',borderRadius:'10px',border:'1px solid var(--border)',
    }},
      'Reconnection work that happened separately from the rupture itself. If repair happened during a conflict and you marked it Repaired/Resolved/Partial, you don\'t need to log this — it\'s already captured. Use this for repairs that came later, addressed multiple things at once, or happened outside any specific conflict.'
    ),

    // ── Who initiated ──
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Who reached first?'),
      h('div',{class:'btn-grid-3'},
        ...REPAIR_INITIATED_BY.map(o => h('button',{
          class:'sel-btn'+(f.repairInitiatedBy===o.val?' sel-partner':''),
          onclick:()=>{f.repairInitiatedBy=o.val;render();}
        }, o.label, h('span',{class:'sub'},resolveSub(o.sub))))
      )
    ),

    // ── Form of repair (multi-select) ──
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Form of repair',
        h('span',{style:{color:'var(--muted)',fontWeight:'400',marginLeft:'6px',fontSize:'10px'}},'multi-select')
      ),
      buildMultiSelectChips({
        f, fieldKey:'repairForm', options: REPAIR_FORM,
        accentColor:'var(--c-partner)', descKey:'repairFormStandalone',
      })
    ),

    // ── Reception ──
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Reception',
        h('span',{style:{color:'var(--muted)',fontWeight:'400',marginLeft:'6px',fontSize:'10px'}},'how it was met')
      ),
      h('div',{class:'btn-grid-5'},
        ...REPAIR_RECEPTION.map(o => h('button',{
          class:'sel-btn flex1'+(f.repairReception===o.val?' sel-partner':''),
          onclick:()=>{f.repairReception=o.val;render();}
        }, o.label, h('span',{class:'sub'},resolveSub(o.sub))))
      )
    ),

    // ── Aftermath ──
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Where it left things'),
      h('div',{class:'btn-grid-5'},
        ...REPAIR_AFTERMATH.map(o => h('button',{
          class:'sel-btn flex1'+(f.repairAftermath===o.val?' sel-partner':''),
          onclick:()=>{f.repairAftermath=o.val;render();}
        }, o.label, h('span',{class:'sub'},resolveSub(o.sub))))
      )
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'What happened, what was said…',rows:'3',
        oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),

    // ── Attachment tags (optional) ──
    buildAttachmentTagSection({
      f, fieldKey:'attachmentTags', tags: REPAIR_ATTACHMENT_TAGS,
      headline:'What was happening in you?',
      hint:'Internal state during the repair work — separate from how it went. Pick any that fit, or none.',
    }),

    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},
      h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),
      h('button',{class:'submit-btn'+(ok?'':' disabled'),onclick:ok?saveRepair:null},isEdit?'Save Changes':'Save Entry'))
  ));
}

function saveRepair() {
  const f = S.form;
  const rec = {
    date:               S.selectedDate,
    category:           'repair',
    repairInitiatedBy:  f.repairInitiatedBy || null,
    repairForm:         Array.isArray(f.repairForm) ? f.repairForm.slice() : (f.repairForm ? [f.repairForm] : []),
    repairReception:    f.repairReception   || null,
    repairAftermath:    f.repairAftermath   || null,
    attachmentTags:     Array.isArray(f.attachmentTags) ? f.attachmentTags.slice() : [],
    notes:              f.notes || '',
  };
  if (f._editId) rec.id = f._editId;
  closeModalSilent();
  dbPut('entries', rec).then(loadDay).then(loadAll).then(render).catch(e=>{console.error('Save failed:',e);alert('Save failed — '+e.message);});
}
