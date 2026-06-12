'use strict';

/* ── Library Panel ──────────────────────────────────── */
function buildLibraryPanel() {
  const bondingCount   = S.affectionTypes.length;
  const intimacyCount  = S.physicalTypes.length;
  const restoreCount   = S.restoreTypes.length;
  const steadyingCount = S.caretakerTypes.length;
  const socialCount    = (S.socialTypes || []).length;
  const wobbleCount    = (S.challengingEmotionTags || []).length;
  const isIndividual   = S.relationshipMode === 'individual';
  const showSocial     = isIndividual || S.trackSocialAxis;

  const collapseAll = (except) => {
    if (except !== 'bonding')   { S.libBondingExpanded=false;   S.libBondingForm={}; }
    if (except !== 'social')    { S.libSocialExpanded=false;    S.libSocialForm={}; }
    if (except !== 'intimacy')  { S.libIntimacyExpanded=false;  S.libIntimacyForm={}; }
    if (except !== 'restore')   { S.libRestoreExpanded=false;   S.libRestoreForm={}; }
    if (except !== 'steadying') { S.libSteadyingExpanded=false; S.libSteadyingForm={}; }
    if (except !== 'wobble')    { S.libWobbleExpanded=false;    S.libWobbleForm={}; }
    if (except !== 'landscape') { S.libLandscapeExpanded=false; }
  };
  return h('div',{class:'insights-panel'},

    // ── Bonding ──
    S.showBonding ? h('div',{class:'ins-section',style:{cursor:'pointer'},
      onclick:()=>{ const o=!S.libBondingExpanded; collapseAll('bonding'); S.libBondingExpanded=o; if(!o)S.libBondingForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'🩷 '+bondingLabel()+' activities'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(bondingCount>0?bondingCount+' activit'+(bondingCount===1?'y':'ies'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libBondingExpanded?'▲':'▼')
        )
      )
    ) : null,
    S.showBonding && S.libBondingExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Add and edit the '+bondingLabel().toLowerCase()+' activities available when logging.'),
      buildManageTypes('affectionTypes', 'affection', bondingLabel()+' Activities', true, S.libBondingForm)
    ) : null,

    // ── Social (Individual mode, or Partner/Dating with trackSocialAxis) ──
    showSocial ? h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libSocialExpanded; collapseAll('social'); S.libSocialExpanded=o; if(!o)S.libSocialForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'🫂 Social activities'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(socialCount>0?socialCount+' activit'+(socialCount===1?'y':'ies'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libSocialExpanded?'▲':'▼')
        )
      )
    ) : null,
    showSocial && S.libSocialExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Add and edit the social activities — time with friends, family, community — that you want to track. Profiles are scored against your Social Needs ranking.'),
      buildManageTypes('socialTypes', null, 'Social Activities', true, S.libSocialForm)
    ) : null,

    // ── Intimacy ──
    S.showPhysical ? h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libIntimacyExpanded; collapseAll('intimacy'); S.libIntimacyExpanded=o; if(!o)S.libIntimacyForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'🌹 Intimacy activities'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(intimacyCount>0?intimacyCount+' activit'+(intimacyCount===1?'y':'ies'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libIntimacyExpanded?'▲':'▼')
        )
      )
    ) : null,
    S.showPhysical && S.libIntimacyExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Add and edit the intimacy activities available when logging.'),
      buildManageTypes('physicalTypes', 'physical', 'Intimacy Activities', true, S.libIntimacyForm)
    ) : null,

    // ── Restorative ──
    h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libRestoreExpanded; collapseAll('restore'); S.libRestoreExpanded=o; if(!o)S.libRestoreForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'🌊 Restorative activities'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(restoreCount>0?restoreCount+' activit'+(restoreCount===1?'y':'ies'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libRestoreExpanded?'▲':'▼')
        )
      )
    ),
    S.libRestoreExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Add and edit the restorative activities available when logging.'),
      buildManageTypes('restoreTypes', 'restore', 'Restorative Activities', true, S.libRestoreForm)
    ) : null,

    // ── Steadying ──
    S.showCaretaker ? h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libSteadyingExpanded; collapseAll('steadying'); S.libSteadyingExpanded=o; if(!o)S.libSteadyingForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'💨 Steadying profiles'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'8px'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},(steadyingCount>0?steadyingCount+' profile'+(steadyingCount===1?'':'s'):'none')),
          h('span',{style:{color:'var(--muted)',fontSize:'13px'}},S.libSteadyingExpanded?'▲':'▼')
        )
      )
    ) : null,
    S.showCaretaker && S.libSteadyingExpanded ? h('div',{},
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},'Add and edit the steadying profiles available when logging.'),
      buildManageCaretakerTypes(true, S.libSteadyingForm)
    ) : null,

    // ── Wobble emotion tags ──
    S.showRegulation ? h('div',{class:'ins-section',style:{cursor:'pointer',marginTop:'8px'},
      onclick:()=>{ const o=!S.libWobbleExpanded; collapseAll('wobble'); S.libWobbleExpanded=o; if(!o)S.libWobbleForm={}; render(); }},
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between'}},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'🌪️ Wobble emotion tags'),
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

        const renderTag = (tag, isLast) => {
          const realIdx = tags.indexOf(tag);
          const isEditing = f.editTagIdx === realIdx;
          const isDirtyOther = f.editTagDirty && !isEditing;
          const pvState = tagToPolyvagal(tag);
          const pvLabel = pvState === 'activated' ? 'Activated' : pvState === 'withdrawal' ? 'Withdrawal' : 'Mixed';
          return h('div',{
            style:{display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'7px 0',borderBottom: isLast ? 'none' : '1px solid var(--border)',gap:'8px',
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
              : h('span',{style:{fontSize:'13px',color:'var(--text)',flex:'1'}},
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
              : h('div',{style:{display:'flex',alignItems:'center',gap:'10px',flexShrink:'0'}},
                  h('span',{style:{fontSize:'10px',letterSpacing:'0.04em',textTransform:'uppercase',
                    color:'var(--muted)',border:'1px solid var(--border)',borderRadius:'10px',
                    padding:'2px 8px',whiteSpace:'nowrap'}}, pvLabel),
                  h('button',{
                    style:{background:'none',border:'none',color:'var(--muted)',fontSize:'15px',
                      cursor:'pointer',padding:'0 2px',lineHeight:'1',fontFamily:"'DM Sans',sans-serif",
                      opacity:'0.45'},
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

          const presentCount = preset ? preset.filter(p => tags.includes(p.tag)).length : 0;
          const prefillBtn = preset
            ? h('button',{
                style:{background:'none',border:'1px solid var(--border)',borderRadius:'6px',
                  color:'var(--text)',
                  fontSize:'11px',cursor:'pointer',padding:'3px 8px',
                  fontFamily:"'DM Sans',sans-serif",flexShrink:'0'},
                onclick: ev => {
                  ev.stopPropagation();
                  S.modal = 'wobble-presets';
                  S._wobblePresetFam = fam.val;
                  render();
                }
              }, `Browse list (${presentCount}/${preset.length})`)
            : null;

          return h('div',{style:{
            padding:'12px 14px',borderRadius:'10px',
            background:'var(--bg3)',border:'1px solid var(--border)',
            borderLeft:'3px solid '+fam.color,marginBottom:'10px',
          }},
            h('div',{style:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'10px',marginBottom: famTags.length > 0 ? '8px' : '0'}},
              h('div',{style:{flex:'1',minWidth:'0'}},
                h('div',{style:{fontSize:'11px',fontWeight:'700',letterSpacing:'0.07em',textTransform:'uppercase',color:fam.color}}, fam.label),
                fam.desc ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'3px',lineHeight:'1.4'}}, fam.desc) : null
              ),
              prefillBtn
            ),
            famTags.length > 0
              ? h('div',{}, ...famTags.map((t,i)=>renderTag(t, i===famTags.length-1)))
              : h('div',{style:{fontSize:'11px',color:'var(--muted)',fontStyle:'italic',padding:'4px 0 2px'}},'No tags yet — open Browse list to add')
          );
        });

        const otherTags = (byFamily['other'] || []).slice().sort((a,b) => a.localeCompare(b));
        const otherCard = otherTags.length > 0
          ? h('div',{style:{padding:'12px 14px',borderRadius:'10px',background:'var(--bg3)',border:'1px solid var(--border)',borderLeft:'3px solid var(--muted)',marginBottom:'10px'}},
              h('div',{style:{fontSize:'11px',fontWeight:'700',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'8px'}},'Other'),
              h('div',{}, ...otherTags.map((t,i)=>renderTag(t, i===otherTags.length-1)))
            )
          : null;

        return h('div',{},
          ...familyCards,
          otherCard,
          h('div',{style:{borderTop:'1px solid var(--border)',margin:'18px 0 0'}}),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',margin:'14px 0 8px',lineHeight:'1.5'}},
            'Add a tag that doesn’t fit any family above — it will appear under “Other.”'),
          h('div',{style:{display:'flex',gap:'8px',marginBottom:'16px'}},
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
            }, 'Add other')
          )
        );
      })()
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
      const staticWobble    = { name: 'Wobble',  min: 4,   max: 100 };

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
        // Show only sections whose category toggles are enabled.
        (() => {
          const showRel =
            S.showConflict || S.showPhysical || S.showBonding;
          if (!showRel) return null;
          return h('div',{},
            sectionTitle('Relational balance'),
            headerRow(),
            S.showConflict ? dataRow(staticConflict.name, negRange(staticConflict), 'var(--c-conflict)') : null,
            S.showPhysical ? dataRow(staticTurndown.name, negRange(staticTurndown), 'var(--c-turndown)') : null,
            // Bonding samples
            S.showBonding && bondingSamples.length > 0 ? subTitle(bondingLabel()) : null,
            ...(S.showBonding && bondingSamples.length > 0
              ? bondingSamples.map(s => dataRow(s.name, posRange(s), 'var(--c-affection)'))
              : []),
            // Intimacy samples
            S.showPhysical && intimacySamples.length > 0 ? subTitle('Intimacy') : null,
            ...(S.showPhysical && intimacySamples.length > 0
              ? intimacySamples.map(s => dataRow(s.name, posRange(s), 'var(--c-physical)'))
              : []),
            (!S.showBonding || bondingSamples.length === 0) && (!S.showPhysical || intimacySamples.length === 0)
              ? emptyRow('No relational positive types defined yet.')
              : null,
          );
        })(),

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

// Per-family preset browser for Wobble emotion tags. Lets the user
// add/remove individual preset tags instead of the old all-or-nothing
// pre-fill, so cherry-picking one or two isn't burdensome.
function buildWobblePresetModal() {
  const fam = EMOTION_TONES.find(x => x.val === S._wobblePresetFam);
  if (!fam) return overlay(h('div',{},
    h('div',{class:'sheet-title'},'Emotion tags'),
    h('button',{class:'sec-btn',style:{width:'100%'},onclick:()=>closeModal()},'Close')
  ));

  const preset = EMOTION_TONE_PRESETS[fam.val] || [];
  const tags   = S.challengingEmotionTags || (S.challengingEmotionTags = []);
  const presetTags = preset.map(p => p.tag);
  const present = preset.filter(p => tags.includes(p.tag)).length;
  const pvLabel = pv => pv === 'activated' ? 'Activated' : pv === 'withdrawal' ? 'Withdrawal' : 'Mixed';

  const addTag = p => {
    if (!tags.includes(p.tag)) {
      S.challengingEmotionTags = [...tags, p.tag];
      if (!S.tagPolyvagalOverrides) S.tagPolyvagalOverrides = {};
      if (!S.tagPolyvagalOverrides[p.tag]) S.tagPolyvagalOverrides[p.tag] = p.pv;
      saveSettings(); render();
    }
  };
  const removeTag = p => {
    S.challengingEmotionTags = tags.filter(t => t !== p.tag);
    saveSettings(); render();
  };

  // Default polyvagal state for a custom tag — majority pv among the
  // family's starred presets.
  const famDefaultPv = (() => {
    const counts = {};
    for (const p of preset) if (p.starred) counts[p.pv] = (counts[p.pv]||0) + 1;
    const top = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
    return top ? top[0] : 'activated';
  })();
  if (S._wobblePresetNewTag == null) S._wobblePresetNewTag = '';
  const addCustom = (val) => {
    val = (val || '').trim();
    if (!val || tags.includes(val)) { S._wobblePresetNewTag = ''; render(); return; }
    S.challengingEmotionTags = [...tags, val];
    if (!S.tagToneOverrides) S.tagToneOverrides = {};
    S.tagToneOverrides[val] = fam.val;
    if (!S.tagPolyvagalOverrides) S.tagPolyvagalOverrides = {};
    if (!S.tagPolyvagalOverrides[val]) S.tagPolyvagalOverrides[val] = famDefaultPv;
    S._wobblePresetNewTag = '';
    saveSettings(); render();
  };

  return overlay(h('div',{},
    h('div',{class:'sheet-title'}, fam.label + ' emotion tags'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'4px',marginTop:'-4px',lineHeight:'1.5'}},
      'Tap a tag to add or remove it from your Wobble list. Only the ones you pick are added.'),
    h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}},
      h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, present + ' of ' + preset.length + ' in your list'),
      h('div',{style:{display:'flex',gap:'10px'}},
        h('span',{style:{fontSize:'11px',color:fam.color,cursor:'pointer',fontWeight:'500'},
          onclick:()=>{
            const next=[...tags];
            for (const p of preset) if (!next.includes(p.tag)) {
              next.push(p.tag);
              if (!S.tagPolyvagalOverrides) S.tagPolyvagalOverrides = {};
              if (!S.tagPolyvagalOverrides[p.tag]) S.tagPolyvagalOverrides[p.tag] = p.pv;
            }
            S.challengingEmotionTags=next; saveSettings(); render();
          }}, 'Add all'),
        h('span',{style:{fontSize:'11px',color:'var(--muted)',cursor:'pointer'},
          onclick:()=>{ S.challengingEmotionTags = tags.filter(t => !presetTags.includes(t)); saveSettings(); render(); }},
          'Remove all')
      )
    ),
    h('div',{style:{display:'flex',flexDirection:'column',gap:'6px'}},
      ...preset.map(p => {
        const sel = tags.includes(p.tag);
        return h('div',{
          style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',
            padding:'10px 12px',borderRadius:'10px',cursor:'pointer',
            border:'1px solid '+(sel ? fam.color : 'var(--border)'),
            background: sel ? fam.color+'1f' : 'var(--bg3)'},
          onclick:()=> sel ? removeTag(p) : addTag(p)
        },
          h('div',{style:{display:'flex',flexDirection:'column',gap:'2px',minWidth:'0'}},
            h('span',{style:{fontSize:'13px',color:'var(--text)',fontWeight: sel ? '600' : '400'}}, p.tag),
            h('span',{style:{fontSize:'10px',color:'var(--muted)'}}, pvLabel(p.pv))
          ),
          h('span',{style:{fontSize:'15px',color: sel ? fam.color : 'var(--muted)',flexShrink:'0',width:'18px',textAlign:'center'}},
            sel ? '✓' : '+')
        );
      })
    ),
    h('div',{style:{borderTop:'1px solid var(--border)',margin:'18px 0 0'}}),
    h('div',{style:{fontSize:'11px',color:'var(--muted)',margin:'14px 0 6px'}},
      'Don’t see it? Add your own to ' + fam.label),
    h('div',{style:{display:'flex',gap:'6px'}},
      h('input',{
        id:'wobble-preset-add-input', type:'text', placeholder:'New emotion…',
        value: S._wobblePresetNewTag || '',
        style:{flex:'1',background:'var(--surface-1)',border:'1px solid var(--border)',
          borderRadius:'8px',padding:'9px 11px',fontSize:'13px',
          color:'var(--text)',outline:'none',fontFamily:"'DM Sans',sans-serif"},
        oninput: e => { S._wobblePresetNewTag = e.target.value; },
        onkeydown: e => {
          if (e.key === 'Enter') {
            const inp = document.getElementById('wobble-preset-add-input');
            addCustom(inp ? inp.value : S._wobblePresetNewTag);
          }
        }
      }),
      h('button',{
        style:{background:'transparent',border:'1px solid var(--border)',borderRadius:'8px',
          color:'var(--muted)',fontSize:'12px',cursor:'pointer',padding:'9px 14px',
          fontFamily:"'DM Sans',sans-serif",fontWeight:'500',flexShrink:'0'},
        onclick: () => {
          const inp = document.getElementById('wobble-preset-add-input');
          addCustom(inp ? inp.value : S._wobblePresetNewTag);
        }
      }, 'Add custom')
    ),
    (() => {
      // Highlight Done once this family has any tags configured (preset
      // toggles or custom adds), to signal it's a good time to close.
      const has = tags.some(t => ((S.tagToneOverrides && S.tagToneOverrides[t]) || TAG_TO_EMOTION_TONE[t]) === fam.val);
      return h('button',{class: has ? 'submit-btn' : 'sec-btn',
        style:{width:'100%',marginTop:'18px'}, onclick:()=>closeModal()}, 'Done');
    })()
  ));
}
