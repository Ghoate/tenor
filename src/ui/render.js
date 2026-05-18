'use strict';

function switchTab(tab) {
  const leavingLog = S.activeTab === 'log' && tab !== 'log';
  S.activeTab = tab;
  if (leavingLog && S.selectedDate !== S.today) {
    S.selectedDate = S.today;
    S.calYear = new Date().getFullYear();
    S.calMonth = new Date().getMonth();
    loadDay().then(render);
  } else {
    render();
  }
}

function render() {
  // Apply theme
  // Refresh today in case the app has been open past midnight
  S.today = dateStr(new Date());
  S._loveBankCache = null; // invalidate per-render cache
  // Reset window to 7d when not on a tab that uses it — keeps score bar in sync on re-entry
  if (S.activeTab !== 'insights' && S.activeTab !== 'needs' && S.activeTab !== 'attachment') S.loveBankWindow = 7;

  // Detect tab change since the last render. When the tab changes,
  // scroll positions from the previous tab are not meaningful — we
  // reset to top so each tab opens at its natural starting point.
  // Modal-on-top renders (S.modal set) don't count as tab changes.
  const tabChanged = !S.modal && S._lastRenderedTab !== S.activeTab;
  S._lastRenderedTab = S.activeTab;

  // Save scroll positions before rebuild
  const sheetEl  = document.querySelector('.sheet');
  const panelEl  = document.querySelector('.insights-panel, .day-panel');
  const sheetScroll = sheetEl  ? sheetEl.scrollTop  : 0;
  const panelScroll = panelEl  ? panelEl.scrollTop  : 0;

  const app=document.getElementById('app');
  app.innerHTML='';
  // Portal-attached overlays live on document.body — clear any stale ones so
  // a tab switch doesn't leave them orphaned. The current tab's panel re-adds
  // them if still relevant.
  for (const _id of ['needs-calibration-modal', 'needs-pn-calibration-modal']) {
    const _stale = document.getElementById(_id);
    if (_stale) _stale.remove();
  }

  app.appendChild(h('div',{class:'header'},
    h('div',{},
      h('div',{class:'header-title'},'Tenor'),
      h('div',{class:'header-sub'},new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})
        + (useLocalStorage ? ' · localStorage' : ''))
    ),
    h('div',{style:{display:'flex',gap:'8px',alignItems:'center'}},
      S.activeTab==='log'
        ? h('button',{class:'header-btn',onclick:()=>{
            S.selectedDate=S.today;S.calYear=new Date().getFullYear();S.calMonth=new Date().getMonth();
            loadDay().then(render);
          }},'↩')
        : null,
      h('button',{
        class:'header-btn'+(S.activeTab==='config'?' active':''),
        style:{fontSize:'16px'},
        onclick:()=>switchTab(S.activeTab==='config'?'log':'config')
      },'⚙'),
      h('button',{class:'header-btn',onclick:()=>openModal('export')},'⋯')
    )
  ));

  // Score bar — always visible above tabs
  if (S.allEntries.length > 0) {
    app.appendChild(buildScoreBar());
  }

  // Tab bar
  app.appendChild(h('div',{class:'tab-bar'},
    h('button',{class:'tab-btn'+(S.activeTab==='home'?' active':''), onclick:()=>switchTab('home')}, 'Home'),
    h('button',{class:'tab-btn'+(S.activeTab==='log'?' active':''), onclick:()=>switchTab('log')}, 'Log'),
    h('button',{class:'tab-btn'+(S.activeTab==='insights'?' active':''), onclick:()=>switchTab('insights')}, 'Insight'),
    S.showAttachment ? h('button',{class:'tab-btn'+(S.activeTab==='attachment'?' active':''), onclick:()=>switchTab('attachment')}, 'Lens') : null,
    h('button',{class:'tab-btn'+(S.activeTab==='needs'?' active':''), onclick:()=>switchTab('needs')}, 'Needs'),
    h('button',{class:'tab-btn'+(S.activeTab==='library'?' active':''), onclick:()=>switchTab('library')}, 'Library')
  ));

  const buildTab = (fn, name) => {
    try { return fn(); }
    catch(err) {
      console.error('Tab build error ['+name+']:', err);
      return h('div',{style:{padding:'20px',color:'var(--c-conflict)',fontSize:'13px',fontFamily:'monospace'}},
        'Error in '+name+': '+err.message);
    }
  };

  if (S.activeTab === 'home') {
    app.appendChild(buildTab(buildHomePage, 'home'));
  } else if (S.activeTab === 'log') {
    const logPanel = document.createElement('div');
    logPanel.className = 'insights-panel';
    logPanel.appendChild(buildCalendar());
    logPanel.appendChild(buildDayPanel());
    app.appendChild(logPanel);
  } else if (S.activeTab === 'needs') {
    app.appendChild(buildTab(buildNeedsPanel, 'needs'));
  } else if (S.activeTab === 'attachment') {
    app.appendChild(buildTab(buildAttachmentPanel, 'attachment'));
  } else if (S.activeTab === 'library') {
    app.appendChild(buildTab(buildLibraryPanel, 'library'));
  } else if (S.activeTab === 'config') {
    app.appendChild(buildTab(buildConfigPanel, 'config'));
  } else {
    app.appendChild(buildTab(buildInsightsPanel, 'insights'));
  }

  const builders = {
    picker:           buildPicker,
    physical:         buildPhysicalForm,
    affection:        buildBondingForm,
    combined:         buildCombinedForm,
    libido:           buildMedForm,
    conflict:         buildConflictForm,
    turndown:          buildTurndownForm,
    notes:            buildNotesForm,
    burnout:          buildSteadyingForm,
    restore:          buildRestoreForm,
    regulation:       buildWobbleForm,
    repair:           buildRepairForm,
    export:           buildExportSheet,
    'cal-filter':     buildCalFilterModal,
    'wobble-presets': buildWobblePresetModal,
    'wobble-emotion-guide': buildWobbleEmotionGuide,
  };
  if(S.modal && builders[S.modal]) {
    try {
      app.appendChild(builders[S.modal]());
    } catch(err) {
      console.error('Modal build error ['+S.modal+']:', err);
      app.appendChild(h('div',{style:{padding:'20px',color:'var(--c-conflict)',fontSize:'13px',fontFamily:'monospace'}},
        'Error in '+S.modal+': '+err.message));
    }
  }

  // Restore scroll positions and form input values
  requestAnimationFrame(() => {
    const newSheet = document.querySelector('.sheet');
    const newPanel = document.querySelector('.insights-panel, .day-panel');
    if (tabChanged) {
      // First-load of a tab — start at the top of every scrollable surface
      if (newSheet) newSheet.scrollTop = 0;
      if (newPanel) newPanel.scrollTop = 0;
      // Also reset window scroll for tabs whose content lives at the page level
      window.scrollTo(0, 0);
    } else {
      if (newSheet && sheetScroll && !S._resetSheetScroll) newSheet.scrollTop = sheetScroll;
      if (newPanel && panelScroll) newPanel.scrollTop = panelScroll;
    }
    S._resetSheetScroll = false;
    // Restore name input value if adding or editing an activity type
    const nameInput = document.getElementById('activity-name-input');
    if (nameInput && S.form.newType) {
      nameInput.value = S.form.newType;
      nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
    }
    // Restore description textarea value
    const descInput = document.getElementById('activity-desc-input');
    if (descInput && S.form.newTypeDesc != null) descInput.value = S.form.newTypeDesc;
    // Restore caretaker type name input
    const ctNameInput = document.getElementById('ct-name-input');
    if (ctNameInput && S.form.ctNewType) {
      ctNameInput.value = S.form.ctNewType;
      ctNameInput.setSelectionRange(ctNameInput.value.length, ctNameInput.value.length);
    }
    // Restore existing subtype name inputs and description textareas
    (S.form.ctSubtypes||[]).forEach((st,idx) => {
      const nameEl = document.getElementById('ct-subtype-name-'+idx);
      if (nameEl) { nameEl.value = st.name; }
      const subEl = document.getElementById('ct-subtype-sub-'+idx);
      if (subEl) { subEl.value = st.sub||''; }
    });
    // Restore new subtype inputs
    const ctSubInput = document.getElementById('ct-subtype-input');
    if (ctSubInput && S.form.ctSubtypeName) ctSubInput.value = S.form.ctSubtypeName;

    const ctSubSubInput = document.getElementById('ct-subtype-sub-input');
    if (ctSubSubInput && S.form.ctSubtypeSub) ctSubSubInput.value = S.form.ctSubtypeSub;
    // Restore tag edit input value and focus
    const editTagInput = document.getElementById('edit-tag-input-challengingEmotionTags');
    if (editTagInput && S.libWobbleForm && S.libWobbleForm.editTagVal != null) {
      editTagInput.value = S.libWobbleForm.editTagVal;
      editTagInput.focus();
      editTagInput.setSelectionRange(editTagInput.value.length, editTagInput.value.length);
    }
  });
}

/* ── Boot ───────────────────────────────────────────── */
openDB()
  .then(() => {
    if (useLocalStorage) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        const req = db.transaction('settings','readonly').objectStore('settings').get('onboarded');
        req.onsuccess = e => {
          if (!e.target.result || !e.target.result.value) {
            showInlineOnboarding(resolve);
          } else {
            resolve();
          }
        };
        req.onerror = () => resolve();
      } catch(e) {
        resolve();
      }
    });
  })
  .then(loadSettings)
  .then(()=>{
    // Recalculate weights now that S is fully populated
    recalculateAllWeights();
    // Also save defaults if this is first run (caretakerTypes was just seeded)
    if (S.caretakerTypes.length > 0 && S.caretakerTypes[0].weight > 0) {
      saveSettings();
    }
  })
  .then(loadAll)
  .then(loadDay)
  .then(render)
  .catch(err=>{
    document.getElementById('app').innerHTML=
      '<div style="padding:40px 24px;color:var(--c-conflict);font-family:sans-serif;font-size:14px;">Could not open database: '+err.message+'</div>';
  });
