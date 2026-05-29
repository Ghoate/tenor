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
      display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'12px 0',borderBottom:'1px solid var(--border)',marginBottom:'4px'
    }},
      h('div',{},
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Relationship mode'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},
          'Committed mode tracks one ongoing relationship. Dating mode renames Bonding to Dating and tags each entry with whom (from your Whom library).')
      ),
      h('div',{style:{display:'flex',gap:'6px',flexShrink:'0'}},
        ...['partner','dating'].map(mode => {
          const sel = S.relationshipMode === mode;
          const label = mode === 'dating' ? 'Dating' : 'Committed';
          return h('button',{
            style:{
              padding:'6px 14px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
              fontFamily:"'DM Sans',sans-serif",
              border: sel ? '1px solid var(--c-partner)' : '1px solid var(--border)',
              background: sel ? 'var(--c-partner-tint)' : 'var(--bg3)',
              color: sel ? 'var(--c-partner)' : 'var(--muted)',
            },
            onclick: sel ? null : () => { S.relationshipMode = mode; saveSettings(); render(); }
          }, label);
        })
      )
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
        h('div',{style:{fontSize:'14px',color:'var(--text)'}},'Life Wobble logging'),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},
          'Show the Life Wobble entry type in the log picker')
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
          h('div',{style:{fontSize:'13px',color:'var(--text)'}},'Exponential decay (alternate model)'),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}},'Per-event exponential fade with magnitude-scaled lifespan. Below 1 → 0.')
        ),
        h('button',{
          style:{padding:'6px 16px',borderRadius:'20px',fontSize:'12px',cursor:'pointer',
            fontFamily:"'DM Sans',sans-serif",
            border: S.useExponentialDecay ? '1px solid var(--c-partner)' : '1px solid var(--border)',
            background: S.useExponentialDecay ? 'var(--c-partner-tint)' : 'var(--bg3)',
            color: S.useExponentialDecay ? 'var(--c-partner)' : 'var(--muted)'},
          onclick:()=>{ S.useExponentialDecay=!S.useExponentialDecay; saveSettings(); render(); }
        }, S.useExponentialDecay ? 'On' : 'Off')
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
        {key:'stable7',    label:'Healthy anchor (7-day)',        hint:'Score threshold for Healthy zone at 7 days',                min:10, max:500,  step:5,  def:40},
        {key:'thriving7',  label:'Thriving anchor (7-day)',       hint:'Score threshold for Thriving zone at 7 days',              min:20, max:1000, step:10, def:80},
        {key:'cap7',       label:'Cap anchor (7-day)',            hint:'Hard ceiling on the balance at 7 days',                    min:50, max:2000, step:10, def:240},
        {key:'calStable',  label:'Calendar — stable threshold',   hint:'Daily combined score at which a day shows medium color',   min:1,  max:200,  step:1,  def:11},
        {key:'calThriving',label:'Calendar — thriving threshold', hint:'Daily combined score at which a day shows strong color',   min:1,  max:500,  step:1,  def:25},
        {key:'fcTouch',    label:'Forecast — a touch warmer/cooler', hint:'|Δ| at which tomorrow flags as a touch warmer or cooler (mirrored)', min:0.5, max:10,  step:0.5, def:1},
        {key:'fcWarm',     label:'Forecast — warmer/cooler',         hint:'|Δ| at which tomorrow flags as warmer or cooler (mirrored)',         min:1,   max:30,  step:0.5, def:4},
        {key:'fcMuch',     label:'Forecast — much warmer/cooler',    hint:'|Δ| at which tomorrow flags as much warmer or cooler (mirrored)',    min:2,   max:100, step:1,   def:8},
        {key:'lifespanSlope',    label:'Power-law — lifespan slope',     hint:'Days of lifespan per point of score (bigger events linger longer)',    min:0,   max:10,  step:0.1, def:0.5},
        {key:'lifespanFloor',    label:'Power-law — lifespan floor',     hint:'Minimum lifespan in days, even for tiny events',                       min:0,   max:30,  step:0.5, def:1.5},
        {key:'decayPower',       label:'Power-law — decay power',        hint:'Shape of the fade curve — higher values create a sharper cliff at lifespan', min:0.5, max:10,  step:0.5, def:2},
        {key:'cutoffMultiplier', label:'Power-law — cutoff multiplier',  hint:'Hard zero past this many lifespans — kills the long power-law tail',  min:1,   max:10,  step:0.5, def:2.5},
        {key:'expT_Slope',       label:'Exponential — lifespan slope',     hint:'Days of lifespan per point of score (per-event exponential model)',    min:0,   max:5,   step:0.01, def:0.58},
        {key:'expT_Floor',       label:'Exponential — lifespan floor',     hint:'Minimum lifespan in days, even for tiny events (per-event exponential)', min:0,   max:30,  step:0.1, def:1.8},
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
