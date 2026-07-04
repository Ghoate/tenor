'use strict';

/* Manage steadying types */
function buildManageCaretakerTypes(inline=false, formObj=null) {
  const f = formObj || S.form;
  if(f.ctNewType==null)    f.ctNewType='';
  if(f.ctAddingNew==null)  f.ctAddingNew=false;
  if(f.ctEditName==null)   f.ctEditName=null;
  if(f.ctEditInit==null)   f.ctEditInit=null;
  if(f.ctDescription==null) f.ctDescription='';
  if(f.ctPhysical==null)       f.ctPhysical=1;
  if(f.ctEmotional==null)      f.ctEmotional=1;
  if(f.ctCognitive==null)      f.ctCognitive=1;
  if(f.ctTime==null)           f.ctTime=1;
  if(f.ctPredictability==null) f.ctPredictability=1;
  if(!f.ctNeedsMap) f.ctNeedsMap=Object.fromEntries(EMOTIONAL_NEEDS.map(n=>[n.val,1]));

  const list = S.caretakerTypes;

  const items = list.slice().sort((a,b)=>a.name.localeCompare(b.name)).flatMap(t=>{
    const isThisRowEditing = f.ctEditName === t.name;
    const row = h('div',{
      class:'manage-item',
      style:{cursor: isThisRowEditing ? 'pointer' : (f.ctDirty ? 'default' : 'pointer'), opacity: (!isThisRowEditing && f.ctDirty) || t.hidden ? '0.4' : '1'},
      onclick:(ev)=>{ if(ev.target.closest('button')) return; if(isThisRowEditing){ if(!f.ctDirty){f.ctEditName=null;f.ctEditInit=null;render();} }else{ if(f.ctDirty) return; f.ctEditName=t.name;f.ctEditInit=null;f.ctDirty=false;render();} }
    },
      h('div',{style:{flex:'1',minWidth:'0'}},
        h('span',{style:{fontSize:'14px',textDecoration:t.hidden?'line-through':'none'}},t.name),
        h('span',{style:{fontSize:'11px',color:'var(--muted)',marginLeft:'8px'},
          title:'Weight (0-100) · times logged in last 60 days'},
          'w:'+Math.round(deriveCaretakerWeight(t)/5*100)+' · '+usageCount60d(t.name,'burnout')+'×'),
        t.description ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, t.description) : null
      ),
      h('div',{style:{display:'flex',alignItems:'center',gap:'6px',flexShrink:'0'}},
        h('button',{
          style:{fontSize:'11px',padding:'3px 8px',borderRadius:'6px',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",
            border:'1px solid var(--border)', background:'var(--bg3)',
            color: t.hidden ? 'var(--c-partner)' : 'var(--muted)'},
          onclick:ev=>{ev.stopPropagation(); t.hidden=!t.hidden; saveSettings(); render();}
        }, t.hidden ? 'Show' : 'Hide'),
        isThisRowEditing
          ? h('span',{style:{fontSize:'11px',color:'var(--c-burnout)'}},'editing…')
          : h('span',{style:{fontSize:'11px',color:'var(--muted)'}},'tap to edit')
      )
    );
    // Inline mode: form opens in popup overlay below — don't double-render here.
    return (isThisRowEditing && !inline) ? [row, steadyingForm()] : [row];
  });

  function steadyingForm() {
    const isEditing = !!f.ctEditName;
    const isAdding  = !!f.ctAddingNew;
    const editTarget = isEditing ? list.find(t=>t.name===f.ctEditName) : null;
    const markDirty = () => { if(isEditing) f.ctDirty = true; };

    if (!isEditing && !isAdding) {
      return h('button',{
        style:{width:'100%',marginTop:'10px',padding:'12px',borderRadius:'14px',
          border:'1px solid var(--c-burnout)',background:'rgba(212,160,48,0.08)',
          color:'var(--c-burnout)',fontSize:'13px',cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif",fontWeight:'500'},
        onclick:()=>{
          f.ctAddingNew=true; f.ctNewType=''; f.ctDescription='';
          f.ctPhysical=1;f.ctEmotional=1;f.ctCognitive=1;f.ctTime=1;f.ctPredictability=1;
          f.ctNeedsMap=Object.fromEntries(EMOTIONAL_NEEDS.map(n=>[n.val,1]));
          render();
        }
      },'+ Add new steadying profile');
    }

    if (isEditing && f.ctEditInit !== f.ctEditName) {
      const t = editTarget;
      f.ctEditInit       = f.ctEditName;
      f.ctDirty          = false;
      f.ctNewType        = t.name;
      f.ctDescription    = t.description || '';
      f.ctPhysical       = t.ctPhysical       || 1;
      f.ctEmotional      = t.ctEmotional      || 1;
      f.ctCognitive      = t.ctCognitive      || 1;
      f.ctTime           = t.ctTime           || 1;
      f.ctPredictability = t.ctPredictability || 1;
      f.ctNeedsMap       = Object.fromEntries(EMOTIONAL_NEEDS.map(n=>[n.val,(t.needsMap||{})[n.val]||1]));
    }

    const ctQ = (key) => {
      const cur    = f[key] || 1;
      const labels = CARETAKER_SCALES[key];
      const label  = CARETAKER_LABELS[key];
      const hint   = CARETAKER_HINTS[key];
      return h('div',{style:{marginBottom:'14px'}},
        h('div',{style:{marginBottom:'5px'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline'}},
            h('span',{style:{fontSize:'12px',color:'var(--text)',fontWeight:'500'}}, label),
            h('span',{style:{fontSize:'11px',color:'var(--c-burnout)'}}, labels[cur-1])
          ),
          hint ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',lineHeight:'1.4'}}, hint) : null
        ),
        h('div',{style:{display:'flex',gap:'4px'}},
          ...[1,2,3,4,5].map(v=>h('button',{
            style:{flex:'1',padding:'7px 2px',borderRadius:'8px',fontSize:'11px',
              border:'1px solid '+(cur===v?'rgba(212,160,48,0.6)':'var(--border)'),
              background:cur===v?'rgba(212,160,48,0.12)':'var(--bg3)',
              color:cur===v?'var(--c-burnout)':'var(--muted)',cursor:'pointer'},
            onclick:()=>{f[key]=v;markDirty();render();}
          }, labels[v-1]))
        )
      );
    };

    return h('div',{style:{marginTop:'12px',borderTop:'1px solid var(--border)',paddingTop:'12px'}},

      // Heading
      h('div',{style:{fontSize:'15px',fontWeight:'600',color:'var(--text)',marginBottom:'14px',fontFamily:"'Libre Baskerville',serif"}},
        isEditing ? (editTarget?.name||'') : 'New steadying profile'
      ),

      // Name
      h('div',{style:{marginBottom:'12px'}},
        h('label',{class:'form-label'},'Name'),
        h('input',{id:'ct-name-input',type:'text',class:'form-input',
          placeholder:'e.g. Co-regulating, Grounding…',value:f.ctNewType||'',
          oninput:e=>{f.ctNewType=e.target.value; markDirty();}})
      ),

      // Description
      h('div',{style:{marginBottom:'12px'}},
        h('label',{class:'form-label'},'Description'),
        h('textarea',{class:'form-input',rows:'2',
          placeholder:'Optional — a short note about what this type of steadying involves…',
          oninput:e=>{f.ctDescription=e.target.value; markDirty();}
        }, f.ctDescription||'')
      ),

      // Cost profile
      h('div',{style:{marginBottom:'12px',paddingTop:'16px',borderTop:'1px solid var(--border)',marginTop:'20px'}},
        h('div',{style:{fontSize:'14px',color:'var(--text)',fontWeight:'600',marginBottom:'3px',fontFamily:"'Libre Baskerville',serif"}},'Cost Profile'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',lineHeight:'1.5'}},
          'What this type of steadying typically costs you.')
      ),
      ctQ('ctPhysical'),
      ctQ('ctEmotional'),
      ctQ('ctCognitive'),
      ctQ('ctTime'),
      ctQ('ctPredictability'),

      // ── Scoring preview panel ───────────────────────────
      // Steadying scores as personal load (subtracts from personal balance)
      buildScoringPreviewPanel({
        currentType: {
          name: f.ctNewType || '(this type)',
          ctPhysical: f.ctPhysical||1, ctEmotional: f.ctEmotional||1,
          ctCognitive: f.ctCognitive||1, ctTime: f.ctTime||1,
          ctPredictability: f.ctPredictability||1,
          // ctNeedsMap exists but isn't used in deriveCaretakerWeight; included for compat
          needsMap: f.ctNeedsMap || {},
        },
        typeList: S.caretakerTypes,
        weightFn: deriveCaretakerWeight,
        // Steadying: intensity (0.20-1.00) × geomean(time,drain,outcome) (0.20-1.00)
        // Min product = 0.20 × 0.20 = 0.04; Max = 1.00 × 1.00 = 1.00
        minMult: 0.04, maxMult: 1.00,
        negative: true,
        accentColor: 'var(--c-burnout)',
        excludeName: isEditing ? f.ctEditName : null,
      }),

      // Delete
      isEditing ? h('div',{style:{textAlign:'left',marginBottom:'12px'}},
        h('button',{
          style:{background:'none',border:'none',color:'var(--c-conflict)',fontSize:'12px',
            cursor:'pointer',padding:'4px 8px',opacity:'0.6',fontFamily:"'DM Sans',sans-serif"},
          onclick:()=>{
            S.caretakerTypes=S.caretakerTypes.filter(x=>x.name!==f.ctEditName);
            saveSettings();
            f.ctEditName=null;f.ctEditInit=null;f.ctAddingNew=false;f.ctNewType='';f.ctDescription='';f.ctDirty=false;
            render();
          }
        },'Delete this type')
      ) : null,

      // Cancel / Save
      h('div',{style:{display:'flex',gap:'8px',marginTop:'8px'}},
        h('button',{
          style:{flex:'1',padding:'12px',borderRadius:'14px',border:'1px solid var(--border)',
            background:'var(--bg3)',color:'var(--muted)',fontSize:'13px',cursor:'pointer',
            fontFamily:"'DM Sans',sans-serif"},
          onclick:()=>{
            f.ctEditName=null;f.ctEditInit=null;f.ctAddingNew=false;f.ctDescription='';f.ctDirty=false;
            maybeReturnAfterAddSteadying(null);
            render();
          }
        },'Cancel'),
        h('button',{class:'submit-btn',style:{flex:'2'},
          onclick:()=>{
            const nameInput = document.getElementById('ct-name-input');
            const v = (nameInput?nameInput.value:f.ctNewType||'').trim();
            let newlyCreatedName = null;
            if (isAdding) {
              if(!v||list.find(t=>t.name===v)) return;
              const newType = {
                name:v,
                description: f.ctDescription||'',
                ctPhysical:f.ctPhysical, ctEmotional:f.ctEmotional,
                ctCognitive:f.ctCognitive, ctTime:f.ctTime,
                ctPredictability:f.ctPredictability,
                needsMap:{...(f.ctNeedsMap||{})},
                subtypes:[],
              };
              newType.weight = deriveCaretakerWeight(newType);
              S.caretakerTypes.push(newType);
              newlyCreatedName = v;
            } else if (editTarget) {
              const oldName = editTarget.name;
              if(v) editTarget.name=v;
              editTarget.description = f.ctDescription||'';
              editTarget.ctPhysical=f.ctPhysical; editTarget.ctEmotional=f.ctEmotional;
              editTarget.ctCognitive=f.ctCognitive; editTarget.ctTime=f.ctTime;
              editTarget.ctPredictability=f.ctPredictability;
              editTarget.needsMap={...(f.ctNeedsMap||{})};
              editTarget.weight = deriveCaretakerWeight(editTarget);
              // Migrate burnout entries that reference the old name —
              // either in caretakerTypes array (current) or caretakerType
              // (legacy single-value) — so the rename carries history forward.
              if (v && v !== oldName) {
                const swap = (e) => {
                  let dirty = false;
                  if (Array.isArray(e.caretakerTypes)) {
                    const idx = e.caretakerTypes.indexOf(oldName);
                    if (idx >= 0) { e.caretakerTypes[idx] = v; dirty = true; }
                  }
                  if (e.caretakerType === oldName) { e.caretakerType = v; dirty = true; }
                  return dirty;
                };
                for (const e of (S.allEntries || [])) {
                  if (e.category === 'burnout' && swap(e)) dbPut('entries', e);
                }
                for (const e of (S.dayEntries || [])) {
                  if (e.category === 'burnout') swap(e);
                }
              }
            }
            saveSettings();
            f.ctEditName=null;f.ctEditInit=null;f.ctAddingNew=false;f.ctNewType='';f.ctDescription='';f.ctDirty=false;
            maybeReturnAfterAddSteadying(newlyCreatedName);
            render();
          }
        }, isAdding?'Add type':'Save changes')
      )
    );
  }

  // Resume the originating entry form (if any) after the add/edit popup
  // dismisses. Steadying entries use the multi-select array
  // selectedSteadyingTypes, so when a new profile was just created we push it
  // into the array instead of replacing a single eventType field.
  function maybeReturnAfterAddSteadying(newlyCreatedName) {
    const ret = S._returnAfterAdd;
    if (!ret) return;
    S._returnAfterAdd = null;
    S.form = { ...ret.formSnapshot };
    if (newlyCreatedName && ret.targetField) {
      if (ret.targetMode === 'push') {
        const arr = Array.isArray(S.form[ret.targetField]) ? [...S.form[ret.targetField]] : [];
        if (!arr.includes(newlyCreatedName)) arr.push(newlyCreatedName);
        S.form[ret.targetField] = arr;
      } else {
        S.form[ret.targetField] = newlyCreatedName;
      }
    }
    S.modal = ret.modal;
    S.activeTab = ret.tab;
    S._resetSheetScroll = true;
    S.libSteadyingExpanded = false;
  }

  // Same popup-on-inline pattern as buildManageTypes: when the panel is
  // embedded in the Activities tab and a form is active, render the form in
  // an overlay rather than inline below the list.
  const ctFormActive = !!(f.ctAddingNew || f.ctEditName);
  const ctUseFormPopup = inline && ctFormActive;

  const inner = h('div',{},
    inline ? null : h('div',{class:'sheet-title'},'💨 Steadying Profiles'),
    h('div',{class:'manage-list'},...items),
    // In popup mode, the form is rendered in the overlay below; suppress the
    // inline form/button here when it would be active.
    ctUseFormPopup ? null : (!f.ctEditName ? steadyingForm() : null)
  );

  if (ctUseFormPopup) {
    const dismiss = () => {
      f.ctEditName = null; f.ctEditInit = null; f.ctAddingNew = false;
      f.ctNewType = ''; f.ctDescription = ''; f.ctDirty = false;
      maybeReturnAfterAddSteadying(null);
      render();
    };
    const ov = h('div',{class:'overlay', id:'lib-popup-overlay'},
      h('div',{class:'sheet'},
        h('div',{class:'sheet-handle'}),
        steadyingForm(),
      )
    );
    const openedAt = Date.now();
    ov.addEventListener('click', e => {
      if (e.target === ov && Date.now() - openedAt > 300) dismiss();
    });
    // Portal to document.body so the overlay's position:fixed anchors to the
    // viewport rather than the scrolled .insights-panel ancestor — on iOS
    // Safari, -webkit-overflow-scrolling: touch can otherwise pull the sheet
    // under the header. Cleanup happens at the start of the next render.
    document.body.appendChild(ov);
    return inner;
  }

  return inline ? inner : overlay(inner);
}



function buildManageTagList(stateKey, defaults, title, accentColor, returnModal, inline=false, formObj=null, usageOpts=null, extraRenderer=null) {
  // usageOpts: optional { category, field } — when provided, each tag row shows
  //   the number of entries (in last 60 days) that include this tag in entry[field].
  //   field can name a single value (e.g. 'whom') or an array field (e.g. 'regulationEmotions').
  if (!S[stateKey]) S[stateKey] = [...defaults];
  const tags = S[stateKey];
  const f = formObj || S.form;
  if (f.newTag==null) f.newTag = '';
  if (f.editTagIdx==null) f.editTagIdx = -1;
  if (f.editTagVal==null) f.editTagVal = '';
  if (f.editTagDirty==null) f.editTagDirty = false;

  // Helper to count how many entries used a given tag in last 60 days
  const countTagUsage = (tag) => {
    if (!usageOpts || !usageOpts.field) return null;
    const cutoff = addDays(S.today, -59);
    let n = 0;
    for (const e of S.allEntries) {
      if (e.date < cutoff || e.date > S.today) continue;
      if (usageOpts.category && e.category !== usageOpts.category) continue;
      const v = e[usageOpts.field];
      if (Array.isArray(v) ? v.includes(tag) : v === tag) n++;
    }
    return n;
  };

  const inner = h('div',{},
    inline ? null : h('div',{class:'sheet-title'}, title),
    h('div',{style:{marginBottom:'16px'}},
      ...tags.slice().sort((a,b)=>a.localeCompare(b)).map((tag) => {
        const realIdx = tags.indexOf(tag);
        const isEditing = f.editTagIdx === realIdx;
        const isDirtyOther = f.editTagDirty && !isEditing;
        return h('div',{
          style:{
            display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'8px 0',borderBottom:'1px solid var(--border)',gap:'8px',
            cursor: isEditing ? 'default' : (f.editTagDirty ? 'default' : 'pointer'),
            opacity: isDirtyOther ? '0.4' : '1',
          },
          onclick: isEditing ? null : (ev) => {
            if(ev.target.closest('button')) return;
            if(f.editTagDirty) return;
            if(f.editTagIdx === realIdx) { f.editTagIdx = -1; f.editTagVal = ''; render(); return; }
            f.editTagIdx = realIdx; f.editTagVal = tag; f.editTagDirty = false; render();
          }
        },
          isEditing
            ? h('input',{
                id:'edit-tag-input-'+stateKey,
                type:'text',
                value: f.editTagVal,
                style:{flex:'1',background:'var(--bg3)',border:'1px solid var(--border-mid)',
                  borderRadius:'8px',padding:'7px 10px',fontSize:'13px',
                  color:'var(--text)',outline:'none',fontFamily:"'DM Sans',sans-serif"},
                oninput: e => { f.editTagVal = e.target.value; f.editTagDirty = true; },
                onkeydown: e => {
                  if (e.key === 'Enter') {
                    const val = e.target.value.trim();
                    if (val && !tags.some((t,i)=>t===val&&i!==realIdx)) {
                      S[stateKey][realIdx] = val;
                      f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false;
                      saveSettings(); render();
                    }
                  }
                  if (e.key === 'Escape') { f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false; render(); }
                }
              })
            : h('span',{style:{fontSize:'13px',color:'var(--text)',flex:'1'}},
                tag,
                (() => {
                  const n = countTagUsage(tag);
                  return n != null ? h('span',{
                    style:{fontSize:'11px',color:'var(--muted)',marginLeft:'8px',fontFamily:"'DM Sans',sans-serif"},
                    title:'Times used in last 60 days',
                  }, n + '×') : null;
                })()
              ),
          isEditing
            ? h('div',{style:{display:'flex',alignItems:'center',gap:'6px',flexShrink:'0'}},
                extraRenderer ? extraRenderer(tag, true) : null,
                h('button',{
                  style:{background:'none',border:'none',color:accentColor,
                    fontSize:'12px',cursor:'pointer',padding:'4px 8px',
                    fontFamily:"'DM Sans',sans-serif",fontWeight:'500'},
                  onclick:()=>{
                    const val = f.editTagVal.trim();
                    if (val && !tags.some((t,i)=>t===val&&i!==realIdx)) {
                      S[stateKey][realIdx] = val;
                    }
                    f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false;
                    saveSettings(); render();
                  }
                }, 'Save'),
                h('button',{
                  style:{background:'none',border:'none',color:'var(--muted)',
                    fontSize:'12px',cursor:'pointer',padding:'4px 8px',
                    fontFamily:"'DM Sans',sans-serif"},
                  onclick:()=>{ f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false; render(); }
                }, 'Cancel'),
                h('button',{
                  style:{background:'none',border:'none',color:'var(--c-conflict)',
                    fontSize:'12px',cursor:'pointer',padding:'4px 8px',opacity:'0.6',
                    fontFamily:"'DM Sans',sans-serif"},
                  onclick:()=>{
                    S[stateKey] = tags.filter((_,i)=>i!==realIdx);
                    f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false;
                    saveSettings(); render();
                  }
                }, 'Delete')
              )
            : h('div',{style:{display:'flex',alignItems:'center',gap:'8px',flexShrink:'0'}},
                extraRenderer ? extraRenderer(tag, false) : null,
                h('span',{style:{fontSize:'11px',color:'var(--muted)'}},'tap to edit')
              )
        );
      })
    ),
    h('div',{style:{display:'flex',gap:'8px',marginBottom:'16px'}},
      h('input',{
        id:'manage-tag-input-'+stateKey, type:'text', placeholder:'New tag…',
        value: f.newTag||'',
        style:{flex:'1',background:'var(--bg3)',border:'1px solid var(--border)',
          borderRadius:'10px',padding:'10px 12px',fontSize:'13px',
          color:'var(--text)',outline:'none',fontFamily:"'DM Sans',sans-serif"},
        oninput: e => { f.newTag = e.target.value; },
        onkeydown: e => {
          if (e.key==='Enter') {
            const val = e.target.value.trim();
            if (val && !tags.includes(val)) {
              S[stateKey] = [...tags, val];
              f.newTag = '';
              saveSettings(); render();
            }
          }
        }
      }),
      h('button',{
        class:'submit-btn',
        style:{flexShrink:'0'},
        onclick:()=>{
          const val = (f.newTag||'').trim();
          if (val && !tags.includes(val)) {
            S[stateKey] = [...tags, val];
            f.newTag = '';
            saveSettings(); render();
          }
        }
      }, 'Add')
    ),
    inline ? null : h('button',{class:'sec-btn',style:{width:'100%'},onclick:()=>openModal(returnModal)},'← Back')
  );
  return inline ? inner : overlay(inner);
}

/* ── Usage count helper ─────────────────────────────────
 * Counts how many entries of a given type were logged in the last 60 days.
 * Steadying types are stored as an array on each entry (multi-select), so they
 * need different lookup logic than single-eventType categories.
 */
function usageCount60d(typeName, category) {
  if (!typeName) return 0;
  const cutoff = addDays(S.today, -59); // inclusive: today + previous 59 days
  let count = 0;
  for (const e of S.allEntries) {
    if (e.date < cutoff || e.date > S.today) continue;
    if (e.category !== category) continue;
    if (category === 'burnout') {
      const list = Array.isArray(e.caretakerTypes) ? e.caretakerTypes
                 : (e.caretakerType ? [e.caretakerType] : []);
      if (list.includes(typeName)) count++;
    } else if (e.eventType === typeName) {
      count++;
    }
  }
  return count;
}

/* ── Scoring preview panel ──────────────────────────────
 * Renders a calibration table inside type editors. Shows the currently-edited
 * type's score range alongside the 3 nearest-weighted existing types in the
 * same category. Used by Restore, Bonding, Intimacy, and Steadying editors.
 *
 * opts:
 *   currentType    — hypothetical type object built from form values
 *   typeList       — array of existing types in the same category (S.affectionTypes etc.)
 *   weightFn       — function(type) -> 0..5 raw weight
 *   minMult,maxMult — multipliers applied to weight to get min/max per-entry score
 *                    (e.g. 0.04..1.00 for restore, 0.20..1.00 for bonding/intimacy)
 *   negative       — true for Steadying (load); displays a small note clarifying
 *                    it subtracts from personal balance
 *   accentColor    — CSS var() for the current row's number color
 *   excludeName    — name of the type being edited (excluded from neighbors list)
 */
function buildScoringPreviewPanel(opts) {
  const { currentType, typeList, weightFn, minMult, maxMult, negative, accentColor, excludeName } = opts;
  const calc = type => {
    const raw = weightFn(type);
    const min = (raw * minMult / SCORE_MAX_RAW) * 100;
    const max = (raw * maxMult / SCORE_MAX_RAW) * 100;
    return { weight: raw, min, max };
  };
  const cur = calc(currentType);

  // Find 3 nearest-weighted existing types (excluding currently-edited one and hidden ones)
  const nearest = (typeList || [])
    .filter(t => typeof t === 'object' && t && t.name && !t.hidden)
    .filter(t => !excludeName || t.name !== excludeName)
    .map(t => ({ name: t.name, ...calc(t) }))
    .sort((a, b) => Math.abs(a.weight - cur.weight) - Math.abs(b.weight - cur.weight))
    .slice(0, 3);

  const fmt = n => {
    if (n < 0.05) return '0.0';
    return n.toFixed(1);
  };
  const rangeText = ({min,max}) => negative
    ? '−' + fmt(min) + ' to −' + fmt(max)
    : fmt(min) + ' – ' + fmt(max);

  const numCurrent = {
    fontSize:'12px', color: accentColor,
    fontFamily:"'Libre Baskerville',serif", textAlign:'right',
  };
  const numOther = {
    fontSize:'12px', color:'var(--text)',
    fontFamily:"'DM Sans',sans-serif", textAlign:'right',
  };
  const nameStyle = isCur => ({
    fontSize:'12px', color: isCur ? 'var(--text)' : 'var(--muted)',
    fontWeight: isCur ? '500' : '400',
  });
  const headStyle = {
    fontSize:'10px', color:'var(--muted)',
    letterSpacing:'0.06em', textTransform:'uppercase',
    fontWeight:'500', padding:'0 0 6px',
  };

  const rowGrid = 'grid', cols = '1fr 130px';

  const rows = [
    // Header
    h('div',{style:{
      display: rowGrid, gridTemplateColumns: cols,
      gap:'8px', borderBottom:'1px solid var(--border)',
    }},
      h('div',{style:headStyle}, 'Name'),
      h('div',{style:{...headStyle, textAlign:'right'}}, 'Score range'),
    ),
    // Current item
    h('div',{style:{
      display: rowGrid, gridTemplateColumns: cols,
      gap:'8px', padding:'7px 0',
      borderBottom: nearest.length > 0 ? '1px solid var(--border)' : 'none',
    }},
      h('div',{style:nameStyle(true)},
        currentType.name || '(this type)',
        h('span',{style:{fontSize:'10px',color:'var(--muted)',marginLeft:'6px'}}, 'editing')),
      h('div',{style:numCurrent}, rangeText(cur)),
    ),
    // Nearest 3
    ...nearest.map(n =>
      h('div',{style:{
        display: rowGrid, gridTemplateColumns: cols,
        gap:'8px', padding:'5px 0',
      }},
        h('div',{style:nameStyle(false)}, n.name),
        h('div',{style:numOther}, rangeText(n)),
      )
    ),
  ];

  return h('div',{style:{
    margin:'4px 0 14px', padding:'12px 14px',
    borderRadius:'10px', background:'var(--bg2)', border:'1px solid var(--border)',
  }},
    h('div',{style:{
      fontSize:'11px', color:'var(--muted)', marginBottom:'8px',
      letterSpacing:'0.06em', textTransform:'uppercase',
    }}, 'Scoring preview'),
    ...rows,
    negative ? h('div',{style:{
      fontSize:'10px', color:'var(--muted)', marginTop:'8px',
      paddingTop:'8px', borderTop:'1px solid var(--border)',
      lineHeight:'1.5',
    }}, 'Steadying entries score as personal load — subtracts from personal balance.') : null
  );
}

function buildManageTypes(listKey, returnModal, title, inline=false, formObj=null) {
  const f = formObj || S.form;
  if(f.newType==null)f.newType='';
  if(f.newTypeDesc==null) f.newTypeDesc='';
  if(f.newDefaultSolo==null)f.newDefaultSolo=false;
  if(f.newWeight==null)f.newWeight=50;
  if(f.addStep==null)f.addStep=1;
  if(f.descEffort==null)    f.descEffort=1;
  if(f.descTime==null)      f.descTime=1;
  if(f.descFinancial==null) f.descFinancial=1;
  if(f.descRarity==null)    f.descRarity=1;
  if(f.descPresence==null)  f.descPresence=1;
  if(f.physIntentionality==null) f.physIntentionality=1;
  if(f.physEnergy==null)         f.physEnergy=1;
  if(f.physDesire==null)       f.physDesire=1;
  if(f.physNovelty==null)        f.physNovelty=1;
  if(f.physSetting==null)        f.physSetting=1;
  const isPhysical  = listKey === 'physicalTypes';
  const isAffection = listKey === 'affectionTypes';
  const isRestore   = listKey === 'restoreTypes';
  const isSocial    = listKey === 'socialTypes';
  // Social activities (Individual mode) reuse the affection structure but
  // edit a separate type list scored against SOCIAL_NEEDS instead of
  // EMOTIONAL_NEEDS. Treat them as "affection-like" wherever the form/profile
  // structure is identical.
  const isAffectionLike = isAffection || isSocial;
  const needsListLocal    = isSocial ? SOCIAL_NEEDS         : EMOTIONAL_NEEDS;
  const needsRankingLocal = isSocial ? S.socialNeedsRanking : S.needsRanking;
  const isProfileType = isAffectionLike || isPhysical; // all three use the activity profile form
  if(!f.needsMap) f.needsMap=Object.fromEntries(needsListLocal.map(n=>[n.val,1]));
  const list = S[listKey];

  const add=()=>{
    const v=(f.newType||'').trim();
    if(!v) return;
    if(isPhysical) {
      if(!list.find(t=>t.name===v)) {
        const newType = {
          name:v, defaultSolo:!!f.newDefaultSolo,
          physIntentionality:f.physIntentionality, physEnergy:f.physEnergy,
          physDesire:f.physDesire, physNovelty:f.physNovelty, physSetting:f.physSetting,
          needsMap:{...(f.needsMap||{})},
        };
        newType.weight = deriveActivityWeight(newType);
        S[listKey].push(newType);
        saveSettings(); f.newType=''; f.newDefaultSolo=false;
        f.physIntentionality=1; f.physEnergy=1; f.physDesire=1; f.physNovelty=1; f.physSetting=1;
        f.needsMap={}; f.addingNew=false;
        render();
      }
    } else if(isAffectionLike) {
      if(!list.find(t=>t.name===v)) {
        S[listKey].push({
          name:       v,
          weight:     f.newWeight||50,
          descEffort:    f.descEffort,
          descTime:      f.descTime,
          descFinancial: f.descFinancial,
          descRarity:    f.descRarity,
          descPresence:  f.descPresence,
          needsMap:   {...(f.needsMap||{})},
        });
        saveSettings();
        f.newType=''; f.newWeight=50; f.addStep=1;
        f.descEffort=1; f.descTime=1; f.descFinancial=1; f.descRarity=1; f.descPresence=1;
        f.needsMap={};
        render();
      }
    } else if (isRestore) {
      if(!list.find(t=>t.name===v)){
        S[listKey].push({name:v, needsMap:{...(f.needsMap||{})}});
        saveSettings(); f.newType=''; f.needsMap={}; render();
      }
    } else {
      if(!list.includes(v)){S[listKey].push(v);saveSettings();f.newType='';render();}
    }
  };

  const items = isPhysical
    ? list.slice().sort((a,b)=>a.name.localeCompare(b.name)).flatMap(t=>{
        const isThisRowEditing = f.editTypeName === t.name;
        const row = h('div',{
          class:'manage-item',
          style:{cursor: isThisRowEditing ? 'pointer' : (f.editTypeDirty ? 'default' : 'pointer'), opacity: (!isThisRowEditing && f.editTypeDirty) || t.hidden ? '0.4' : '1'},
          onclick:(ev)=>{ if(ev.target.closest('button')) return; if(isThisRowEditing){ if(!f.editTypeDirty){f.editTypeName=null;f.editInit=null;render();} }else{ if(f.editTypeDirty) return; f.editTypeName=t.name;f.editInit=null;f.editTypeDirty=false;render();} }
        },
          h('div',{style:{flex:'1',minWidth:'0'}},
            h('span',{style:{fontSize:'14px',textDecoration:t.hidden?'line-through':'none'}},t.name),
            h('span',{style:{fontSize:'11px',color:'var(--muted)',marginLeft:'8px'},
              title:'Solo or shared · weight (0-100) · times logged in last 60 days'},
              (t.defaultSolo?'solo':'shared')+' · w:'+Math.round(deriveActivityWeight(t)/5*100)+' · '+usageCount60d(t.name,'physical')+'×'),
            t.description ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, t.description) : null
          ),
          h('div',{style:{display:'flex',alignItems:'center',gap:'6px',flexShrink:'0'}},
            h('button',{
              style:{fontSize:'11px',padding:'3px 8px',borderRadius:'6px',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",
                border: t.hidden ? '1px solid var(--border)' : '1px solid var(--border)',
                background: t.hidden ? 'var(--bg3)' : 'var(--bg3)',
                color: t.hidden ? 'var(--c-partner)' : 'var(--muted)'},
              onclick:ev=>{ev.stopPropagation(); t.hidden=!t.hidden; saveSettings(); render();}
            }, t.hidden ? 'Show' : 'Hide'),
            isThisRowEditing
              ? h('span',{style:{fontSize:'11px',color:'var(--c-physical)'}}, 'editing…')
              : h('span',{style:{fontSize:'11px',color:'var(--muted)'}},'tap to edit')
          )
        );
        // Inline mode: form opens in popup overlay below — don't double-render here.
        return (isThisRowEditing && !inline) ? [row, affectionAddForm()] : [row];
      })
    : isAffectionLike
    ? list.slice().sort((a,b)=>a.name.localeCompare(b.name)).flatMap(t=>{
        const isThisRowEditing = f.editTypeName === t.name;
        // Social activities don't have a logging category yet, so skip usage count.
        const usageCatForRow = isSocial ? null : (isPhysical ? 'physical' : 'affection');
        const row = h('div',{
          class:'manage-item',
          style:{cursor: isThisRowEditing ? 'pointer' : (f.editTypeDirty ? 'default' : 'pointer'), opacity: (!isThisRowEditing && f.editTypeDirty) || t.hidden ? '0.4' : '1'},
          onclick:(ev)=>{ if(ev.target.closest('button')) return; if(isThisRowEditing){ if(!f.editTypeDirty){f.editTypeName=null;f.editInit=null;render();} }else{ if(f.editTypeDirty) return; f.editTypeName=t.name;f.editInit=null;f.editTypeDirty=false;render();} }
        },
          h('div',{style:{flex:'1',minWidth:'0'}},
            h('span',{style:{fontSize:'14px',textDecoration:t.hidden?'line-through':'none'}},t.name),
            h('span',{style:{fontSize:'11px',color:'var(--muted)',marginLeft:'8px'},
              title:'Weight (0-100) · times logged in last 60 days'},
              'w:'+Math.round(deriveActivityWeight(t)/5*100) + (usageCatForRow ? ' · '+usageCount60d(t.name, usageCatForRow)+'×' : '')),
            t.description ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, t.description) : null
          ),
          h('div',{style:{display:'flex',alignItems:'center',gap:'6px',flexShrink:'0'}},
            h('button',{
              style:{fontSize:'11px',padding:'3px 8px',borderRadius:'6px',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",
                border:'1px solid var(--border)', background:'var(--bg3)',
                color: t.hidden ? 'var(--c-partner)' : 'var(--muted)'},
              onclick:ev=>{ev.stopPropagation(); t.hidden=!t.hidden; saveSettings(); render();}
            }, t.hidden ? 'Show' : 'Hide'),
            isThisRowEditing
              ? h('span',{style:{fontSize:'11px',color: isSocial ? 'var(--c-social)' : 'var(--c-affection)'}},'editing…')
              : h('span',{style:{fontSize:'11px',color:'var(--muted)'}},'tap to edit')
          )
        );
        // Inline mode: form opens in popup overlay below — don't double-render here.
        return (isThisRowEditing && !inline) ? [row, affectionAddForm()] : [row];
      })
    : isRestore
    ? list.slice().sort((a,b)=>(typeof a==='string'?a:a.name).localeCompare(typeof b==='string'?b:b.name)).flatMap(t=>{
        const name = typeof t === 'string' ? t : t.name;
        const desc = typeof t === 'object' ? t.description : null;
        const hidden = typeof t === 'object' && t.hidden;
        const isThisRowEditing = f.editTypeName === name;
        const row = h('div',{
          class:'manage-item',
          style:{cursor: isThisRowEditing ? 'pointer' : (f.editTypeDirty ? 'default' : 'pointer'), opacity: (!isThisRowEditing && f.editTypeDirty) || hidden ? '0.4' : '1'},
          onclick:(ev)=>{ if(ev.target.closest('button')) return; if(isThisRowEditing){ if(!f.editTypeDirty){f.editTypeName=null;f.editInit=null;render();} }else{ if(f.editTypeDirty) return; f.editTypeName=name;f.editInit=null;f.editTypeDirty=false;render();} }
        },
          h('div',{style:{flex:'1',minWidth:'0'}},
            h('span',{style:{fontSize:'14px',textDecoration:hidden?'line-through':'none'}}, name),
            (typeof t === 'object') ? h('span',{
              style:{fontSize:'11px',color:'var(--muted)',marginLeft:'8px'},
              title:'Weight (0-100) · times logged in last 60 days'
            }, 'w:'+Math.round(deriveRestoreWeight(t)/5*100)+' · '+usageCount60d(name,'restore')+'×') : null,
            desc ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, desc) : null
          ),
          h('div',{style:{display:'flex',alignItems:'center',gap:'6px',flexShrink:'0'}},
            h('button',{
              style:{fontSize:'11px',padding:'3px 8px',borderRadius:'6px',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",
                border:'1px solid var(--border)', background:'var(--bg3)',
                color: hidden ? 'var(--c-partner)' : 'var(--muted)'},
              onclick:ev=>{
                ev.stopPropagation();
                if(typeof t==='string') {
                  const idx=S[listKey].indexOf(t);
                  if(idx>=0) S[listKey][idx]={name:t,hidden:true};
                } else { t.hidden=!t.hidden; }
                saveSettings(); render();
              }
            }, hidden ? 'Show' : 'Hide'),
            isThisRowEditing
              ? h('span',{style:{fontSize:'11px',color:'var(--c-restore)'}},'editing…')
              : h('span',{style:{fontSize:'11px',color:'var(--muted)'}},'tap to edit')
          )
        );
        // Inline mode: form opens in popup overlay below — don't double-render here.
        return (isThisRowEditing && !inline) ? [row, restoreAddForm()] : [row];
      })
    : [];

  // ── Affection add/edit form ────────────────────────
  function affectionAddForm() {
    const isEditing = !!f.editTypeName;
    const isAdding  = !!f.addingNew;
    if (!isEditing && !isAdding) {
      // Show "Add new" button
      const addBtnAccent = isSocial ? 'var(--c-social)' : 'var(--c-affection)';
      const addBtnBg     = isSocial ? 'rgba(224,164,104,0.08)' : 'rgba(214,115,156,0.08)';
      return h('button',{
        style:{
          width:'100%', marginTop:'10px', padding:'12px',
          borderRadius:'14px', border:'1px solid '+addBtnAccent,
          background:addBtnBg, color:addBtnAccent,
          fontSize:'13px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
          fontWeight:'500',
        },
        onclick:()=>{
          f.addingNew=true; f.newType='';
          f.descEffort=1; f.descTime=1; f.descFinancial=1; f.descRarity=1; f.descPresence=1;
          f.physIntentionality=1; f.physEnergy=1; f.physDesire=1; f.physNovelty=1; f.physSetting=1;
          f.needsMap=Object.fromEntries(needsListLocal.map(n=>[n.val,1]));
          render();
        }
      },(isPhysical ? '+ Add new Intimacy activity' : isSocial ? '+ Add new Social activity' : '+ Add new '+bondingLabel()+' activity'));
    }

    const editTarget = isEditing ? list.find(t=>t.name===f.editTypeName) : null;

    // Init edit fields on first open
    if (isEditing && f.editInit!== f.editTypeName) {
      const t = editTarget;
      f.editInit=f.editTypeName;
      f.editTypeDirty = false;
      f.newType        = t.name;
      f.newTypeDesc    = t.description || '';
      if (isPhysical)  f.newDefaultSolo = !!t.defaultSolo;
      // Bonding profile fields
      f.descEffort     = t.descEffort    || 1;
      f.descTime       = t.descTime      || 1;
      f.descFinancial  = t.descFinancial || 1;
      f.descRarity     = t.descRarity    || 1;
      f.descPresence   = t.descPresence  || 1;
      // Physical profile fields
      f.physIntentionality = t.physIntentionality || 1;
      f.physEnergy         = t.physEnergy         || 1;
      f.physDesire       = t.physDesire       || 1;
      f.physNovelty        = t.physNovelty         || 1;
      f.physSetting        = t.physSetting         || 1;
      f.needsMap = Object.fromEntries(
        needsListLocal.map(n=>[n.val, (t.needsMap||{})[n.val] || 1])
      );
    }

    const nameVal = isEditing ? editTarget?.name : (f.newType||'');
    const heading = isEditing ? 'Editing: '+nameVal : 'New activity';
    // For physical types, solo types skip profile and needs
    const isSoloType = isPhysical && (isEditing ? !!editTarget?.defaultSolo : !!f.newDefaultSolo);

    const SCALE_LABELS = ['None / trivial','Some','Moderate','High','Significant'];

    // Social activities re-purpose descFinancial as a "Depth" dimension and
    // re-word the Effort/Meaning/Presence copy so it doesn't read partner-flavored.
    // The underlying field names stay the same so the scoring math is unchanged.
    const DESC_SCALES = {
      descEffort:    ['Trivial','Low','Moderate','High','Significant'],
      descTime:      ['Minimal','Under 1 hour','1–2 hours','2–4 hours','4+ hours'],
      descFinancial: isSocial
        ? ['Surface','Casual','Some real talk','Substantial','Vulnerable']
        : ['None','Minimal','Moderate','Meaningful','Significant'],
      descRarity:    ['Routine','Pleasant','Meaningful','Special','Significant'],
      descPresence:  ['Passive','Casual','Engaged','Focused','Fully immersed'],
    };

    const DESC_LABELS = {
      descEffort:    'Effort',
      descTime:      'Time',
      descFinancial: isSocial ? 'Depth' : 'Financial',
      descRarity:    isSocial ? 'Significance' : 'Meaning',
      descPresence:  'Presence',
    };

    const DESC_HINTS = {
      descEffort: isSocial
        ? 'What was invested in making this happen — yours or theirs (initiating, planning, showing up). Higher signals real investment in the connection.'
        : 'How much personal effort — physical, mental, or logistical — was anticipated or required from your partner. Higher can signal care and investment if matched by results.',
      descTime:      'How much time was anticipated or required, including preparation and duration. Moderate to high values reward dedicated connection time.',
      descFinancial: isSocial
        ? 'How much real connection happened — surface chat vs. vulnerable disclosure. Based on Reis & Shaver: self-disclosure + responsiveness predicts relationship quality more than any other dimension.'
        : 'What was the anticipated or actual financial cost. Higher scales potential value for special events, but only when other factors confirm impact.',
      descRarity: isSocial
        ? 'How notable this was — a routine hang vs. a milestone moment. Both matter; routine builds trust, special occasions punctuate.'
        : 'How personally meaningful or relationally significant was this activity anticipated or experienced to be.',
      descPresence: isSocial
        ? 'How attentive and engaged everyone was — phones away, fully there vs. distracted or going through motions.'
        : 'How much focused mutual presence, attention, or active engagement was required or experienced from both of you.',
    };

    // Highlight color for the profile-row buttons. Social activities use
    // their own accent; bonding/intimacy continue to share orange.
    const profileAccent   = isSocial ? 'var(--c-social)' : 'var(--c-physical)';
    const profileBorderOn = isSocial ? 'rgba(224,164,104,0.6)' : 'rgba(168,50,78,0.6)';
    const profileBgOn     = isSocial ? 'rgba(224,164,104,0.12)' : 'rgba(168,50,78,0.12)';
    const descQ = (key) => {
      const cur = f[key] || 1;
      const labels = DESC_SCALES[key] || SCALE_LABELS;
      const label  = DESC_LABELS[key] || key;
      const hint   = DESC_HINTS[key] || '';
      return h('div',{style:{marginBottom:'14px'}},
        h('div',{style:{marginBottom:'5px'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline'}},
            h('span',{style:{fontSize:'12px',color:'var(--text)',fontWeight:'500'}}, label),
            h('span',{style:{fontSize:'11px',color:profileAccent}}, labels[cur-1])
          ),
          hint ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',lineHeight:'1.4'}}, hint) : null
        ),
        h('div',{style:{display:'flex',gap:'4px'}},
          ...[1,2,3,4,5].map(v=>h('button',{
            style:{flex:'1',padding:'7px 2px',borderRadius:'8px',fontSize:'11px',
              border:'1px solid '+(cur===v?profileBorderOn:'var(--border)'),
              background:cur===v?profileBgOn:'var(--bg3)',
              color:cur===v?profileAccent:'var(--muted)',cursor:'pointer'},
            onclick:()=>{f[key]=v;markDirty();render();}
          }, labels[v-1]))
        )
      );
    };

    const NEEDS_LABELS = ['None','Some','Moderate','High','Significant'];

    const orderedNeeds = needsRankingLocal.map(val=>needsListLocal.find(n=>n.val===val)).filter(Boolean);

    const saveOk = isAdding ? true : true; // always allow save; name read from DOM on submit
    const markDirty = () => { if(isEditing) f.editTypeDirty = true; };

    return h('div',{style:{marginTop:'12px',borderTop:'1px solid var(--border)',paddingTop:'12px'}},

      // Heading
      h('div',{style:{fontSize:'15px',fontWeight:'600',color:'var(--text)',marginBottom:'14px',fontFamily:"'Libre Baskerville',serif"}},
        isEditing ? nameVal : (isPhysical ? 'New intimacy activity' : isSocial ? 'New social activity' : 'New '+bondingLabel().toLowerCase()+' activity')
      ),

      // Name field — for both new and edit
      h('div',{style:{marginBottom:'12px'}},
        h('label',{class:'form-label'}, isEditing ? 'Name' : 'Name'),
        h('input',{
          id:'activity-name-input',
          type:'text',class:'form-input',
          placeholder:'e.g. Dining Out, Beach walk…',
          value: f.newType||'',
          oninput:e=>{f.newType=e.target.value; markDirty();}
        })
      ),

      // Description field
      h('div',{style:{marginBottom:'12px'}},
        h('label',{class:'form-label'},'Description'),
        h('textarea',{
          id:'activity-desc-input',
          class:'form-input', rows:'2',
          placeholder:'Optional — a short note about what this activity is…',
          oninput:e=>{f.newTypeDesc=e.target.value; markDirty();}
        }, f.newTypeDesc||'')
      ),

      // Shared/solo default — physical only, and only when Solo Intimacy
      // is enabled. Otherwise every physical activity is shared.
      isPhysical && S.showSoloIntimacy ? h('div',{style:{marginBottom:'12px'}},
        h('label',{class:'form-label'},'Default'),
        h('div',{class:'btn-grid-2'},
          h('button',{class:'sel-btn'+(f.newDefaultSolo===false?' sel-physical':''),
            onclick:()=>{f.newDefaultSolo=false;markDirty();render();}},
            'Shared',h('span',{class:'sub'},'With partner')),
          h('button',{class:'sel-btn'+(f.newDefaultSolo===true?' sel-physical':''),
            onclick:()=>{f.newDefaultSolo=true;markDirty();render();}},
            'Solo',h('span',{class:'sub'},'Just me'))
        )
      ) : null,

      // Activity Profile — physical or bonding questions (skip for solo physical)
      ...(!isSoloType ? [
        h('div',{style:{marginBottom:'12px',paddingTop:'16px',borderTop:'1px solid var(--border)',marginTop:'20px'}},
          h('div',{style:{fontSize:'14px',color:'var(--text)',fontWeight:'600',marginBottom:'3px',fontFamily:"'Libre Baskerville',serif"}},'Activity Profile — your perspective'),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',lineHeight:'1.5'}},
            isPhysical
              ? `How you experience this type of encounter. Not a measure of ${P.pos} experience.`
              : `How you experience this activity — the investment you make and what it's capable of returning. Not a measure of ${P.pos} experience.`
          )
        ),
        ...(isPhysical ? [
          ...Object.keys(PHYS_SCALES).map(key => {
            const cur = f[key] || 1;
            const labels = PHYS_SCALES[key];
            const label  = PHYS_LABELS[key];
            const hint   = PHYS_HINTS[key];
            return h('div',{style:{marginBottom:'14px'}},
              h('div',{style:{marginBottom:'5px'}},
                h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline'}},
                  h('span',{style:{fontSize:'12px',color:'var(--text)',fontWeight:'500'}}, label),
                  h('span',{style:{fontSize:'11px',color:'var(--c-physical)'}}, labels[cur-1])
                ),
                hint ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',lineHeight:'1.4'}}, hint) : null
              ),
              h('div',{style:{display:'flex',gap:'4px'}},
                ...[1,2,3,4,5].map(v=>h('button',{
                  style:{flex:'1',padding:'7px 2px',borderRadius:'8px',fontSize:'11px',
                    border:'1px solid '+(cur===v?'rgba(168,50,78,0.6)':'var(--border)'),
                    background:cur===v?'rgba(168,50,78,0.12)':'var(--bg3)',
                    color:cur===v?'var(--c-physical)':'var(--muted)',cursor:'pointer'},
                  onclick:()=>{f[key]=v;markDirty();render();}
                }, labels[v-1]))
              )
            );
          })
        ] : [
          descQ('descEffort'),
          descQ('descTime'),
          descQ('descFinancial'),
          descQ('descRarity'),
          descQ('descPresence'),
        ]),

        // Needs
        h('div',{style:{marginBottom:'12px',paddingTop:'16px',borderTop:'1px solid var(--border)',marginTop:'28px'}},
          h('div',{style:{fontSize:'14px',color:'var(--text)',fontWeight:'600',marginBottom:'3px',fontFamily:"'Libre Baskerville',serif"}}, isSocial ? 'Social Needs' : 'Love Needs'),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',lineHeight:'1.5'}},
            isSocial
              ? 'How strongly does this activity address each social need? Ordered by your ranking in the Needs tab.'
              : 'How strongly does this activity address each need? Ordered by your personal ranking in Config.'
          )
        ),
        ...orderedNeeds.map((need,idx) => {
          const cur = (f.needsMap||{})[need.val] || 1;
          return h('div',{style:{marginBottom:'12px'}},
            h('div',{style:{marginBottom:'5px'}},
              h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline'}},
                h('span',{style:{fontSize:'12px',color:'var(--text)',fontWeight:'500'}},
                  h('span',{style:{color:'var(--muted)',marginRight:'6px',fontSize:'11px'}},String(idx+1)),
                  need.icon ? h('span',{style:{marginRight:'6px',fontSize:'14px'}}, need.icon) : null,
                  need.label),
                h('span',{style:{fontSize:'11px',color:cur>1?profileAccent:'var(--muted)'}},
                  NEEDS_LABELS[cur-1])
              ),
              h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',lineHeight:'1.4'}},
                resolveSub(need.hint))
            ),
            h('div',{style:{display:'flex',gap:'3px'}},
              ...[1,2,3,4,5].map(v=>h('button',{
                style:{flex:'1',padding:'5px 2px',borderRadius:'7px',fontSize:'10px',
                  border:'1px solid '+(cur===v?profileBorderOn:'var(--border)'),
                  background:cur===v?profileBgOn:'var(--bg3)',
                  color:cur===v?profileAccent:'var(--muted)',cursor:'pointer'},
                onclick:()=>{f.needsMap={...(f.needsMap||{})};f.needsMap[need.val]=v;markDirty();render();}
              }, NEEDS_LABELS[v-1]))
            )
          );
        }),
      ] : [
        // Solo type — just a note
        h('div',{style:{marginTop:'16px',padding:'12px',background:'var(--bg3)',borderRadius:'10px',fontSize:'12px',color:'var(--muted)',lineHeight:'1.5'}},
          'Solo events are scored at logging time based on context. No activity profile or needs mapping required.'
        ),
      ]),

      // ── Scoring preview panel ───────────────────────────
      // Skipped for solo intimacy types (no profile-based scoring)
      !isSoloType ? buildScoringPreviewPanel({
        currentType: isPhysical ? {
          name: f.newType || '(this type)',
          physIntentionality: f.physIntentionality||1, physEnergy: f.physEnergy||1,
          physDesire: f.physDesire||1, physNovelty: f.physNovelty||1, physSetting: f.physSetting||1,
          needsMap: f.needsMap || {},
        } : {
          name: f.newType || '(this type)',
          descEffort: f.descEffort||1, descTime: f.descTime||1,
          descFinancial: f.descFinancial||1, descRarity: f.descRarity||1,
          descPresence: f.descPresence||1,
          needsMap: f.needsMap || {},
        },
        typeList: S[listKey],
        // Social types score against SN ranking, not EN — use the dedicated
        // weight function so the preview reflects real Social scoring.
        weightFn: isSocial ? deriveSocialActivityWeight : deriveActivityWeight,
        // Bonding/Intimacy/Social: only one quality knob (connectionQuality 0.20 → 1.00)
        minMult: 0.20, maxMult: 1.00,
        accentColor: isPhysical ? 'var(--c-physical)' : isSocial ? 'var(--c-social)' : 'var(--c-affection)',
        excludeName: isEditing ? f.editTypeName : null,
      }) : null,

      isEditing ? h('div',{style:{textAlign:'left',marginBottom:'12px'}},
        h('button',{
          style:{background:'none',border:'none',color:'var(--c-conflict)',fontSize:'12px',
            cursor:'pointer',padding:'4px 8px',opacity:'0.6',fontFamily:"'DM Sans',sans-serif"},
          onclick:()=>{
            S[listKey]=S[listKey].filter(x=>x.name!==f.editTypeName);
            saveSettings();
            f.editTypeName=null;f.editInit=null;f.addingNew=false;f.newType='';f.newTypeDesc='';
            render();
          }
        },'Delete this type')
      ) : null,

      // Buttons
      h('div',{style:{display:'flex',gap:'8px',marginTop:'8px'}},
        h('button',{
          style:{flex:'1',padding:'12px',borderRadius:'14px',border:'1px solid var(--border)',
            background:'var(--bg3)',color:'var(--muted)',fontSize:'13px',cursor:'pointer',
            fontFamily:"'DM Sans',sans-serif"},
          onclick:()=>{
            f.editTypeName=null;f.editInit=null;f.addingNew=false;f.newTypeDesc='';f.editTypeDirty=false;
            maybeReturnAfterAdd(null);
            render();
          }
        },'Cancel'),
        h('button',{
          class:'submit-btn',
          style:{flex:'2'},
          onclick: ()=>{
            let newlyCreatedName = null;
            if (isAdding) {
              const nameInput = document.getElementById('activity-name-input');
              const v = (nameInput ? nameInput.value : f.newType||'').trim();
              if(!v) { if(nameInput) nameInput.focus(); return; }
              if(v && !list.find(t=>t.name===v)) {
                const newType = isPhysical ? {
                  name:v, defaultSolo:!!f.newDefaultSolo,
                  description: (f.newTypeDesc||'').trim()||undefined,
                  physIntentionality:f.physIntentionality, physEnergy:f.physEnergy,
                  physDesire:f.physDesire, physNovelty:f.physNovelty, physSetting:f.physSetting,
                  needsMap:{...(f.needsMap||{})},
                } : {
                  name:v,
                  description: (f.newTypeDesc||'').trim()||undefined,
                  descEffort:f.descEffort, descTime:f.descTime,
                  descFinancial:f.descFinancial, descRarity:f.descRarity,
                  descPresence:f.descPresence, needsMap:{...(f.needsMap||{})},
                };
                newType.weight = (isSocial ? deriveSocialActivityWeight : deriveActivityWeight)(newType);
                S[listKey].push(newType);
                newlyCreatedName = v;
              }
            } else if (editTarget) {
              const nameInput = document.getElementById('activity-name-input');
              const newName = (nameInput ? nameInput.value : f.newType||'').trim();
              const oldName = editTarget.name;
              if (newName) editTarget.name = newName;
              // Migrate existing entries that reference the old name so they
              // don't get flagged as "type deleted" — a rename should carry
              // history forward, not orphan it.
              if (newName && newName !== oldName) {
                const cat = isPhysical ? 'physical' : isAffection ? 'affection' : isRestore ? 'restore' : isSocial ? 'social' : null;
                if (cat) {
                  for (const e of (S.allEntries || [])) {
                    if (e.category === cat && e.eventType === oldName) {
                      e.eventType = newName;
                      dbPut('entries', e);
                    }
                  }
                  for (const e of (S.dayEntries || [])) {
                    if (e.category === cat && e.eventType === oldName) e.eventType = newName;
                  }
                }
              }
              editTarget.description = (f.newTypeDesc||'').trim()||undefined;
              if (isPhysical) {
                editTarget.defaultSolo = !!f.newDefaultSolo;
                editTarget.physIntentionality = f.physIntentionality;
                editTarget.physEnergy    = f.physEnergy;
                editTarget.physDesire  = f.physDesire;
                editTarget.physNovelty   = f.physNovelty;
                editTarget.physSetting   = f.physSetting;
              } else {
                editTarget.descEffort=f.descEffort; editTarget.descTime=f.descTime;
                editTarget.descFinancial=f.descFinancial; editTarget.descRarity=f.descRarity;
                editTarget.descPresence=f.descPresence;
              }
              editTarget.needsMap={...(f.needsMap||{})};
              editTarget.weight = (isSocial ? deriveSocialActivityWeight : deriveActivityWeight)(editTarget);
            }
            saveSettings();
            f.editTypeName=null; f.editInit=null; f.addingNew=false; f.newType=''; f.newTypeDesc=''; f.editTypeDirty=false;
            maybeReturnAfterAdd(newlyCreatedName);
            render();
          }
        }, isAdding?'Add activity':'Save changes')
      )
    );
  };

  // Resume the originating entry form (if any) after the add/edit popup
  // dismisses. When a new activity was just created, pre-select it as the
  // entry form's eventType. Used by save / cancel / click-outside dismiss.
  function maybeReturnAfterAdd(newlyCreatedName) {
    const ret = S._returnAfterAdd;
    if (!ret) return;
    S._returnAfterAdd = null;
    S.form = { ...ret.formSnapshot };
    if (newlyCreatedName && ret.targetField) {
      S.form[ret.targetField] = newlyCreatedName;
    }
    S.modal = ret.modal;
    S.activeTab = ret.tab;
    S._resetSheetScroll = true;
    // Collapse the library section so it doesn't sit "open" behind the
    // entry form when the user returns to it next time.
    if (listKey === 'affectionTypes') S.libBondingExpanded = false;
    else if (listKey === 'physicalTypes') S.libIntimacyExpanded = false;
    else if (listKey === 'restoreTypes')  S.libRestoreExpanded = false;
    else if (listKey === 'socialTypes')   S.libSocialExpanded = false;
  }

  // ── Restore add/edit form ─────────────────────────
  function restoreAddForm() {
    const isEditing = !!f.editTypeName;
    const isAdding  = !!f.addingNew;

    if (!isEditing && !isAdding) {
      return h('button',{
        style:{
          width:'100%', marginTop:'10px', padding:'12px',
          borderRadius:'14px', border:'1px solid var(--c-restore)',
          background:'rgba(79,168,196,0.08)', color:'var(--c-restore)',
          fontSize:'13px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:'500',
        },
        onclick:()=>{
          f.addingNew=true; f.newType='';
          f.descEffort=1; f.descTime=1; f.descFinancial=1; f.descRarity=1; f.descPresence=1;
          f.needsMap=Object.fromEntries([...EMOTIONAL_NEEDS,...PERSONAL_NEEDS].map(n=>[n.val,1]));
          render();
        }
      },'+ Add new restorative activity');
    }

    const editTarget = isEditing ? list.find(t=>(typeof t==='string'?t:t.name)===f.editTypeName) : null;

    if (isEditing && f.editInit!== f.editTypeName) {
      f.editInit=f.editTypeName;
      f.editTypeDirty = false;
      f.newType  = typeof editTarget==='string' ? editTarget : editTarget?.name || '';
      f.newTypeDesc = (typeof editTarget === 'object' && editTarget?.description) || '';
      f.descEffort   = (typeof editTarget === 'object' && editTarget?.descEffort)   || 1;
      f.descTime     = (typeof editTarget === 'object' && editTarget?.descTime)     || 1;
      f.descFinancial= (typeof editTarget === 'object' && editTarget?.descFinancial)|| 1;
      f.descRarity   = (typeof editTarget === 'object' && editTarget?.descRarity)   || 1;
      f.needsMap = Object.fromEntries(
        [...EMOTIONAL_NEEDS,...PERSONAL_NEEDS].map(n=>[n.val, (typeof editTarget==='object' && editTarget?.needsMap ? editTarget.needsMap[n.val] : 1) || 1])
      );
    }

    const markDirty = () => { if(isEditing) f.editTypeDirty = true; };
    const nameVal = isEditing ? (typeof editTarget==='string' ? editTarget : editTarget?.name) : '';

    return h('div',{style:{marginTop:'12px',borderTop:'1px solid var(--border)',paddingTop:'12px'}},

      // Heading
      h('div',{style:{fontSize:'15px',fontWeight:'600',color:'var(--text)',marginBottom:'14px',fontFamily:"'Libre Baskerville',serif"}},
        isEditing ? nameVal : 'New restorative activity'
      ),

      h('div',{style:{marginBottom:'12px'}},
        h('label',{class:'form-label'},'Name'),
        h('input',{
          id:'activity-name-input', type:'text', class:'form-input',
          placeholder:'e.g. Exercise, Reading…',
          value: f.newType||'',
          oninput:e=>{f.newType=e.target.value; markDirty();}
        })
      ),

      h('div',{style:{marginBottom:'12px'}},
        h('label',{class:'form-label'},'Description'),
        h('textarea',{
          id:'activity-desc-input',
          class:'form-input', rows:'2',
          placeholder:'Optional — a short note about what this activity is…',
          oninput:e=>{f.newTypeDesc=e.target.value; markDirty();}
        }, f.newTypeDesc||'')
      ),

      h('div',{style:{marginBottom:'12px',paddingTop:'12px',borderTop:'1px solid var(--border)',marginTop:'8px'}},
        h('div',{style:{fontSize:'14px',color:'var(--text)',fontWeight:'600',marginBottom:'3px',fontFamily:"'Libre Baskerville',serif"}},'Activity Profile'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',lineHeight:'1.5',marginBottom:'12px'}},
          'How demanding or significant is this activity in each dimension?'
        )
      ),
      ...(() => {
        const RDESC_SCALES = {
          descEffort:    ['Trivial','Low','Moderate','High','Significant'],
          descTime:      ['Under 30 min','About an hour','2–3 hours','Half day','Full day+'],
          descFinancial: ['Free','Minimal','Moderate','Meaningful','Significant'],
          descRarity:    ['Always on hand','Easy to arrange','Some planning needed','Significant logistics','Rare opportunity'],
        };
        const RDESC_LABELS = {
          descEffort:'Effort', descTime:'Time', descFinancial:'Cost', descRarity:'Access',
        };
        const RDESC_HINTS = {
          descEffort:    'How much physical or logistical effort this activity typically requires.',
          descTime:      'How long this activity typically takes from start to finish.',
          descFinancial: 'The typical ongoing financial cost — gear, fees, travel, maintenance.',
          descRarity:    'How hard is this activity to access — gear, logistics, weather, travel, or opportunity required.',
        };
        return ['descEffort','descTime','descFinancial','descRarity'].map(key => {
          const cur = f[key] || 1;
          const labels = RDESC_SCALES[key];
          return h('div',{style:{marginBottom:'14px'}},
            h('div',{style:{marginBottom:'5px'}},
              h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline'}},
                h('span',{style:{fontSize:'12px',color:'var(--text)',fontWeight:'500'}}, RDESC_LABELS[key]),
                h('span',{style:{fontSize:'11px',color:'var(--c-restore)'}}, labels[cur-1])
              ),
              h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',lineHeight:'1.4'}}, RDESC_HINTS[key])
            ),
            h('div',{style:{display:'flex',gap:'4px'}},
              ...[1,2,3,4,5].map(v=>h('button',{
                style:{flex:'1',padding:'7px 2px',borderRadius:'8px',fontSize:'11px',
                  border:'1px solid '+(cur===v?'rgba(79,168,196,0.6)':'var(--border)'),
                  background:cur===v?'rgba(79,168,196,0.12)':'var(--bg3)',
                  color:cur===v?'var(--c-restore)':'var(--muted)',cursor:'pointer'},
                onclick:()=>{f[key]=v;markDirty();render();}
              }, labels[v-1]))
            )
          );
        });
      })(),

      h('div',{style:{marginBottom:'12px',paddingTop:'12px',borderTop:'1px solid var(--border)',marginTop:'8px'}},
        h('div',{style:{fontSize:'14px',color:'var(--text)',fontWeight:'600',marginBottom:'3px',fontFamily:"'Libre Baskerville',serif"}},'Personal Needs'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',lineHeight:'1.5',marginBottom:'12px'}},
          'How strongly does this activity address each personal need? Ordered by your PN ranking in Config.'
        )
      ),
      ...(() => {
        const NEEDS_LABELS = ['None','Some','Moderate','High','Significant'];
        const rows = [];
        const orderedPN = S.personalNeedsRanking.map(val=>PERSONAL_NEEDS.find(n=>n.val===val)).filter(Boolean);
        orderedPN.forEach((need) => {
          const cur = (f.needsMap||{})[need.val] || 1;
          rows.push(h('div',{style:{marginBottom:'12px'}},
            h('div',{style:{marginBottom:'5px'}},
              h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline'}},
                h('span',{style:{fontSize:'12px',color:'var(--text)',fontWeight:'500'}},
                  need.icon ? h('span',{style:{marginRight:'6px',fontSize:'14px'}}, need.icon) : null,
                  need.label),
                h('span',{style:{fontSize:'11px',color:cur>1?'var(--c-restore)':'var(--muted)'}},NEEDS_LABELS[cur-1])
              ),
              h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',lineHeight:'1.4'}},need.hint)
            ),
            h('div',{style:{display:'flex',gap:'3px'}},
              ...[1,2,3,4,5].map(v=>h('button',{
                style:{flex:'1',padding:'5px 2px',borderRadius:'7px',fontSize:'10px',
                  border:'1px solid '+(cur===v?'rgba(79,168,196,0.6)':'var(--border)'),
                  background:cur===v?'rgba(79,168,196,0.12)':'var(--bg3)',
                  color:cur===v?'var(--c-restore)':'var(--muted)',cursor:'pointer'},
                onclick:()=>{f.needsMap={...(f.needsMap||{})};f.needsMap[need.val]=v;markDirty();render();}
              }, NEEDS_LABELS[v-1]))
            )
          ));
        });
        return rows;
      })(),

      // ── Scoring preview panel ───────────────────────────
      buildScoringPreviewPanel({
        currentType: {
          name: f.newType || '(this type)',
          descEffort: f.descEffort||1, descTime: f.descTime||1,
          descFinancial: f.descFinancial||1, descRarity: f.descRarity||1,
          descPresence: f.descPresence||1,
          needsMap: f.needsMap || {},
        },
        typeList: S.restoreTypes,
        weightFn: deriveRestoreWeight,
        minMult: 0.04, maxMult: 1.00,
        accentColor: 'var(--c-restore)',
        excludeName: isEditing ? nameVal : null,
      }),

      isEditing ? h('div',{style:{textAlign:'left',marginBottom:'12px'}},
        h('button',{
          style:{background:'none',border:'none',color:'var(--c-conflict)',fontSize:'12px',
            cursor:'pointer',padding:'4px 8px',opacity:'0.6',fontFamily:"'DM Sans',sans-serif"},
          onclick:()=>{
            S[listKey]=S[listKey].filter(t=>(typeof t==='string'?t:t.name)!==f.editTypeName);
            saveSettings();
            f.editTypeName=null;f.editInit=null;f.addingNew=false;f.newType='';f.newTypeDesc='';f.editTypeDirty=false;
            render();
          }
        },'Delete this type')
      ) : null,

      h('div',{style:{display:'flex',gap:'8px',marginTop:'8px'}},
        h('button',{
          style:{flex:'1',padding:'12px',borderRadius:'14px',border:'1px solid var(--border)',
            background:'var(--bg3)',color:'var(--muted)',fontSize:'13px',cursor:'pointer',
            fontFamily:"'DM Sans',sans-serif"},
          onclick:()=>{
            f.editTypeName=null;f.editInit=null;f.addingNew=false;f.newType='';f.newTypeDesc='';f.editTypeDirty=false;
            maybeReturnAfterAdd(null);
            render();
          }
        },'Cancel'),
        h('button',{
          class:'submit-btn', style:{flex:'2'},
          onclick:()=>{
            const nameInput = document.getElementById('activity-name-input');
            const v = (nameInput ? nameInput.value : f.newType||'').trim();
            if (!v) { if(nameInput) nameInput.focus(); return; }
            let newlyCreatedName = null;
            if (isAdding) {
              if (!list.find(t=>(typeof t==='string'?t:t.name)===v)) {
                newlyCreatedName = v;
                S[listKey].push({
                  name:v,
                  description: (f.newTypeDesc||'').trim()||undefined,
                  descEffort:f.descEffort||1, descTime:f.descTime||1,
                  descFinancial:f.descFinancial||1, descRarity:f.descRarity||1,
                  needsMap:{...(f.needsMap||{})}
                });
              }
            } else if (editTarget) {
              const oldName = typeof editTarget === 'string' ? editTarget : editTarget.name;
              if (typeof editTarget === 'string') {
                const idx = S[listKey].indexOf(editTarget);
                if (idx >= 0) S[listKey][idx] = {
                  name:v,
                  description: (f.newTypeDesc||'').trim()||undefined,
                  descEffort:f.descEffort||1, descTime:f.descTime||1,
                  descFinancial:f.descFinancial||1, descRarity:f.descRarity||1,
                  needsMap:{...(f.needsMap||{})}
                };
              } else {
                if (v) editTarget.name = v;
                editTarget.description  = (f.newTypeDesc||'').trim()||undefined;
                editTarget.descEffort   = f.descEffort||1;
                editTarget.descTime     = f.descTime||1;
                editTarget.descFinancial= f.descFinancial||1;
                editTarget.descRarity   = f.descRarity||1;
                editTarget.needsMap = {...(f.needsMap||{})};
              }
              // Migrate existing restore entries referencing the old name so a
              // rename carries history forward instead of orphaning entries.
              if (v && v !== oldName) {
                for (const e of (S.allEntries || [])) {
                  if (e.category === 'restore' && e.eventType === oldName) {
                    e.eventType = v;
                    dbPut('entries', e);
                  }
                }
                for (const e of (S.dayEntries || [])) {
                  if (e.category === 'restore' && e.eventType === oldName) e.eventType = v;
                }
              }
            }
            saveSettings();
            f.editTypeName=null;f.editInit=null;f.addingNew=false;f.newType='';f.newTypeDesc='';f.editTypeDirty=false;
            maybeReturnAfterAdd(newlyCreatedName);
            render();
          }
        }, isAdding?'Add type':'Save changes')
      )
    );
  };

  // When inline (Activities tab usage) AND a form is active, render the form
  // as a popup overlay over the list — otherwise the editor sits below all
  // existing items and the user can't see the list while editing.
  const formActive = !!(f.addingNew || f.editTypeName);
  const useFormPopup = inline && formActive && (isProfileType || isRestore);

  const inner = h('div',{},
    inline ? null : h('div',{class:'sheet-title'},title),
    h('div',{class:'manage-list'},...items),

    // ── Add new ──
    // In popup mode the form is rendered in the overlay below; here we only
    // show the "+ Add new" button (when nothing's active).
    isProfileType
      ? (useFormPopup ? null : (!f.editTypeName ? affectionAddForm() : null))
      : isRestore
        ? (useFormPopup ? null : (!f.editTypeName ? restoreAddForm() : null))
        : h('div',{},
            h('div',{class:'manage-add-row'},
              h('input',{type:'text',class:'form-input',placeholder:'New type…',value:f.newType,
                oninput:e=>{f.newType=e.target.value;},
                onkeydown:e=>{if(e.key==='Enter')add();}}),
              h('button',{class:'manage-add-btn',onclick:add},'Add')
            )
          ),

    // Only show Done when not in add/edit mode and not inline
    (!inline && !f.addingNew && !f.editTypeName) ? h('button',{class:'submit-btn',style:{marginTop:'16px'},onclick:()=>{
      f.addStep=1; f.newType=''; f.needsMap={}; openModal(returnModal);
    }},'Done') : null
  );

  // Popup overlay wrapping the active add/edit form. Click outside dismisses
  // (and resets the form state so the button reappears).
  if (useFormPopup) {
    const formContent = isProfileType ? affectionAddForm() : restoreAddForm();
    const dismiss = () => {
      f.editTypeName = null; f.editInit = null; f.addingNew = false;
      f.newType = ''; f.newTypeDesc = ''; f.editTypeDirty = false;
      maybeReturnAfterAdd(null);
      render();
    };
    const ov = h('div',{class:'overlay', id:'lib-popup-overlay'},
      h('div',{class:'sheet'},
        h('div',{class:'sheet-handle'}),
        formContent,
      )
    );
    const openedAt = Date.now();
    ov.addEventListener('click', e => {
      if (e.target === ov && Date.now() - openedAt > 300) dismiss();
    });
    // Portal to document.body — see note in buildManageCaretakerTypes.
    document.body.appendChild(ov);
    return inner;
  }

  return inline ? inner : overlay(inner);
}

