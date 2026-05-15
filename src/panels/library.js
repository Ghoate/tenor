'use strict';

/* ── Library Panel ──────────────────────────────────── */
function buildLibraryPanel() {
  const bondingCount   = S.affectionTypes.length;
  const intimacyCount  = S.physicalTypes.length;
  const restoreCount   = S.restoreTypes.length;
  const steadyingCount = S.caretakerTypes.length;
  const wobbleCount    = (S.challengingEmotionTags || []).length;
  const whomCount      = (S.whomList || []).length;

  const collapseAll = (except) => {
    if (except !== 'bonding')   { S.libBondingExpanded=false;   S.libBondingForm={}; }
    if (except !== 'intimacy')  { S.libIntimacyExpanded=false;  S.libIntimacyForm={}; }
    if (except !== 'restore')   { S.libRestoreExpanded=false;   S.libRestoreForm={}; }
    if (except !== 'steadying') { S.libSteadyingExpanded=false; S.libSteadyingForm={}; }
    if (except !== 'wobble')    { S.libWobbleExpanded=false;    S.libWobbleForm={}; }
    if (except !== 'whom')      { S.libWhomExpanded=false;      S.libWhomForm={}; }
    if (except !== 'landscape') { S.libLandscapeExpanded=false; }
  };
  return h('div',{class:'insights-panel'},

    // ── Bonding ──
    h('div',{class:'ins-section',style:{cursor:'pointer'},
      onclick:()=>{ const o=!S.libBondingExpanded; collapseAll('bonding'); S.libBondingExpanded=o; if(!o)S.libBondingForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'🩷 '+bondingLabel()+' event types'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(bondingCount>0?bondingCount+' type'+(bondingCount===1?'':'s'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libBondingExpanded?'▲':'▼')
        )
      )
    ),
    S.libBondingExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Add and edit the '+bondingLabel().toLowerCase()+' activity types available when logging.'),
      buildManageTypes('affectionTypes', 'affection', bondingLabel()+' Types', true, S.libBondingForm)
    ) : null,

    // ── Intimacy ──
    S.showPhysical ? h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libIntimacyExpanded; collapseAll('intimacy'); S.libIntimacyExpanded=o; if(!o)S.libIntimacyForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'🌹 Intimacy event types'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(intimacyCount>0?intimacyCount+' type'+(intimacyCount===1?'':'s'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libIntimacyExpanded?'▲':'▼')
        )
      )
    ) : null,
    S.showPhysical && S.libIntimacyExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Add and edit the intimacy event types available when logging.'),
      buildManageTypes('physicalTypes', 'physical', 'Intimacy Types', true, S.libIntimacyForm)
    ) : null,

    // ── Restorative ──
    h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libRestoreExpanded; collapseAll('restore'); S.libRestoreExpanded=o; if(!o)S.libRestoreForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'🌊 Restorative activity types'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(restoreCount>0?restoreCount+' type'+(restoreCount===1?'':'s'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libRestoreExpanded?'▲':'▼')
        )
      )
    ),
    S.libRestoreExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Add and edit the restorative activity types available when logging.'),
      buildManageTypes('restoreTypes', 'restore', 'Restorative Activities', true, S.libRestoreForm)
    ) : null,

    // ── Steadying ──
    S.showCaretaker ? h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libSteadyingExpanded; collapseAll('steadying'); S.libSteadyingExpanded=o; if(!o)S.libSteadyingForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'🕯️ Steadying types'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(steadyingCount>0?steadyingCount+' type'+(steadyingCount===1?'':'s'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libSteadyingExpanded?'▲':'▼')
        )
      )
    ) : null,
    S.showCaretaker && S.libSteadyingExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Add and edit the steadying types available when logging.'),
      buildManageCaretakerTypes(true, S.libSteadyingForm)
    ) : null,

    // ── Life Wobble emotion tags ──
    S.showRegulation ? h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libWobbleExpanded; collapseAll('wobble'); S.libWobbleExpanded=o; if(!o)S.libWobbleForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'🫧 Life Wobble emotion tags'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(wobbleCount>0?wobbleCount+' tag'+(wobbleCount===1?'':'s'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libWobbleExpanded?'▲':'▼')
        )
      )
    ) : null,
    S.showRegulation && S.libWobbleExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Manage emotion tags grouped by family. Tap any tag to rename, change its nervous system state, or delete it.'),
      (() => {
        if (!S.challengingEmotionTags) S.challengingEmotionTags = [...DEFAULT_CHALLENGING_EMOTION_TAGS];
        const tags = S.challengingEmotionTags;
        const f = S.libWobbleForm;
        if (f.newTag == null) f.newTag = '';
        if (f.editTagIdx == null) f.editTagIdx = -1;
        if (f.editTagVal == null) f.editTagVal = '';
        if (f.editTagDirty == null) f.editTagDirty = false;

        const countUsage = (tag) => {
          const cutoff = addDays(S.today, -59);
          let n = 0;
          for (const e of S.allEntries) {
            if (e.date < cutoff || e.date > S.today) continue;
            if (e.category !== 'regulation') continue;
            if (Array.isArray(e.regulationEmotions) ? e.regulationEmotions.includes(tag) : e.regulationEmotions === tag) n++;
          }
          return n;
        };

        const renderTag = (tag) => {
          const realIdx = tags.indexOf(tag);
          const isEditing = f.editTagIdx === realIdx;
          const isDirtyOther = f.editTagDirty && !isEditing;
          const pvState = tagToPolyvagal(tag);
          const pvLabel = pvState === 'activated' ? 'Activated' : pvState === 'withdrawal' ? 'Withdrawal' : 'Mixed';
          return h('div',{
            style:{display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'6px 0',borderBottom:'1px solid var(--border)',gap:'8px',
              cursor: isEditing ? 'default' : (f.editTagDirty ? 'default' : 'pointer'),
              opacity: isDirtyOther ? '0.4' : '1'},
            onclick: isEditing ? null : (ev) => {
              if (ev.target.closest('button,select')) return;
              if (f.editTagDirty) return;
              if (f.editTagIdx === realIdx) { f.editTagIdx = -1; f.editTagVal = ''; render(); return; }
              f.editTagIdx = realIdx; f.editTagVal = tag; f.editTagDirty = false; render();
            }
          },
            isEditing
              ? h('input',{
                  id:'edit-tag-input-challengingEmotionTags', type:'text', value: f.editTagVal,
                  style:{flex:'1',background:'var(--bg3)',border:'1px solid var(--border-mid)',
                    borderRadius:'8px',padding:'7px 10px',fontSize:'13px',
                    color:'var(--text)',outline:'none',fontFamily:"'DM Sans',sans-serif"},
                  oninput: e => { f.editTagVal = e.target.value; f.editTagDirty = true; },
                  onkeydown: e => {
                    if (e.key === 'Enter') {
                      const val = e.target.value.trim();
                      if (val && !tags.some((t,i) => t===val && i!==realIdx)) {
                        S.challengingEmotionTags[realIdx] = val;
                        f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false;
                        saveSettings(); render();
                      }
                    }
                    if (e.key === 'Escape') { f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false; render(); }
                  }
                })
              : h('span',{style:{fontSize:'13px',color:'var(--text)',flex:'1',fontWeight: starredTags.has(tag) ? '600' : '400'}},
                  tag,
                  (() => { const n = countUsage(tag); return n > 0 ? h('span',{style:{fontSize:'11px',color:'var(--muted)',marginLeft:'8px',fontWeight:'400'}}, n+'×') : null; })()
                ),
            isEditing
              ? h('div',{style:{display:'flex',alignItems:'center',gap:'6px',flexShrink:'0'}},
                  h('select',{
                    class:'form-input',
                    style:{width:'auto',padding:'4px 6px',fontSize:'11px',cursor:'pointer',flexShrink:'0'},
                    onclick: ev => ev.stopPropagation(),
                    onchange: ev => {
                      if (!S.tagPolyvagalOverrides) S.tagPolyvagalOverrides = {};
                      S.tagPolyvagalOverrides[tag] = ev.target.value;
                      saveSettings();
                    },
                  },
                    h('option',{value:'activated',  selected: pvState==='activated'},  'Activated'),
                    h('option',{value:'withdrawal', selected: pvState==='withdrawal'}, 'Withdrawal'),
                    h('option',{value:'mixed',      selected: pvState==='mixed'},      'Mixed')
                  ),
                  h('button',{style:{background:'none',border:'none',color:'var(--c-wobble)',fontSize:'12px',cursor:'pointer',padding:'4px 8px',fontFamily:"'DM Sans',sans-serif",fontWeight:'500'},
                    onclick:()=>{
                      const val = f.editTagVal.trim();
                      if (val && !tags.some((t,i)=>t===val&&i!==realIdx)) S.challengingEmotionTags[realIdx] = val;
                      f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false;
                      saveSettings(); render();
                    }}, 'Save'),
                  h('button',{style:{background:'none',border:'none',color:'var(--muted)',fontSize:'12px',cursor:'pointer',padding:'4px 8px',fontFamily:"'DM Sans',sans-serif"},
                    onclick:()=>{ f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false; render(); }}, 'Cancel'),
                  h('button',{style:{background:'none',border:'none',color:'var(--c-conflict)',fontSize:'12px',cursor:'pointer',padding:'4px 8px',opacity:'0.6',fontFamily:"'DM Sans',sans-serif"},
                    onclick:()=>{
                      S.challengingEmotionTags = tags.filter((_,i) => i !== realIdx);
                      f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false;
                      saveSettings(); render();
                    }}, 'Delete')
                )
              : h('div',{style:{display:'flex',alignItems:'center',gap:'8px',flexShrink:'0'}},
                  h('span',{style:{fontSize:'11px',color:'var(--muted)',flexShrink:'0'}}, pvLabel),
                  h('span',{style:{fontSize:'11px',color:'var(--muted)'}},'tap to edit'),
                  h('button',{
                    style:{background:'none',border:'none',color:'var(--muted)',fontSize:'14px',
                      cursor:'pointer',padding:'0 2px',lineHeight:'1',fontFamily:"'DM Sans',sans-serif",
                      opacity:'0.5'},
                    onclick: ev => {
                      ev.stopPropagation();
                      S.challengingEmotionTags = tags.filter((_,i) => i !== realIdx);
                      f.editTagIdx = -1; f.editTagVal = ''; f.editTagDirty = false;
                      saveSettings(); render();
                    }
                  }, '×')
                )
          );
        };

        // Build set of starred (default) tags across all families
        const starredTags = new Set();
        for (const preset of Object.values(EMOTION_TONE_PRESETS)) {
          for (const p of preset) { if (p.starred) starredTags.add(p.tag); }
        }

        // Group tags by tone — check tagToneOverrides first for custom-assigned tags
        const byFamily = {};
        for (const fam of EMOTION_TONES) byFamily[fam.val] = [];
        byFamily['other'] = [];
        for (const tag of tags) {
          const fv = (S.tagToneOverrides && S.tagToneOverrides[tag]) || TAG_TO_EMOTION_TONE[tag] || 'other';
          (byFamily[fv] || byFamily['other']).push(tag);
        }

        const familyCards = EMOTION_TONES.map(fam => {
          const famTags = (byFamily[fam.val] || []).slice().sort((a,b) => a.localeCompare(b));
          const preset = EMOTION_TONE_PRESETS[fam.val] || null;
          const presetTags = preset ? preset.map(p => p.tag) : [];
          const missingFromPreset = preset ? preset.filter(p => !tags.includes(p.tag)) : [];
          const allPresetPresent = preset && missingFromPreset.length === 0;

          const prefillBtn = preset
            ? h('button',{
                style:{background:'none',border:'1px solid var(--border)',borderRadius:'6px',
                  color: allPresetPresent ? 'var(--muted)' : 'var(--text)',
                  fontSize:'11px',cursor:'pointer',padding:'3px 8px',
                  fontFamily:"'DM Sans',sans-serif",flexShrink:'0'},
                onclick: ev => {
                  ev.stopPropagation();
                  if (allPresetPresent) {
                    // Remove non-starred preset tags only; keep defaults and custom/renamed tags
                    S.challengingEmotionTags = S.challengingEmotionTags.filter(t => !presetTags.includes(t) || starredTags.has(t));
                  } else {
                    const next = [...S.challengingEmotionTags];
                    for (const p of missingFromPreset) {
                      next.push(p.tag);
                      if (!S.tagPolyvagalOverrides) S.tagPolyvagalOverrides = {};
                      if (!S.tagPolyvagalOverrides[p.tag]) S.tagPolyvagalOverrides[p.tag] = p.pv;
                    }
                    S.challengingEmotionTags = next;
                  }
                  saveSettings(); render();
                }
              }, allPresetPresent ? 'Remove pre-fill' : 'Pre-fill all')
            : null;

          // Always-visible add row for families that have a preset
          const addKey = 'famNewTag_' + fam.val;
          // Default polyvagal state for new tags — majority pv among starred entries
          const famDefaultPv = (() => {
            if (!preset) return null;
            const counts = {};
            for (const p of preset) if (p.starred) counts[p.pv] = (counts[p.pv]||0) + 1;
            const top = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
            return top ? top[0] : 'activated';
          })();
          const addNewTag = (val) => {
            if (!val || tags.includes(val)) return;
            S.challengingEmotionTags = [...tags, val];
            if (!S.tagToneOverrides) S.tagToneOverrides = {};
            S.tagToneOverrides[val] = fam.val;
            if (famDefaultPv) {
              if (!S.tagPolyvagalOverrides) S.tagPolyvagalOverrides = {};
              if (!S.tagPolyvagalOverrides[val]) S.tagPolyvagalOverrides[val] = famDefaultPv;
            }
            f[addKey] = '';
            saveSettings(); render();
          };
          const addRow = preset
            ? h('div',{style:{display:'flex',gap:'6px',marginTop:'8px'}},
                h('input',{
                  id:'fam-add-input-'+fam.val, type:'text', placeholder:'New tag…',
                  value: f[addKey]||'',
                  style:{flex:'1',background:'var(--surface-1)',border:'1px solid var(--border)',
                    borderRadius:'8px',padding:'7px 10px',fontSize:'12px',
                    color:'var(--text)',outline:'none',fontFamily:"'DM Sans',sans-serif"},
                  oninput: e => { f[addKey] = e.target.value; },
                  onkeydown: e => {
                    if (e.key === 'Enter') {
                      const inp = document.getElementById('fam-add-input-'+fam.val);
                      addNewTag((inp ? inp.value : f[addKey]||'').trim());
                    }
                  }
                }),
                h('button',{
                  style:{background:'var(--c-wobble)',border:'none',borderRadius:'8px',
                    color:'#fff',fontSize:'12px',cursor:'pointer',padding:'7px 12px',
                    fontFamily:"'DM Sans',sans-serif",fontWeight:'500',flexShrink:'0'},
                  onclick: () => {
                    const inp = document.getElementById('fam-add-input-'+fam.val);
                    addNewTag((inp ? inp.value : f[addKey]||'').trim());
                  }
                }, 'Add')
              )
            : null;

          return h('div',{style:{
            padding:'10px 12px',borderRadius:'10px',
            background:'var(--bg3)',border:'1px solid var(--border)',marginBottom:'8px',
          }},
            h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom: famTags.length > 0 ? '6px' : '0'}},
              h('div',{style:{flex:'1',minWidth:'0'}},
                h('span',{style:{fontSize:'12px',fontWeight:'600',color:'var(--text)'}}, fam.label),
                fam.desc ? h('span',{style:{fontSize:'11px',color:'var(--muted)',marginLeft:'6px'}}, fam.desc) : null
              ),
              prefillBtn
            ),
            famTags.length > 0
              ? h('div',{}, ...famTags.map(renderTag))
              : h('div',{style:{fontSize:'11px',color:'var(--muted)',fontStyle:'italic',paddingTop:'2px'}},'No tags yet'),
            addRow
          );
        });

        const otherTags = (byFamily['other'] || []).slice().sort((a,b) => a.localeCompare(b));
        const otherCard = otherTags.length > 0
          ? h('div',{style:{padding:'10px 12px',borderRadius:'10px',background:'var(--bg3)',border:'1px solid var(--border)',marginBottom:'8px'}},
              h('div',{style:{fontSize:'12px',fontWeight:'600',color:'var(--muted)',marginBottom:'6px'}},'Other'),
              h('div',{}, ...otherTags.map(renderTag))
            )
          : null;

        return h('div',{},
          ...familyCards,
          otherCard,
          h('div',{style:{display:'flex',gap:'8px',marginTop:'4px',marginBottom:'16px'}},
            h('input',{
              id:'manage-tag-input-challengingEmotionTags', type:'text', placeholder:'New tag…',
              value: f.newTag||'',
              style:{flex:'1',background:'var(--bg3)',border:'1px solid var(--border)',
                borderRadius:'10px',padding:'10px 12px',fontSize:'13px',
                color:'var(--text)',outline:'none',fontFamily:"'DM Sans',sans-serif"},
              oninput: e => { f.newTag = e.target.value; },
              onkeydown: e => {
                if (e.key === 'Enter') {
                  const val = e.target.value.trim();
                  if (val && !tags.includes(val)) { S.challengingEmotionTags = [...tags, val]; f.newTag = ''; saveSettings(); render(); }
                }
              }
            }),
            h('button',{class:'submit-btn',style:{flexShrink:'0'},
              onclick:()=>{
                const val = (f.newTag||'').trim();
                if (val && !tags.includes(val)) { S.challengingEmotionTags = [...tags, val]; f.newTag = ''; saveSettings(); render(); }
              }
            }, 'Add')
          )
        );
      })()
    ) : null,

    // ── Whom (people you log moments with) ──
    // Only visible in dating mode — committed mode has no surface that uses
    // the Whom list, so the section would be vestigial there.
    S.relationshipMode === 'dating' ? h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libWhomExpanded; collapseAll('whom'); S.libWhomExpanded=o; if(!o)S.libWhomForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'👤 Whom'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(whomCount>0?whomCount+' name'+(whomCount===1?'':'s'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libWhomExpanded?'▲':'▼')
        )
      )
    ) : null,
    S.relationshipMode === 'dating' && S.libWhomExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Names of people you log moments with — friends, family, dates, anyone close. Used by entry types that ask "with whom".'),
      buildManageTagList('whomList', DEFAULT_WHOM_LIST, 'Whom', 'var(--interactive)', 'library', true, S.libWhomForm,
        {field:'whom'})
    ) : null,

    // ── Scoring landscape ──
    // Cross-category calibration view: how negative loads (Conflict, Turn Down)
    // compare to positive contributions (Restorative). Helps users sense the
    // scale of activities they create vs. the load events impose.
    h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libLandscapeExpanded; collapseAll('landscape'); S.libLandscapeExpanded=o; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'📐 Scoring landscape'),
        h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libLandscapeExpanded?'▲':'▼')
      )
    ),
    S.libLandscapeExpanded ? (() => {
      // Build the data
      const fmt = n => n < 0.05 ? '0.0' : n.toFixed(1);

      // ── Static-range entries (no user-defined types) ──
      // Conflict: -(harm × intensityMult × geomean(conduct, resolution) × invCap / 5) × 100
      //   harm 1-5, all multipliers 0.20-1.00. Min: -0.8, Max: -100
      // Turn Down: -(impact × sigM × howM × invCap / 5) × 100
      //   impact 1-5, multipliers 0.20-1.00. Min: -0.8, Max: -100
      // Wobble: -(intensity × resolutionMult × invCap / 5) × 100
      //   intensity 1-5, resolution 0.20-1.00. Min: -4, Max: -100
      const staticConflict  = { name: 'Conflict',     min: 0.8, max: 100 };
      const staticTurndown  = { name: 'Turn Down',    min: 0.8, max: 100 };
      const staticWobble    = { name: 'Life Wobble',  min: 4,   max: 100 };

      // Helper: pick low/mid/high from a sorted-by-weight array
      const pickThree = (entries) => {
        if (entries.length === 0) return [];
        if (entries.length <= 3) return entries;
        const lowIdx = 0;
        const highIdx = entries.length - 1;
        const midIdx = Math.floor(entries.length / 2);
        return [entries[lowIdx], entries[midIdx], entries[highIdx]];
      };

      // Helper: build score-range entries from a type list using a weight fn
      // and a min multiplier. Max multiplier is always 1.00 (peak quality+immersion).
      // Hidden types are excluded — they're not active in the user's tracking.
      const buildSamples = (typeList, weightFn, minMult) => {
        const entries = (typeList || [])
          .filter(t => typeof t === 'object' && t && t.name && !t.hidden)
          .map(t => {
            const raw = weightFn(t);
            return {
              name: t.name,
              min: (raw * minMult / SCORE_MAX_RAW) * 100,
              max: (raw * 1.00 / SCORE_MAX_RAW) * 100,
              weight: raw,
            };
          })
          .sort((a, b) => a.weight - b.weight);
        return pickThree(entries);
      };

      // Restorative: min mult 0.04 (immersion 0.20 × quality 0.20)
      const restoreSamples  = buildSamples(S.restoreTypes,    deriveRestoreWeight,    0.04);
      // Steadying: min mult 0.04 (intensity 0.20 × geomean(time,drain,outcome) 0.20)
      const steadyingSamples = buildSamples(S.caretakerTypes, deriveCaretakerWeight,  0.04);
      // Bonding & Intimacy: min mult 0.20 (single connection-quality knob)
      const bondingSamples  = buildSamples(S.affectionTypes, deriveActivityWeight,   0.20);
      const intimacySamples = buildSamples(
        // Exclude solo types — they don't score against any balance
        (S.physicalTypes || []).filter(t => typeof t === 'object' && t && !t.defaultSolo),
        deriveActivityWeight,
        0.20
      );

      // Layout pieces — same visual language as buildScoringPreviewPanel
      const cols = '1fr 130px';
      const headStyle = {
        fontSize:'10px', color:'var(--muted)',
        letterSpacing:'0.06em', textTransform:'uppercase',
        fontWeight:'500', padding:'0 0 6px',
      };
      const numStyle = (color) => ({
        fontSize:'12px', color,
        fontFamily:"'Libre Baskerville',serif", textAlign:'right',
      });
      const nameStyle = {
        fontSize:'12px', color:'var(--text)',
      };

      const sectionTitle = label => h('div',{style:{
        fontSize:'13px', color:'var(--text)', fontWeight:'600',
        marginTop:'18px', marginBottom:'8px',
        fontFamily:"'Libre Baskerville',serif",
      }}, label);

      const subTitle = label => h('div',{style:{
        fontSize:'11px', color:'var(--text)', fontWeight:'600',
        marginTop:'12px', marginBottom:'4px',
        letterSpacing:'0.04em', textTransform:'uppercase',
      }}, label);

      const headerRow = () => h('div',{style:{
        display:'grid', gridTemplateColumns: cols,
        gap:'8px', borderBottom:'1px solid var(--border)',
      }},
        h('div',{style:headStyle}, 'Name'),
        h('div',{style:{...headStyle, textAlign:'right'}}, 'Score range'),
      );

      const dataRow = (name, rangeText, color) => h('div',{style:{
        display:'grid', gridTemplateColumns: cols,
        gap:'8px', padding:'5px 0',
      }},
        h('div',{style:nameStyle}, name),
        h('div',{style:numStyle(color)}, rangeText),
      );

      const negRange = (entry) => '−' + fmt(entry.min) + ' to −' + fmt(entry.max);
      const posRange = (entry) => fmt(entry.min) + ' – ' + fmt(entry.max);

      const emptyRow = (label) => h('div',{style:{
        padding:'6px 0',fontSize:'11px',color:'var(--muted)',fontStyle:'italic',
      }}, label);

      return h('div',{style:{
        margin:'4px 0 14px', padding:'12px 14px',
        borderRadius:'10px', background:'var(--bg2)', border:'1px solid var(--border)',
      }},
        h('div',{style:{
          fontSize:'12px', color:'var(--muted)', lineHeight:'1.5', marginBottom:'10px',
        }}, 'Per-entry score ranges across your library — for calibration.'),

        // ── Relational section ──
        sectionTitle('Relational balance'),
        headerRow(),
        dataRow(staticConflict.name, negRange(staticConflict), 'var(--c-conflict)'),
        dataRow(staticTurndown.name, negRange(staticTurndown), 'var(--c-turndown)'),
        // Bonding samples
        bondingSamples.length > 0 ? subTitle(bondingLabel()) : null,
        ...(bondingSamples.length > 0
          ? bondingSamples.map(s => dataRow(s.name, posRange(s), 'var(--c-affection)'))
          : []),
        // Intimacy samples (only if showPhysical)
        S.showPhysical && intimacySamples.length > 0 ? subTitle('Intimacy') : null,
        ...(S.showPhysical && intimacySamples.length > 0
          ? intimacySamples.map(s => dataRow(s.name, posRange(s), 'var(--c-physical)'))
          : []),
        bondingSamples.length === 0 && (!S.showPhysical || intimacySamples.length === 0)
          ? emptyRow('No relational positive types defined yet.')
          : null,

        // ── Personal section ──
        sectionTitle('Personal balance'),
        headerRow(),
        // Wobble (static, only if enabled)
        S.showRegulation ? dataRow(staticWobble.name, negRange(staticWobble), 'var(--c-regulation)') : null,
        // Steadying samples (only if enabled)
        S.showCaretaker && steadyingSamples.length > 0 ? subTitle('Steadying') : null,
        ...(S.showCaretaker && steadyingSamples.length > 0
          ? steadyingSamples.map(s => dataRow(s.name, negRange(s), 'var(--c-burnout)'))
          : []),
        // Restorative samples
        restoreSamples.length > 0 ? subTitle('Restorative') : null,
        ...(restoreSamples.length > 0
          ? restoreSamples.map(s => dataRow(s.name, posRange(s), 'var(--c-restore)'))
          : []),
        restoreSamples.length === 0 && (!S.showCaretaker || steadyingSamples.length === 0) && !S.showRegulation
          ? emptyRow('No personal types or events enabled yet.')
          : null,

        h('div',{style:{
          fontSize:'10px', color:'var(--muted)', marginTop:'10px',
          paddingTop:'10px', borderTop:'1px solid var(--border)',
          lineHeight:'1.5',
        }}, 'Negative ranges affect the relational or personal balance as loads; positive ranges add. They\'re not directly comparable across the two balance sheets — they live separately — but the relative magnitudes within each sheet help calibrate impact.')
      );
    })() : null

  );
}
