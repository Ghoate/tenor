'use strict';

/* ── Data ops ───────────────────────────────────────── */
function loadDay() { return dbByIdx('entries','date',S.selectedDate).then(r=>{ S.dayEntries=r.map(e=>e.category==='partner'?{...e,category:'notes'}:e); }); }
function loadAll() {
  return dbAll('entries').then(r=>{
    // Migrate legacy 'partner' category to 'notes'
    S.allEntries = r.map(e => e.category === 'partner' ? {...e, category:'notes'} : e);
  });
}
function delEntry(id){ dbDel('entries',id).then(loadDay).then(loadAll).then(render).catch(e=>{console.error('Save failed:',e);alert('Save failed — '+e.message);}); }
function recalculateAllWeights() {
  for (const t of S.affectionTypes) {
    if (t.descEffort != null) t.weight = deriveActivityWeight(t);
  }
  for (const t of S.physicalTypes) {
    if (t.physIntentionality != null) t.weight = deriveActivityWeight(t);
  }
  for (const t of S.caretakerTypes) {
    if (t.ctEmotional != null) t.weight = deriveCaretakerWeight(t);
  }

  saveSettings();
}

function saveSettings(){
  dbPut('settings',{key:'physicalTypes',  value:S.physicalTypes});
  dbPut('settings',{key:'affectionTypes', value:S.affectionTypes});
  dbPut('settings',{key:'caretakerTypes', value:S.caretakerTypes});
  dbPut('settings',{key:'restoreTypes',   value:S.restoreTypes});
  dbPut('settings',{key:'challengingEmotionTags', value:S.challengingEmotionTags});
  dbPut('settings',{key:'whomList',       value:S.whomList});
  dbPut('settings',{key:'weights',        value:S.weights});
  dbPut('settings',{key:'needsRanking',   value:S.needsRanking});
  dbPut('settings',{key:'personalNeedsRanking', value:S.personalNeedsRanking});
  dbPut('settings',{key:'partnerPronouns',value:S.partnerPronouns});
  dbPut('settings',{key:'userPronouns',   value:S.userPronouns});
  dbPut('settings',{key:'showCaretaker',  value:S.showCaretaker});
  dbPut('settings',{key:'showRegulation', value:S.showRegulation});
  dbPut('settings',{key:'showPhysical',   value:S.showPhysical});
  dbPut('settings',{key:'showRepair',     value:S.showRepair});
  dbPut('settings',{key:'showAttachment', value:S.showAttachment});
  dbPut('settings',{key:'horsemenExpanded',        value:S.horsemenExpanded});
  dbPut('settings',{key:'tagPolyvagalOverrides',   value:S.tagPolyvagalOverrides});
  dbPut('settings',{key:'tagToneOverrides',         value:S.tagToneOverrides});
  dbPut('settings',{key:'showDebug',         value:S.showDebug});
  dbPut('settings',{key:'showCardPoints',    value:S.showCardPoints});
  dbPut('settings',{key:'needs2Ratings',     value:S.needs2Ratings});
  dbPut('settings',{key:'needs2Order',       value:S.needs2Order});
  dbPut('settings',{key:'needs2Hits',        value:S.needs2Hits});
  dbPut('settings',{key:'needsHits',         value:S.needsHits});
  dbPut('settings',{key:'needsPnHits',       value:S.needsPnHits});
  dbPut('settings',{key:'needs2Sort',        value:S.needs2Sort});
  dbPut('settings',{key:'useExperimentalScoring', value:S.useExperimentalScoring});
  dbPut('settings',{key:'calcStartDate',         value:S.calcStartDate});
  dbPut('settings',{key:'showQuickDelete',   value:S.showQuickDelete});
  dbPut('settings',{key:'relationshipMode',  value:S.relationshipMode});
  dbPut('settings',{key:'calFilters',        value:[...S.calFilters]});
  dbPut('settings',{key:'loveBankWindow',    value:S.loveBankWindow});
  dbPut('settings',{key:'gaugeMode',         value:S.gaugeMode});
  dbPut('settings',{key:'needsTab',          value:S.needsTab});
  dbPut('settings',{key:'needsSort',         value:S.needsSort});
}
function loadSettings(){
  return Promise.all([
    dbGet('settings','physicalTypes').then(s=>{
      if(s&&s.value) {
        // Migrate old flat string arrays to object format
        S.physicalTypes = s.value.map(t =>
          typeof t === 'string' ? {name:t, defaultSolo: t.toLowerCase()==='solo'} : t
        );
      }
    }),
    dbGet('settings','affectionTypes').then(s=>{
      if(s&&s.value) S.affectionTypes=s.value.map(t=>{
        if (typeof t === 'string') return {name:t, descEffort:1, descTime:1, descFinancial:1, descRarity:1, descPresence:1};
        // Recalculate weight from profile (removes hardcoded 50)
        const updated = {...t};
        if (updated.descEffort != null) updated.weight = deriveActivityWeight(updated);
        return updated;
      });
    }),
    dbGet('settings','caretakerTypes').then(s=>{
      if(s&&s.value&&s.value.length>0) {
        S.caretakerTypes = s.value.map(savedType => {
          // Recalculate weight from profile in case formula changed
          const updated = {...savedType};
          updated.weight = deriveCaretakerWeight(updated);
          return updated;
        });
      } else {
        S.caretakerTypes = [];
      }
    }),
    dbGet('settings','restoreTypes').then(s=>{
      if(s&&s.value) S.restoreTypes=s.value.map(t=>typeof t==='string'?{name:t,needsMap:{}}:t);
    }),
    dbGet('settings','challengingEmotionTags').then(s=>{
      if(s&&s.value&&Array.isArray(s.value)) {
        // Migrate legacy broad tags to granular equivalents
        S.challengingEmotionTags = s.value.map(t =>
          t === 'Fear'       ? 'Apprehension' :
          t === 'Anger'      ? 'Angry' :
          t === 'Despair'    ? 'Despairing' :
          t === 'Shame'      ? 'Ashamed' :
          t === 'Guilt'      ? 'Guilty' :
          t === 'Fatigue'    ? 'Exhausted' :
          t === 'Withdrawal' ? 'Withdrawn' :
          t === 'Grief'      ? 'Grieving' :
          t
        );
      } else S.challengingEmotionTags = [...DEFAULT_CHALLENGING_EMOTION_TAGS];
    }),
    dbGet('settings','whomList').then(s=>{
      if(s&&s.value&&Array.isArray(s.value)) S.whomList = s.value;
      else S.whomList = [...DEFAULT_WHOM_LIST];
    }),
    dbGet('settings','weights').then(s=>{
      if(s&&s.value) {
        S.weights = Object.assign({}, S.weights, s.value);
        // Always use current defaults — overrides any saved values from old scale
        S.weights.confR = {resolved:0.40, partial:0.60, unresolved:0.80, worsened:1.00, breakthrough:0.20};
      }
    }),
    dbGet('settings','needsRanking').then(s=>{
      if(s&&s.value&&Array.isArray(s.value)) S.needsRanking = s.value;
    }),
    dbGet('settings','personalNeedsRanking').then(s=>{
      if(s&&s.value&&Array.isArray(s.value)) S.personalNeedsRanking = s.value;
    }),
    dbGet('settings','partnerPronouns').then(s=>{
      if(s&&s.value) S.partnerPronouns = s.value;
    }),
    dbGet('settings','userPronouns').then(s=>{
      if(s&&s.value) S.userPronouns = s.value;
    }),
    dbGet('settings','showCaretaker').then(s=>{
      if(s&&s.value!=null) S.showCaretaker = s.value;
    }),
    dbGet('settings','showRegulation').then(s=>{
      if(s&&s.value!=null) S.showRegulation = s.value;
    }),
    dbGet('settings','showPhysical').then(s=>{
      if(s&&s.value!=null) S.showPhysical = s.value;
    }),
    dbGet('settings','showRepair').then(s=>{
      if(s&&s.value!=null) S.showRepair = s.value;
    }),
    dbGet('settings','showAttachment').then(s=>{
      if(s&&s.value!=null) S.showAttachment = s.value;
    }),
    dbGet('settings','horsemenExpanded').then(s=>{
      if(s&&s.value!=null) S.horsemenExpanded = s.value;
    }),
    dbGet('settings','tagPolyvagalOverrides').then(s=>{
      if(s&&s.value&&typeof s.value==='object') S.tagPolyvagalOverrides = s.value;
    }),
    dbGet('settings','tagToneOverrides').then(s=>{
      if(s&&s.value&&typeof s.value==='object') S.tagToneOverrides = s.value;
      else dbGet('settings','tagFamilyOverrides').then(s2=>{
        if(s2&&s2.value&&typeof s2.value==='object') S.tagToneOverrides = s2.value;
      });
    }),
    dbGet('settings','showDebug').then(s=>{
      if(s&&s.value!=null) S.showDebug = s.value;
    }),
    dbGet('settings','showCardPoints').then(s=>{
      if(s&&s.value!=null) S.showCardPoints = s.value;
    }),
    dbGet('settings','needs2Ratings').then(s=>{
      if(s&&s.value&&typeof s.value==='object') S.needs2Ratings = s.value;
    }),
    dbGet('settings','needs2Order').then(s=>{
      if(s&&Array.isArray(s.value)) S.needs2Order = s.value;
    }),
    dbGet('settings','needs2Hits').then(s=>{
      if(s&&s.value&&typeof s.value==='object') S.needs2Hits = s.value;
    }),
    dbGet('settings','needsHits').then(s=>{
      if(s&&s.value&&typeof s.value==='object') S.needsHits = s.value;
    }),
    dbGet('settings','needsPnHits').then(s=>{
      if(s&&s.value&&typeof s.value==='object') S.needsPnHits = s.value;
    }),
    dbGet('settings','needs2Sort').then(s=>{
      if(s&&s.value!=null) S.needs2Sort = s.value;
    }),
    dbGet('settings','useExperimentalScoring').then(s=>{
      if(s&&s.value!=null) S.useExperimentalScoring = s.value;
    }),
    dbGet('settings','calcStartDate').then(s=>{
      if(s&&s.value!=null) S.calcStartDate = s.value;
    }),
    dbGet('settings','showQuickDelete').then(s=>{
      if(s&&s.value!=null) S.showQuickDelete = s.value;
    }),
    dbGet('settings','relationshipMode').then(s=>{
      if(s&&s.value) S.relationshipMode = s.value;
    }),
    dbGet('settings','theme').then(()=>{
    }),
    dbGet('settings','calFilters').then(s=>{
      if(s&&Array.isArray(s.value)) {
        // Migrate legacy 'partner' category name to 'notes'
        S.calFilters = new Set(s.value.map(v => v === 'partner' ? 'notes' : v));
      }
    }),
    dbGet('settings','loveBankWindow').then(s=>{
      if(s && s.value != null) S.loveBankWindow = Number(s.value);
    }),
    dbGet('settings','gaugeMode').then(s=>{
      if(s && s.value) S.gaugeMode = s.value;
    }),
    dbGet('settings','needsTab').then(s=>{
      if(s && s.value) S.needsTab = s.value;
    }),
    dbGet('settings','needsSort').then(s=>{
      if(s && s.value) S.needsSort = s.value;
    }),

  ]);
}
