'use strict';

/* ── Conflict form ───────────────────────────────────── */
function buildConflictForm() {
  const f=S.form;
  const isEdit = !!f._editId;
  // Initialise expanded state once per form open
  if (f.horsemenExpanded === undefined)
    f.horsemenExpanded = S.horsemenExpanded || (Array.isArray(f.horsemen) && f.horsemen.length > 0);
  const ok = !!f.intensity && !!f.conduct && !!f.resolution && !!f.harm;

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'⛈️ Conflict'),

    // ── Harm ───────────────────────────────────────────
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Overall harm',
        h('span',{style:{color:'var(--muted)',fontWeight:'400',marginLeft:'6px',fontSize:'10px'}},'damage to emotional connection')
      ),
      h('div',{class:'btn-grid-5'},
        ...CONFLICT_HARM.map(h2=>h('button',{
          class:'sel-btn flex1'+(f.harm===h2.val?' sel-conflict':''),
          onclick:()=>{f.harm=h2.val;render();}
        }, h2.label, h('span',{class:'sub'},resolveSub(h2.sub))))
      )
    ),

    // ── Intensity ──────────────────────────────────────
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Intensity'),
      h('div',{class:'btn-grid-5'},
        ...CONFLICT_LEVELS.map(l=>h('button',{
          class:'sel-btn flex1'+(f.intensity===l.val?' sel-conflict':''),
          onclick:()=>{f.intensity=l.val;render();}
        }, l.label, h('span',{class:'sub'},resolveSub(l.sub))))
      )
    ),

    // ── Conduct ────────────────────────────────────────
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'How was it conducted?',
        h('span',{style:{color:'var(--muted)',fontWeight:'400',marginLeft:'6px',fontSize:'10px'}},'worst point reached')
      ),
      h('div',{class:'btn-grid-5'},
        ...CONFLICT_CONDUCT.map(c=>h('button',{
          class:'sel-btn flex1'+(f.conduct===c.val?' sel-conflict':''),
          onclick:()=>{f.conduct=c.val;render();}
        }, c.label, h('span',{class:'sub'},resolveSub(c.sub))))
      )
    ),

    // ── What was present (optional, collapsible) ───────
    h('div',{class:'form-section'},
      h('button',{
        style:{
          display:'flex',alignItems:'center',gap:'8px',background:'none',border:'none',
          padding:'0',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",
          touchAction:'manipulation',width:'100%',textAlign:'left',
        },
        onclick:()=>{
          f.horsemenExpanded = !f.horsemenExpanded;
          S.horsemenExpanded = f.horsemenExpanded;
          saveSettings();
          render();
        }
      },
        h('span',{style:{
          fontSize:'9px',color:'var(--muted)',display:'inline-block',
          transition:'transform 0.15s',
          transform: f.horsemenExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}, '▶'),
        h('span',{style:{fontSize:'12px',fontWeight:'500',color:'var(--muted)',letterSpacing:'0.05em',textTransform:'uppercase'}},
          'What was present'),
        h('span',{style:{fontSize:'11px',color:'var(--muted-2)'}}, '(optional)')
      ),
      f.horsemenExpanded ? h('div',{style:{marginTop:'12px'}},
        h('div',{class:'chips',style:{marginBottom:'14px'}},
          ...CONFLICT_HORSEMEN.map(hm => {
            const sel = Array.isArray(f.horsemen) && f.horsemen.includes(hm.val);
            return h('div',{
              class:'chip'+(sel?' selected sel-conflict':''),
              onclick:()=>{
                if (!Array.isArray(f.horsemen)) f.horsemen=[];
                f.horsemen = sel ? f.horsemen.filter(v=>v!==hm.val) : [...f.horsemen, hm.val];
                render();
              }
            }, hm.label);
          })
        ),
        h('div',{style:{display:'flex',flexDirection:'column',gap:'6px'}},
          ...CONFLICT_HORSEMEN.map(hm =>
            h('div',{style:{fontSize:'12px',color:'var(--muted)',lineHeight:'1.5'}},
              h('span',{style:{fontWeight:'500',color:'var(--text)'}}, hm.label+': '),
              '"'+hm.desc+'"'
            )
          )
        )
      ) : null
    ),

    // ── Resolution ─────────────────────────────────────
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'How did it resolve?'),
      h('div',{class:'btn-grid-5'},
        ...CONFLICT_RESOLUTION.map(r=>h('button',{
          class:'sel-btn flex1'+(f.resolution===r.val?' sel-conflict':''),
          onclick:()=>{f.resolution=r.val;render();}
        }, r.label, h('span',{class:'sub'},resolveSub(r.sub))))
      )
    ),

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'What happened, what was said…',rows:'3',
        oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),

    // ── Attachment tags (optional) ────────────────────
    buildAttachmentTagSection({
      f, fieldKey:'attachmentTags', tags: CONFLICT_ATTACHMENT_TAGS,
      headline:'How did you show up?',
      hint:'Cues describing your behaviour during this conflict. Pick any that fit, or none.',
    }),

    // ── Inline repair section (only when resolution implies repair work happened) ──
    // Triggers on Repaired/Resolved/Partial. On save, this generates a SEPARATE
    // (currently unlinked) repair entry alongside the conflict, so the repair
    // work is visible in the Attachment tab without needing a second log step.
    // Hidden on edit — the section creates a paired entry only on first save,
    // and showing the empty fields on edit would be misleading.
    (S.showRepair && !isEdit && (f.resolution === 'breakthrough' || f.resolution === 'resolved' || f.resolution === 'partial'))
      ? h('div',{style:{
          padding:'14px 16px',marginBottom:'14px',marginTop:'4px',
          borderRadius:'12px',background:'var(--c-partner-tint)',
          border:'1px solid var(--c-partner)',
        }},
          h('div',{style:{
            fontSize:'10px',letterSpacing:'0.08em',textTransform:'uppercase',
            color:'var(--c-partner)',fontWeight:'600',marginBottom:'4px',
          }}, '🤝 Repair details'),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'14px',lineHeight:'1.5'}},
            'Optional — fill in any of the fields below if you want a separate repair entry created on save. Skip the section entirely if no repair detail needs tracking beyond the resolution itself.'),

          // Who reached first
          h('div',{class:'form-section'},
            h('label',{class:'form-label'},'Who reached first?'),
            h('div',{class:'btn-grid-3'},
              ...REPAIR_INITIATED_BY.map(o => h('button',{
                class:'sel-btn'+(f.cnRepairInitiatedBy===o.val?' sel-partner':''),
                onclick:()=>{f.cnRepairInitiatedBy=o.val;render();}
              }, o.label, h('span',{class:'sub'},resolveSub(o.sub))))
            )
          ),

          // Form of repair (multi-select)
          h('div',{class:'form-section'},
            h('label',{class:'form-label'},'Form of repair',
              h('span',{style:{color:'var(--muted)',fontWeight:'400',marginLeft:'6px',fontSize:'10px'}},'multi-select')
            ),
            buildMultiSelectChips({
              f, fieldKey:'cnRepairForm', options: REPAIR_FORM,
              accentColor:'var(--c-partner)', descKey:'repairFormInline',
            })
          ),

          // Attachment tags during repair
          buildAttachmentTagSection({
            f, fieldKey:'cnRepairAttachmentTags', tags: REPAIR_ATTACHMENT_TAGS,
            headline:'What was happening in you during the repair?',
            hint:'Internal state during the repair work — separate from the conflict itself. Pick any that fit, or none.',
          })
        )
      : null,

    // ── Save / debug ────────────────────────────────────
    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),h('button',{class:'submit-btn'+(ok?'':' disabled'),onclick:ok?saveConflict:null},isEdit?'Save Changes':'Save Entry')),
    S.showDebug ? (() => {
      if (!f.harm) return buildDebugPlaceholder('select overall harm to see calculation');

      const breakdown = [];
      const push = (label, value, note) => breakdown.push({label, value, note});
      const cap = bankDayCap(S.dayEntries.find(e=>e.category==='libido'));

      const harmLabel = CONFLICT_HARM.find(h2=>h2.val===f.harm)?.label || '';
      push('W  Harm', f.harm, `"${harmLabel}" — damage to emotional connection, 1-5`);

      if (f.intensity) {
        const intM     = CONF_INTENSITY_M[f.intensity] || 0.20;
        const intLabel = CONFLICT_LEVELS.find(l=>l.val===f.intensity)?.label || '';
        push('S  Intensity', intM, `"${intLabel}" — Hard conversation ×0.20 to Crisis-level ×1.00`);

        if (f.conduct) {
          const condM     = CONF_CONDUCT_M[f.conduct] || 1.00;
          const condLabel = CONFLICT_CONDUCT.find(c=>c.val===f.conduct)?.label || '';
          push('K  Conduct modifier', condM, `"${condLabel}" — Calm ×0.20 to Shutdown ×1.00`);

          if (f.resolution) {
            const resM     = S.weights.confR[f.resolution] || 1.0;
            const resLabel = CONFLICT_RESOLUTION.find(r=>r.val===f.resolution)?.label || '';
            push('R  Resolution modifier', resM, `"${resLabel}" — Turned around ×0.20 to Worsened ×1.00`);
            push('C  Day capacity (inverse)', +(1/cap).toFixed(3), 'Inverse cap for negative events — bad day = higher cost (0.77–1.32)');
            const geoMean = Math.pow(condM * resM, 1/2);
            const score   = -(f.harm * intM * geoMean * (1/cap) / 5) * 100;
            push('Final score', +score.toFixed(1), `-(W × S × geomean(K,R) × 1/C) / 5 × 100`);
            return buildDebugPanel(score, breakdown);
          }
        }
      }

      return buildDebugPanel(null, breakdown);
    })() : null
  ));
}
function saveConflict(){
  const f=S.form;
  const horsemen = Array.isArray(f.horsemen) && f.horsemen.length > 0 ? f.horsemen.slice() : [];
  // If opened but nothing selected, revert to closed default
  if (horsemen.length === 0 && S.horsemenExpanded) {
    S.horsemenExpanded = false;
    saveSettings();
  }
  const rec = {
    date:S.selectedDate, category:'conflict',
    harm:       f.harm || null,
    intensity:  f.intensity,
    conduct:    f.conduct || null,
    resolution: f.resolution || null,
    horsemen,
    attachmentTags: Array.isArray(f.attachmentTags) ? f.attachmentTags.slice() : [],
    notes:      f.notes||''
  };
  if (f._editId) rec.id = f._editId;

  // If the conflict resolved with repair work AND the user entered repair
  // data inline, create a SEPARATE repair entry on the same date.
  // Currently unlinked — appears as a standalone repair entry. Reception
  // and Aftermath are derived from the conflict's resolution since the
  // user already expressed that on the conflict form.
  // Skipped on edit to avoid duplicate repair creation each time the
  // conflict is re-saved.
  const isFirstSave = !f._editId;
  const resolvedWithRepair = ['breakthrough','resolved','partial'].includes(f.resolution);
  const hasRepairData = !!f.cnRepairInitiatedBy
    || (Array.isArray(f.cnRepairForm) && f.cnRepairForm.length > 0)
    || (Array.isArray(f.cnRepairAttachmentTags) && f.cnRepairAttachmentTags.length > 0);

  let repairRec = null;
  if (isFirstSave && resolvedWithRepair && hasRepairData) {
    // Derive Reception and Aftermath from the conflict's resolution
    const reception =
      f.resolution === 'breakthrough' ? 'accepted' :
      f.resolution === 'resolved'     ? 'accepted' :
      f.resolution === 'partial'      ? 'halfway'  : 'accepted';
    const aftermath =
      f.resolution === 'breakthrough' ? 'closer'   :
      f.resolution === 'resolved'     ? 'baseline' :
      f.resolution === 'partial'      ? 'residue'  : 'baseline';
    repairRec = {
      date: S.selectedDate, category: 'repair',
      repairInitiatedBy: f.cnRepairInitiatedBy || null,
      repairForm:        Array.isArray(f.cnRepairForm) ? f.cnRepairForm.slice() : (f.cnRepairForm ? [f.cnRepairForm] : []),
      repairReception:   reception,
      repairAftermath:   aftermath,
      attachmentTags:    Array.isArray(f.cnRepairAttachmentTags) ? f.cnRepairAttachmentTags.slice() : [],
      notes: '',
    };
  }

  closeModalSilent();
  // Save conflict first, then optionally save paired repair entry
  dbPut('entries', rec)
    .then(() => repairRec ? dbPut('entries', repairRec) : null)
    .then(loadDay).then(loadAll).then(render)
    .catch(e=>{console.error('Save failed:',e);alert('Save failed — '+e.message);});
}
