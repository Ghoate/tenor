'use strict';

/* ── Config Panel ───────────────────────────────────── */
function buildConfigPanel() {
  const W = S.weights;

  const section = (title) => h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},title));

  return h('div',{class:'insights-panel'},

    section('Your pronouns'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.6'}},
      'How the app refers to you.'
    ),
    h('div',{class:'btn-grid-3',style:{marginBottom:'20px'}},
      ...[
        {val:'she',  label:'She / Her',   sub:'I use she/her'},
        {val:'he',   label:'He / Him',    sub:'I use he/him'},
        {val:'they', label:'They / Them', sub:'I use they/them'},
      ].map(opt => h('button',{
        class:'sel-btn'+(S.userPronouns===opt.val?' sel-physical':''),
        onclick:()=>{ S.userPronouns=opt.val; saveSettings(); render(); }
      }, opt.label, h('span',{class:'sub'},opt.sub)))
    ),

    section('Partner pronouns'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.6'}},
      'Used throughout the app in labels, descriptions and insights.'
    ),
    h('div',{class:'btn-grid-3',style:{marginBottom:'20px'}},
      ...[
        {val:'she',  label:'She / Her',   sub:'Partner uses she/her'},
        {val:'he',   label:'He / Him',    sub:'Partner uses he/him'},
        {val:'they', label:'They / Them', sub:'Partner uses they/them'},
      ].map(opt => h('button',{
        class:'sel-btn'+(S.partnerPronouns===opt.val?' sel-physical':''),
        onclick:()=>{ S.partnerPronouns=opt.val; saveSettings(); render(); }
      }, opt.label, h('span',{class:'sub'},opt.sub)))
    ),

    section('Default EN rankings'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.6'}},
      'Reset your current EN ranking to a research-based default.'
    ),
    h('div',{class:'btn-grid-2',style:{marginBottom:'20px'}},
      h('button',{
        class:'sel-btn',
        onclick:()=>{
          S.needsRanking = [...EN_DEFAULTS.male];
          recalculateAllWeights();
          showToast('✓ Male default EN ranking applied');
          render();
        }
      }, '♂ Male default'),
      h('button',{
        class:'sel-btn',
        onclick:()=>{
          S.needsRanking = [...EN_DEFAULTS.female];
          recalculateAllWeights();
          showToast('✓ Female default EN ranking applied');
          render();
        }
      }, '♀ Female default'),
    ),

    section('Default PN rankings'),
    h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.6'}},
      'Reset your current PN ranking to a research-based default.'
    ),
    h('div',{class:'btn-grid-2',style:{marginBottom:'20px'}},
      h('button',{
        class:'sel-btn',
        onclick:()=>{
          S.personalNeedsRanking = [...PN_DEFAULTS.male];
          recalculateAllWeights();
          showToast('✓ Male default PN ranking applied');
          render();
        }
      }, '♂ Male default'),
      h('button',{
        class:'sel-btn',
        onclick:()=>{
          S.personalNeedsRanking = [...PN_DEFAULTS.female];
          recalculateAllWeights();
          showToast('✓ Female default PN ranking applied');
          render();
        }
      }, '♀ Female default'),
    ),

    section('Features'),
    h('div',{style:{
      display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',
      padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:'4px',flexWrap:'wrap'
    }},
      h('div',{style:{flex:'1',minWidth:'180px'}},
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Relationship mode'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',lineHeight:'1.5'}},
          'Individual hides every relational category for personal-only tracking. Committed tracks one ongoing relationship. Dating renames Bonding to Dating for casual / multiple-person contexts.')
      ),
      h('div',{style:{display:'flex',gap:'6px',flexShrink:'0',flexWrap:'wrap'}},
        ...['individual','partner','dating'].map(mode => {
          const sel = S.relationshipMode === mode;
          const label = mode === 'dating' ? 'Dating' : mode === 'individual' ? 'Individual' : 'Committed';
          return h('button',{
            style:{
              padding:'6px 14px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
              fontFamily:"'DM Sans',sans-serif",
              border: sel ? '1px solid var(--c-partner)' : '1px solid var(--border)',
              background: sel ? 'var(--c-partner-tint)' : 'var(--bg3)',
              color: sel ? 'var(--c-partner)' : 'var(--muted)',
            },
            onclick: sel ? null : () => {
              S.relationshipMode = mode;
              // Flip the relational feature toggles so the picker, library,
              // home chips, etc., match the chosen mode without making the
              // user hunt for the matching switches below. Repair stays opt-in.
              if (mode === 'individual') {
                S.showBonding = false; S.showPhysical = false;
                S.showConflict = false; S.showRepair = false;
                // Seed socialTypes from affectionTypes if empty, so the user
                // has a starting library to edit. The profile carries over;
                // the needsMap is reset to SN defaults since the EN keys
                // on bonding types don't map to Social Needs.
                if ((!S.socialTypes || S.socialTypes.length === 0) && Array.isArray(S.affectionTypes) && S.affectionTypes.length > 0) {
                  const snDefaults = Object.fromEntries(SOCIAL_NEEDS.map(n => [n.val, 1]));
                  S.socialTypes = S.affectionTypes.map(t => ({
                    name:          t.name,
                    description:   t.description,
                    descEffort:    t.descEffort    || 1,
                    descTime:      t.descTime      || 1,
                    descFinancial: t.descFinancial || 1,
                    descRarity:    t.descRarity    || 1,
                    descPresence:  t.descPresence  || 1,
                    needsMap:      {...snDefaults},
                  })).map(s => ({...s, weight: deriveActivityWeight(s)}));
                  showToast('✓ Social activities seeded from Bonding library');
                }
              } else {
                S.showBonding = true; S.showPhysical = true;
                S.showConflict = true;
              }
              saveSettings();
              render();
            }
          }, label);
        })
      )
    ),
    // Track Social as a third axis (Partner/Dating mode only — Individual mode
    // already uses Social in place of Relational).
    S.relationshipMode !== 'individual' ? h('div',{style:{
      display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',
      padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:'4px'
    }},
      h('div',{style:{flex:'1',minWidth:'180px'}},
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Track Social separately'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',lineHeight:'1.5'}},
          'Adds Social as a third axis alongside Relational and Personal. Atmosphere becomes the average of all three. Useful when you want to track friend/family/community connection separately from your partner relationship.')
      ),
      h('button',{
        style:{
          padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif",flexShrink:'0',
          border: S.trackSocialAxis ? '1px solid var(--c-social)' : '1px solid var(--border)',
          background: S.trackSocialAxis ? 'rgba(224,164,104,0.15)' : 'var(--bg3)',
          color: S.trackSocialAxis ? 'var(--c-social)' : 'var(--muted)',
        },
        onclick:()=>{
          S.trackSocialAxis = !S.trackSocialAxis;
          saveSettings();
          render();
        }
      }, S.trackSocialAxis ? 'On' : 'Off')
    ) : null,

    h('div',{style:{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:'4px'
    }},
      h('div',{},
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Bonding logging'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},
          'Show '+bondingLabel()+' and Combined entry types in the log picker — turn off for personal-only tracking')
      ),
      h('button',{
        style:{
          padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif",
          border: S.showBonding ? '1px solid var(--c-partner)' : '1px solid var(--border)',
          background: S.showBonding ? 'var(--c-partner-tint)' : 'var(--bg3)',
          color: S.showBonding ? 'var(--c-partner)' : 'var(--muted)',
        },
        onclick:()=>{ S.showBonding=!S.showBonding; saveSettings(); render(); }
      }, S.showBonding ? 'On' : 'Off')
    ),
    h('div',{style:{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:'4px'
    }},
      h('div',{},
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Conflict logging'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},
          'Show Conflict entry type in the log picker — turn off for non-relational tracking')
      ),
      h('button',{
        style:{
          padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif",
          border: S.showConflict ? '1px solid var(--c-partner)' : '1px solid var(--border)',
          background: S.showConflict ? 'var(--c-partner-tint)' : 'var(--bg3)',
          color: S.showConflict ? 'var(--c-partner)' : 'var(--muted)',
        },
        onclick:()=>{ S.showConflict=!S.showConflict; saveSettings(); render(); }
      }, S.showConflict ? 'On' : 'Off')
    ),
    h('div',{style:{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:'4px'
    }},
      h('div',{},
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Intimacy logging'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},
          'Show Intimacy entry type in the log picker — turn off for non-sexual relationship tracking')
      ),
      h('button',{
        style:{
          padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif",
          border: S.showPhysical ? '1px solid var(--c-partner)' : '1px solid var(--border)',
          background: S.showPhysical ? 'var(--c-partner-tint)' : 'var(--bg3)',
          color: S.showPhysical ? 'var(--c-partner)' : 'var(--muted)',
        },
        onclick:()=>{ S.showPhysical=!S.showPhysical; saveSettings(); render(); }
      }, S.showPhysical ? 'On' : 'Off')
    ),
    h('div',{style:{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:'4px'
    }},
      h('div',{},
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Wobble logging'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},
          'Show the Wobble entry type in the log picker')
      ),
      h('button',{
        style:{
          padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif",
          border: S.showRegulation ? '1px solid var(--c-partner)' : '1px solid var(--border)',
          background: S.showRegulation ? 'var(--c-partner-tint)' : 'var(--bg3)',
          color: S.showRegulation ? 'var(--c-partner)' : 'var(--muted)',
        },
        onclick:()=>{ S.showRegulation=!S.showRegulation; saveSettings(); render(); }
      }, S.showRegulation ? 'On' : 'Off')
    ),
    h('div',{style:{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:'4px'
    }},
      h('div',{},
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Steadying'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},
          'Show the Steadying entry type in the log picker')
      ),
      h('button',{
        style:{
          padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif",
          border: S.showCaretaker ? '1px solid var(--c-partner)' : '1px solid var(--border)',
          background: S.showCaretaker ? 'var(--c-partner-tint)' : 'var(--bg3)',
          color: S.showCaretaker ? 'var(--c-partner)' : 'var(--muted)',
        },
        onclick:()=>{ S.showCaretaker=!S.showCaretaker; saveSettings(); render(); }
      }, S.showCaretaker ? 'On' : 'Off')
    ),
    h('div',{style:{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:'4px'
    }},
      h('div',{},
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Repair logging'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},
          'Show the Repair entry type — log moments of reconnection after rupture (who reached, how it landed, how it felt afterward).')
      ),
      h('button',{
        style:{
          padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif",
          border: S.showRepair ? '1px solid var(--c-partner)' : '1px solid var(--border)',
          background: S.showRepair ? 'var(--c-partner-tint)' : 'var(--bg3)',
          color: S.showRepair ? 'var(--c-partner)' : 'var(--muted)',
        },
        onclick:()=>{ S.showRepair=!S.showRepair; saveSettings(); render(); }
      }, S.showRepair ? 'On' : 'Off')
    ),
    h('div',{style:{
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:'4px'
    }},
      h('div',{},
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Attachment lens'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},
          'Adds the Lens tab — patterns of activation, regulation, repair and the moments in between, framed through attachment theory. Optional. In active development.')
      ),
      h('button',{
        style:{
          padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif",
          border: S.showAttachment ? '1px solid var(--c-partner)' : '1px solid var(--border)',
          background: S.showAttachment ? 'var(--c-partner-tint)' : 'var(--bg3)',
          color: S.showAttachment ? 'var(--c-partner)' : 'var(--muted)',
        },
        onclick:()=>{
          S.showAttachment=!S.showAttachment;
          // If turning off while currently on the Attachment tab, fall back to Insights
          if (!S.showAttachment && S.activeTab==='attachment') S.activeTab='insights';
          saveSettings();
          render();
        }
      }, S.showAttachment ? 'On' : 'Off')
    ),
    // ── Caretaker type library ────────────────────────
    // Pre-built types are available as data but not shown in UI
    // (add types manually via the type manager below)

    // ── Developer / Debug ─────────────────────────────
    section('Developer / Debug'),
    h('div',{class:'bar-chart',style:{marginBottom:'20px'}},
      h('div',{class:'bar-chart-title'},'Developer options'),
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:'1px solid var(--border)'}},
        h('div',{},
          h('div',{style:{fontSize:'13px',color:'var(--text)'}},'Restore sample types'),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},'Adds the built-in sample types to '+bondingLabel()+', Intimacy, Restorative and Steadying — skips any already present')
        ),
        h('button',{
          style:{padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
            fontFamily:"'DM Sans',sans-serif",
            border:'1px solid var(--border)',
            background:'var(--bg3)',
            color:'var(--muted)'},
          onclick:()=>{
            const existA = S.affectionTypes.map(t=>t.name);
            SAMPLE_AFFECTION_TYPES.forEach(t=>{ if(!existA.includes(t.name)) S.affectionTypes.push({...t}); });
            const existP = S.physicalTypes.map(t=>t.name);
            SAMPLE_PHYSICAL_TYPES.forEach(t=>{ if(!existP.includes(t.name)) S.physicalTypes.push({...t}); });
            const existR = S.restoreTypes.map(t=>(typeof t==='string'?t:t.name));
            SAMPLE_RESTORE_TYPES.forEach(t=>{ if(!existR.includes(t.name)) S.restoreTypes.push({...t}); });
            const existC = S.caretakerTypes.map(t=>t.name);
            SAMPLE_CARETAKER_TYPES.forEach(t=>{
              if(!existC.includes(t.name)){
                const newType={...t}; newType.weight=deriveCaretakerWeight(newType); S.caretakerTypes.push(newType);
              }
            });
            if (!S.challengingEmotionTags || S.challengingEmotionTags.length === 0) {
              S.challengingEmotionTags = [...DEFAULT_CHALLENGING_EMOTION_TAGS];
            } else {
              DEFAULT_CHALLENGING_EMOTION_TAGS.forEach(tag=>{ if(!S.challengingEmotionTags.includes(tag)) S.challengingEmotionTags.push(tag); });
            }
            saveSettings(); showToast('✓ Sample types restored'); render();
          }
        }, 'Restore')
      ),
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0'}},
        h('div',{},
          h('div',{style:{fontSize:'13px',color:'var(--text)'}},'Scoring debug panels'),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},'Show live score breakdown in entry forms')
        ),
        h('button',{
          style:{padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
            fontFamily:"'DM Sans',sans-serif",
            border: S.showDebug ? '1px solid var(--c-partner)' : '1px solid var(--border)',
            background: S.showDebug ? 'var(--c-partner-tint)' : 'var(--bg3)',
            color: S.showDebug ? 'var(--c-partner)' : 'var(--muted)'},
          onclick:()=>{ S.showDebug=!S.showDebug; saveSettings(); render(); }
        }, S.showDebug ? 'On' : 'Off')
      ),
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderTop:'1px solid var(--border)'}},
        h('div',{},
          h('div',{style:{fontSize:'13px',color:'var(--text)'}},'Points on entry cards'),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},'Show "+5 pts" / "−3 pts" next to entry metadata on the home and log pages')
        ),
        h('button',{
          style:{padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
            fontFamily:"'DM Sans',sans-serif",
            border: S.showCardPoints ? '1px solid var(--c-partner)' : '1px solid var(--border)',
            background: S.showCardPoints ? 'var(--c-partner-tint)' : 'var(--bg3)',
            color: S.showCardPoints ? 'var(--c-partner)' : 'var(--muted)'},
          onclick:()=>{ S.showCardPoints=!S.showCardPoints; saveSettings(); render(); }
        }, S.showCardPoints ? 'On' : 'Off')
      ),
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderTop:'1px solid var(--border)'}},
        h('div',{},
          h('div',{style:{fontSize:'13px',color:'var(--text)'}},'Quick delete on entry cards'),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},'Show × button directly on each log entry card')
        ),
        h('button',{
          style:{padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
            fontFamily:"'DM Sans',sans-serif",
            border: S.showQuickDelete ? '1px solid var(--c-partner)' : '1px solid var(--border)',
            background: S.showQuickDelete ? 'var(--c-partner-tint)' : 'var(--bg3)',
            color: S.showQuickDelete ? 'var(--c-partner)' : 'var(--muted)'},
          onclick:()=>{ S.showQuickDelete=!S.showQuickDelete; saveSettings(); render(); }
        }, S.showQuickDelete ? 'On' : 'Off')
      ),
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderTop:'1px solid var(--border)'}},
        h('div',{},
          h('div',{style:{fontSize:'13px',color:'var(--text)'}},'Reset onboarding'),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},'Clears the "onboarded" flag — next load opens the welcome screen')
        ),
        h('button',{
          style:{padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
            fontFamily:"'DM Sans',sans-serif",
            border:'1px solid var(--c-conflict-border)',
            background:'var(--c-conflict-tint)',
            color:'var(--c-conflict)',
            transition:'all 0.15s'},
          onclick: e => {
            const btn = e.currentTarget;
            btn.style.opacity = '0.5';
            btn.textContent = 'Resetting…';
            dbPut('settings', {key:'onboarded', value:false})
              .then(()=>{
                btn.style.opacity='1';
                btn.textContent='Done ✓';
                // Launch inline onboarding immediately — no reload needed
                showInlineOnboarding(() => {
                  loadSettings().then(() => { recalculateAllWeights(); render(); });
                });
              })
              .catch(()=>{ btn.style.opacity='1'; btn.textContent='Reset'; showToast('Could not reset onboarding'); });
          }
        }, 'Reset')
      )
    ),

    // ── Scoring weights ───────────────────────────────
    section('Scoring weights'),
    h('div',{class:'bar-chart',style:{marginBottom:'12px'}},
      h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.5'}},
        'Adjust the core scoring parameters.'
      ),
      ...[
        {key:'stable7',    label:'Healthy anchor',                hint:'Score threshold for the Healthy zone',                     min:10, max:500,  step:5,  def:30},
        {key:'thriving7',  label:'Thriving anchor',               hint:'Score threshold for the Thriving zone',                    min:20, max:1000, step:10, def:60},
        {key:'cap7',       label:'Gauge Cap Anchor',              hint:'Outer edge of the gauge needle swing (UI only — does not affect scoring)',  min:50, max:2000, step:10, def:150},
        {key:'calStable',  label:'Calendar — Healthy threshold',  hint:'Daily combined score at which a day shows medium color',   min:1,  max:200,  step:1,  def:11},
        {key:'calThriving',label:'Calendar — Thriving threshold', hint:'Daily combined score at which a day shows strong color',   min:1,  max:500,  step:1,  def:25},
        {key:'dowHalfLife',label:'Forecast DOW half-life (days)',  hint:'How quickly older days fade from the percent chart\'s per-day-of-week probability. Lower = recent days dominate, older fade fast. Higher = gentle fade with long memory.', min:3, max:60, step:1, def:14},
      ].map(({key,label,hint,min,max,step,def}) =>
        h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}},
          h('div',{style:{flex:'1'}},
            h('div',{style:{fontSize:'13px',color:'var(--text)'}}, label),
            h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}, hint)
          ),
          h('input',{
            type:'number', step:String(step), min:String(min), max:String(max),
            value: String(W[key] ?? def),
            style:{width:'80px',background:'var(--bg3)',border:'1px solid var(--border)',
              borderRadius:'8px',padding:'6px 10px',fontSize:'14px',
              color:'var(--c-physical)',fontFamily:"'Libre Baskerville',serif",
              textAlign:'right',outline:'none',flexShrink:'0'},
            onchange: e => {
              const n = parseFloat(e.target.value);
              if (!isNaN(n) && n >= min) {
                S.weights = {...S.weights, [key]: n};
                saveSettings();
                showToast('✓ ' + label + ' saved');
              }
            }
          })
        )
      ),

      // ── Lifespan anchors (derive slope/floor from two event-size anchors) ──
      (() => {
        const slope = W.expT_Slope ?? 0.6122;
        const floor = W.expT_Floor ?? 1.7755;
        const bigLife   = 100 * slope + floor;   // -100 event lifespan
        const smallLife =   2 * slope + floor;   // -2   event lifespan
        const setFromAnchors = (newBig, newSmall) => {
          const newSlope = (newBig - newSmall) / 98;
          const newFloor = newSmall - 2 * newSlope;
          S.weights = {...S.weights, expT_Slope: newSlope, expT_Floor: newFloor};
          saveSettings();
          render();
        };
        const anchorRow = (label, hint, val, min, max, onSave) => h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}},
          h('div',{style:{flex:'1'}},
            h('div',{style:{fontSize:'13px',color:'var(--text)'}}, label),
            h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}, hint)
          ),
          h('div',{style:{display:'flex',alignItems:'center',gap:'6px',flexShrink:'0'}},
            h('input',{
              type:'number', step:'1', min:String(min), max:String(max),
              value: String(Math.round(val * 10) / 10),
              style:{width:'70px',background:'var(--bg3)',border:'1px solid var(--border)',
                borderRadius:'8px',padding:'6px 10px',fontSize:'14px',
                color:'var(--c-physical)',fontFamily:"'Libre Baskerville',serif",
                textAlign:'right',outline:'none'},
              onchange: e => {
                const n = parseFloat(e.target.value);
                if (!isNaN(n) && n >= min && n <= max) onSave(n);
              }
            }),
            h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, 'days')
          )
        );
        return h('div',{},
          anchorRow(
            'Big event lifespan (+100)',
            'How many days a 100-point event takes to fade to zero',
            bigLife, 5, 365,
            (n) => setFromAnchors(n, smallLife)
          ),
          anchorRow(
            'Small event lifespan (+2)',
            'How many days a 2-point event takes to fade to zero',
            smallLife, 1, 60,
            (n) => setFromAnchors(bigLife, n)
          ),
          // ── Derived lifespan preview ──────────────────────
          (() => {
            const sl = W.expT_Slope ?? 0.6122;
            const fl = W.expT_Floor ?? 1.7755;
            const lifespan = (mag) => mag * sl + fl;
            const previewRow = (mag) => h('div',{style:{
              display:'flex', justifyContent:'space-between', padding:'3px 0',
            }},
              h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, '+' + mag + ' event'),
              h('span',{style:{fontSize:'12px',fontFamily:"'Libre Baskerville',serif",color:'var(--muted)'}},
                '~' + Math.round(lifespan(mag) * 10) / 10 + ' days')
            );
            return h('div',{style:{
              padding:'8px 12px 6px',marginTop:'8px',marginBottom:'4px',
              borderRadius:'8px',background:'var(--bg3)',
            }},
              h('div',{style:{fontSize:'10px',fontWeight:'600',letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'4px'}}, 'Derived lifespans'),
              previewRow(50),
              previewRow(20),
              previewRow(10),
              previewRow(5),
            );
          })(),
        );
      })(),

      // ── Debug: calc start date ────────────────────────
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)',gap:'10px'}},
        h('div',{style:{flex:'1',minWidth:'0'}},
          h('div',{style:{fontSize:'13px',color:'var(--text)'}},'Debug — calculation start date'),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},'Ignore entries before this date for all calculations. Old entries stay visible in the log and calendar — only aggregates are filtered. Blank = include everything.')
        ),
        h('div',{style:{display:'flex',gap:'6px',alignItems:'center',flexShrink:'0'}},
          h('input',{
            type:'date',
            value: S.calcStartDate || '',
            style:{
              padding:'6px 10px', borderRadius:'8px', fontSize:'12px',
              fontFamily:"'DM Sans',sans-serif",
              border:'1px solid var(--border)', background:'var(--bg3)',
              color: S.calcStartDate ? 'var(--text)' : 'var(--muted)',
              outline:'none',
            },
            onchange: e => {
              S.calcStartDate = e.target.value || '';
              saveSettings();
              render();
            }
          }),
          S.calcStartDate ? h('button',{
            style:{
              padding:'6px 10px',borderRadius:'8px',fontSize:'12px',cursor:'pointer',
              fontFamily:"'DM Sans',sans-serif",
              border:'1px solid var(--border)',background:'var(--bg3)',color:'var(--muted)',
            },
            onclick:()=>{ S.calcStartDate=''; saveSettings(); render(); }
          }, 'Clear') : null,
        )
      )
    ),

  );
}
