'use strict';

/* ── Turn Down form ─────────────────────────────────── */
function buildTurndownForm() {
  const f=S.form;
  const isEdit = !!f._editId;
  const herTurnedMeDown = f.initiatedBy === 'her';
  const iTurnedHerDown  = f.initiatedBy === 'me';
  const tdNeeds = Array.isArray(f.tdInitiationNeeds) ? f.tdInitiationNeeds : [];

  const ok = (herTurnedMeDown || iTurnedHerDown) && !!f.turndownType &&
    (herTurnedMeDown ? (!!f.tdSignificance && !!f.tdImpact) : !!f.tdMyReason);

  return overlay(h('div',{},
    h('div',{class:'sheet-title'},(isEdit?'Edit: ':'')+'❄️ Turn Down'),

    // Who
    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Who turned down whom?'),
      h('div',{class:'btn-grid-2'},
        h('button',{class:'sel-btn'+(iTurnedHerDown?' sel-turndown':''),
          onclick:()=>{f.initiatedBy='me';f.tdInitiationNeeds=[];f.attachmentTags=[];render();}},
          `I turned ${P.obj} down`,h('span',{class:'sub'},`I declined ${P.obj}`)),
        h('button',{class:'sel-btn'+(herTurnedMeDown?' sel-turndown':''),
          onclick:()=>{f.initiatedBy='her';f.tdMyReason=null;f.attachmentTags=[];render();}},
          `${P.Sub} turned down`,h('span',{class:'sub'},`${P.Sub} declined me`))
      )
    ),

    // ── She turned me down ──────────────────────────────
    herTurnedMeDown ? h('div',{},
      h('div',{class:'form-section'},
        h('label',{class:'form-label'},'How much did this affect your sense of being desired?'),
        h('div',{class:'btn-grid-5'},
          ...TURNDOWN_IMPACT.map(i=>h('button',{
            class:'sel-btn'+(f.tdImpact===i.val?' sel-turndown':''),
            onclick:()=>{f.tdImpact=i.val;render();}
          }, i.label, h('span',{class:'sub'},resolveSub(i.sub))))
        )
      ),
      h('div',{class:'form-section'},
        h('label',{class:'form-label'},'How much did this matter'),
        h('div',{class:'btn-grid-5'},
          ...TURNDOWN_SIGNIFICANCE.map(s=>h('button',{
            class:'sel-btn'+(f.tdSignificance===s.val?' sel-turndown':''),
            onclick:()=>{f.tdSignificance=s.val;render();}
          }, s.label, h('span',{class:'sub'},resolveSub(s.sub))))
        )
      ),
      h('div',{class:'form-section'},
        h('label',{class:'form-label'},'How it happened'),
        h('div',{class:'btn-grid-5'},
          ...TURNDOWN_TYPES.map(t=>h('button',{
            class:'sel-btn'+(f.turndownType===t.val?' sel-turndown':''),
            onclick:()=>{f.turndownType=t.val;render();}
          }, t.label, h('span',{class:'sub'},resolveSub(t.sub))))
        )
      )
    ) : null,

    // ── I turned her down ───────────────────────────────
    iTurnedHerDown ? h('div',{},
      h('div',{class:'form-section'},
        h('label',{class:'form-label'},`Why I turned ${P.obj} down`),
        h('div',{class:'btn-grid-5'},
          ...TD_MY_REASONS.map(r=>h('button',{
            class:'sel-btn'+(f.tdMyReason===r.val?' sel-turndown':''),
            onclick:()=>{f.tdMyReason=r.val;render();}
          }, r.label, h('span',{class:'sub'},resolveSub(r.sub))))
        )
      ),
      h('div',{class:'form-section'},
        h('label',{class:'form-label'},`How I turned ${P.obj} down`),
        h('div',{class:'btn-grid-5'},
          ...TD_MY_HOW.map(t=>h('button',{
            class:'sel-btn'+(f.turndownType===t.val?' sel-turndown':''),
            onclick:()=>{f.turndownType=t.val;render();}
          }, t.label, h('span',{class:'sub'},resolveSub(t.sub))))
        )
      )
    ) : null,

    h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Notes'),
      h('textarea',{class:'form-input',placeholder:'Context, what was happening…',rows:'3',
        oninput:e=>{f.notes=e.target.value;}},f.notes||'')
    ),

    // ── Attachment tags (optional) — direction-aware ──
    iTurnedHerDown
      ? buildAttachmentTagSection({
          f, fieldKey:'attachmentTags', tags: TURNDOWN_MY_TAGS,
          headline:'How did saying no land afterward?',
          hint:'What happened in you in the hours or days after declining. Pick any that fit, or none.',
        })
      : herTurnedMeDown
        ? buildAttachmentTagSection({
            f, fieldKey:'attachmentTags', tags: TURNDOWN_PARTNER_TAGS,
            headline:'How did it land afterward?',
            hint:'How the turn-down sat with you in the hours or days that followed. Pick any that fit, or none.',
          })
        : null,

    // ── Inline repair section (only for partner-initiated turn-downs, on first save) ──
    // Asks whether repair happened afterward; if so, captures the same fields
    // as the inline-on-conflict repair flow. Generates a SEPARATE (currently
    // unlinked) repair entry on save.
    (!isEdit && herTurnedMeDown) ? h('div',{class:'form-section'},
      h('label',{class:'form-label'},'Was there repair afterward?',
        h('span',{style:{color:'var(--muted)',fontWeight:'400',marginLeft:'6px',fontSize:'10px'}},'optional')
      ),
      h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'10px',lineHeight:'1.5'}},
        'If your partner reached back later — softening, acknowledging, or initiating reconnection — log the repair detail here. If repair happened later, you can also add it as a standalone entry on its day.'),
      h('div',{class:'btn-grid-2'},
        h('button',{
          class:'sel-btn'+(f.tdHadRepair==='yes'?' sel-partner':''),
          onclick:()=>{f.tdHadRepair='yes';render();}
        }, 'Yes', h('span',{class:'sub'},'Capture the detail')),
        h('button',{
          class:'sel-btn'+(f.tdHadRepair==='skip'?' sel-partner':''),
          onclick:()=>{f.tdHadRepair='skip';render();}
        }, 'Skip', h('span',{class:'sub'},'No repair, or log later'))
      )
    ) : null,

    // Inline repair fields (only if the user said Yes to repair afterward)
    (!isEdit && herTurnedMeDown && f.tdHadRepair === 'yes') ? h('div',{style:{
      padding:'14px 16px',marginBottom:'14px',marginTop:'4px',
      borderRadius:'12px',background:'var(--c-partner-tint)',
      border:'1px solid var(--c-partner)',
    }},
      h('div',{style:{
        fontSize:'10px',letterSpacing:'0.08em',textTransform:'uppercase',
        color:'var(--c-partner)',fontWeight:'600',marginBottom:'4px',
      }}, '🤝 Repair details'),
      h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'14px',lineHeight:'1.5'}},
        'Optional — fill in any of the fields below if you want a separate repair entry created on save. Skip the section if no detail needs tracking.'),

      // Who reached first
      h('div',{class:'form-section'},
        h('label',{class:'form-label'},'Who reached first?'),
        h('div',{class:'btn-grid-3'},
          ...REPAIR_INITIATED_BY.map(o => h('button',{
            class:'sel-btn'+(f.tdRepairInitiatedBy===o.val?' sel-partner':''),
            onclick:()=>{f.tdRepairInitiatedBy=o.val;render();}
          }, o.label, h('span',{class:'sub'},resolveSub(o.sub))))
        )
      ),

      // Form of repair (multi-select)
      h('div',{class:'form-section'},
        h('label',{class:'form-label'},'Form of repair',
          h('span',{style:{color:'var(--muted)',fontWeight:'400',marginLeft:'6px',fontSize:'10px'}},'multi-select')
        ),
        buildMultiSelectChips({
          f, fieldKey:'tdRepairForm', options: REPAIR_FORM,
          accentColor:'var(--c-partner)', descKey:'repairFormTurndown',
        })
      ),

      // Attachment tags during repair
      buildAttachmentTagSection({
        f, fieldKey:'tdRepairAttachmentTags', tags: REPAIR_ATTACHMENT_TAGS,
        headline:'What was happening in you during the repair?',
        hint:'Internal state during the repair work — separate from the turn-down itself. Pick any that fit, or none.',
      })
    ) : null,

    deleteEntryRow(isEdit, S.form._editId),
    h('div',{style:{display:'flex',gap:'8px'}},
      h('button',{class:'sec-btn',onclick:()=>closeModal()},'Cancel'),
      h('button',{class:'submit-btn'+(ok?'':' disabled'),
        onclick:ok?saveTurndown:null},isEdit?'Save Changes':'Save Entry')),

    // ── Debug panel — only meaningful for partner-initiated turndowns ──
    S.showDebug && herTurnedMeDown ? (() => {
      if (!f.tdImpact) return buildDebugPlaceholder('select impact to see calculation');
      const breakdown = [];
      const push = (label, value, note) => breakdown.push({label, value, note});
      const cap = bankDayCap(S.dayEntries.find(e=>e.category==='libido'));

      const impactLabel = TURNDOWN_IMPACT.find(i=>i.val===f.tdImpact)?.label||'';
      push('W  Impact', f.tdImpact, `"${impactLabel}" — effect on sense of being desired, 1-5`);

      if (f.tdSignificance) {
        const sigM     = TD_SIG_M[f.tdSignificance] || 0.60;
        const sigLabel = TURNDOWN_SIGNIFICANCE.find(s=>s.val===f.tdSignificance)?.label||'';
        push('S  Significance', sigM, `"${sigLabel}" — Passing thought ×0.20 to Deep longing ×1.00`);

        if (f.turndownType) {
          const howM     = TD_HOW_M[f.turndownType] || 0.60;
          const howLabel = TURNDOWN_TYPES.find(t=>t.val===f.turndownType)?.label||'';
          push('R  How it happened', howM, `"${howLabel}" — Interrupted ×0.20 to Dismissive ×1.00`);
          push('C  Day capacity (inverse)', +(1/cap).toFixed(3), 'Inverse cap for negative events — bad day = higher cost (0.77–1.32)');
          const finalScore = -(f.tdImpact * sigM * howM * (1/cap) / 5) * 100;
          push('Final score', +finalScore.toFixed(1), `-(W × S × R × 1/C) / 5 × 100`);
          return buildDebugPanel(finalScore, breakdown);
        }
      }

      return buildDebugPanel(null, breakdown);
    })() : null
  ));
}
function saveTurndown(){
  const f=S.form;
  const tdNeeds = Array.isArray(f.tdInitiationNeeds) ? f.tdInitiationNeeds : [];
  const rec = {
    date:S.selectedDate, category:'turndown',
    turndownType:f.turndownType, initiatedBy:f.initiatedBy,
    tdImpact:         f.initiatedBy==='her' ? (f.tdImpact||null) : null,
    tdSignificance:   f.initiatedBy==='her' ? (f.tdSignificance||3) : null,
    tdInitiationNeeds:f.initiatedBy==='her' ? tdNeeds : null,
    tdMyReason:       f.initiatedBy==='me'  ? (f.tdMyReason||null) : null,
    attachmentTags:   Array.isArray(f.attachmentTags) ? f.attachmentTags.slice() : [],
    notes:f.notes||''
  };
  if (f._editId) rec.id = f._editId;

  // If partner-initiated, the user said Yes to repair, AND any inline repair
  // data was entered, create a SEPARATE repair entry on the same date.
  // Reception/Aftermath default to gentle middle values since turn-downs
  // don't have a Resolution field that signals these directly. The user
  // can edit the repair entry later to refine them.
  // Skipped on edit to avoid duplicate repair creation.
  const isFirstSave = !f._editId;
  const wantsRepair = f.initiatedBy === 'her' && f.tdHadRepair === 'yes';
  const hasRepairData = !!f.tdRepairInitiatedBy
    || (Array.isArray(f.tdRepairForm) && f.tdRepairForm.length > 0)
    || (Array.isArray(f.tdRepairAttachmentTags) && f.tdRepairAttachmentTags.length > 0);

  let repairRec = null;
  if (isFirstSave && wantsRepair && hasRepairData) {
    repairRec = {
      date: S.selectedDate, category: 'repair',
      repairInitiatedBy: f.tdRepairInitiatedBy || null,
      repairForm:        Array.isArray(f.tdRepairForm) ? f.tdRepairForm.slice() : [],
      repairReception:   'accepted',  // sensible default — user can edit later
      repairAftermath:   'baseline',  // sensible default — user can edit later
      attachmentTags:    Array.isArray(f.tdRepairAttachmentTags) ? f.tdRepairAttachmentTags.slice() : [],
      notes: '',
    };
  }

  closeModalSilent();
  dbPut('entries', rec)
    .then(() => repairRec ? dbPut('entries', repairRec) : null)
    .then(loadDay).then(loadAll).then(render)
    .catch(e=>{console.error('Save failed:',e);alert('Save failed — '+e.message);});
}
