'use strict';

/* ── Export ─────────────────────────────────────────── */
function downloadFile(filename, content, type) {
  const blob = new Blob([content], {type});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    version: 4,
    entries: S.allEntries,
    settings: {
      physicalTypes:        S.physicalTypes,
      affectionTypes:       S.affectionTypes,
      caretakerTypes:       S.caretakerTypes,
      restoreTypes:         S.restoreTypes,
      challengingEmotionTags: S.challengingEmotionTags,
      weights:              S.weights,
      needsRanking:         S.needsRanking,
      personalNeedsRanking: S.personalNeedsRanking,
      partnerPronouns:      S.partnerPronouns,
      userPronouns:         S.userPronouns,
      showCaretaker:        S.showCaretaker,
      showRegulation:       S.showRegulation,
      showPhysical:         S.showPhysical,
      calFilters:           [...S.calFilters],
    }
  };
  downloadFile(
    `daily-log-${S.today}.json`,
    JSON.stringify(data, null, 2),
    'application/json'
  );
  return true;
}

function entryKey(e) {
  // Stable dedup key: date + category + primary identifying field
  const extra = e.category==='physical'  ? (e.eventType||'')+(e.solo?'solo':'shared')
              : e.category==='affection' ? (e.eventType||'')
              : e.category==='libido'    ? (e.libiLevel||'')
              : e.category==='conflict'  ? (e.intensity||'')
              : e.category==='turndown'  ? (e.turndownType||'')+(e.initiatedBy||'')
              : e.category==='notes'   ? (e.stressorTitle||'').slice(0,20)
              : e.category==='burnout'   ? (Array.isArray(e.caretakerTypes)?e.caretakerTypes.join(','):e.caretakerType||'')+(e.duration||'')
              : '';
  return `${e.date}|${e.category}|${extra}`;
}

function exportSummary() {
  const lines = [];
  const firstDate = S.allEntries.length ? S.allEntries.map(e=>e.date).sort()[0] : null;
  const lastDate  = S.allEntries.length ? S.allEntries.map(e=>e.date).sort().pop() : null;

  lines.push('DAILY LOG — RELATIONSHIP WELLNESS SUMMARY');
  lines.push('═══════════════════════════════════════');
  lines.push('Exported: ' + new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}));
  lines.push('Total entries: ' + S.allEntries.length);
  if (firstDate && lastDate) lines.push('Date range: ' + fmtDate(firstDate) + ' → ' + fmtDate(lastDate));
  lines.push('');
  lines.push('CATEGORIES TRACKED');
  lines.push('  Physical       — Shared and solo intimacy events, intensity and initiation');
  lines.push('  '+bondingLabel().padEnd(15)+'— '+bondingLabel()+' experiences, connection quality');
  lines.push('  Mood/Energy/Desire — Daily state check-in (MED)');
  lines.push('  Conflict       — Arguments and hard conversations, intensity and resolution');
  lines.push('  Turn down      — Unmet desire events, type and who initiated');
  lines.push(`  Steadying      — My resource expenditure supporting ${P.obj} or others; scores Personal only`);
  lines.push('  Restorative    — Activities that restore my own capacity; scores Personal only');
  lines.push('  Life Wobble    — Personal emotional regulation; scores Personal only');
  lines.push('  Notes          — Free-form notes for the day');
  lines.push('');

  // Group by date
  const byDate = {};
  for (const e of S.allEntries) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  const dates = Object.keys(byDate).sort();
  if (!dates.length) { downloadFile(`daily-log-summary-${S.today}.txt`, lines.join('\n'), 'text/plain'); return true; }

  // Group dates into Monday-anchored weeks
  const getMonday = ds => {
    const dt = new Date(ds + 'T00:00:00');
    const dow = dt.getDay();
    const diff = dow === 0 ? 6 : dow - 1;
    dt.setDate(dt.getDate() - diff);
    return dateStr(dt);
  };

  const weekMap = {};
  for (const d of dates) {
    const mon = getMonday(d);
    if (!weekMap[mon]) weekMap[mon] = [];
    weekMap[mon].push(d);
  }

  for (const mon of Object.keys(weekMap).sort()) {
    const weekDates = weekMap[mon];
    const weekEntries = weekDates.flatMap(d => byDate[d]);

    // Week summary line
    const sun = new Date(mon + 'T00:00:00');
    sun.setDate(sun.getDate() + 6);
    const monFmt = new Date(mon+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const sunFmt = sun.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    const wPhys     = weekEntries.filter(e=>e.category==='physical'&&!e.solo).length;
    const wAff      = weekEntries.filter(e=>e.category==='affection').length;
    const wRestore  = weekEntries.filter(e=>e.category==='restore').length;
    const wConflict = weekEntries.filter(e=>e.category==='conflict').reduce((s,e)=>s+(e.intensity||1),0);
    const wBurnout  = Math.round(weekEntries.filter(e=>e.category==='burnout').reduce((s,e)=>s+burnoutLoadEntry(e),0));
    const wNotes    = weekEntries.filter(e=>e.category==='notes').length;

    lines.push('═══════════════════════════════════════');
    lines.push(`WEEK OF ${monFmt} – ${sunFmt}`);
    const summaryParts = [];
    if (wPhys > 0)     summaryParts.push(`${wPhys} shared physical`);
    if (wAff > 0)      summaryParts.push(`${wAff} ${bondingLabel().toLowerCase()}`);
    if (wRestore > 0)  summaryParts.push(`${wRestore} restorative`);
    if (wConflict > 0) summaryParts.push(`conflict load ${wConflict}`);
    if (wBurnout > 0)  summaryParts.push(`steadying load ${wBurnout}`);
    if (wNotes > 0)    summaryParts.push(`${wNotes} note${wNotes!==1?'s':''}`);
    lines.push('Summary: ' + (summaryParts.length ? summaryParts.join(' · ') : 'Light week'));
    lines.push('');

    for (const d of weekDates) {
      lines.push('  ── ' + fmtDate(d) + ' ──');
      for (const e of byDate[d]) {
        let line = '    [' + (CAT_LABELS[e.category]||e.category).toUpperCase() + '] ';
        if (e.category==='physical') {
          line += (e.solo?'Solo':'Shared') + ' · ' + (e.eventType||'');
          if (!e.solo && e.connectionQuality) {
            const cq = CONNECTION_QUALITY.find(q=>q.val===e.connectionQuality);
            line += cq ? ' · ' + cq.label : '';
          }
          if (e.solo && e.intensity) {
            const intDesc = PHYSICAL_INTENSITY[e.intensity-1];
            line += ' · ' + e.intensity + '★' + (intDesc ? ' ('+intDesc.desc+')' : '');
          }
          if (e.soloContext) line += ' · Context: ' + (SOLO_CONTEXT.find(c=>c.val===e.soloContext)?.label||'');
          if (!e.solo && e.initiatedBy) line += ' · ' + (e.initiatedBy==='me'?'I initiated':e.initiatedBy==='her'?`${P.Sub} initiated`:'Mutual');
        } else if (e.category==='affection') {
          const cq  = CONNECTION_QUALITY.find(q=>q.val===(e.connectionQuality||3));
          const who = e.initiatedBy==='me'?'I initiated':e.initiatedBy==='her'?`${P.Sub} initiated`:e.initiatedBy==='mutual'?'Mutual':'';
          line += (e.eventType||bondingLabel()) + (cq?' · '+cq.label:'') + (who?' · '+who:'');
        } else if (e.category==='libido') {
          const lvl = LIBIDO_LEVELS[e.libiLevel-1];
          line += `Mood, Energy & Desire`;
          if (e.mood)     line += ` · Mood ${e.mood}/5`;
          if (e.energy)   line += ` · Energy ${e.energy}/5`;
          if (e.libiLevel) line += ` · Desire ${e.libiLevel}/5 — ${lvl?lvl.label:''}`;
        } else if (e.category==='conflict') {
          const cl = CONFLICT_LEVELS.find(x=>x.val===e.intensity);
          const cr = CONFLICT_RESOLUTION.find(x=>x.val===(e.resolution||'unresolved'));
          const ch = e.harm ? CONFLICT_HARM.find(x=>x.val===e.harm) : null;
          line += cl ? `${cl.label}` : 'Intensity ' + e.intensity;
          if (ch) line += ` · Harm: ${ch.label}`;
          if (cr) line += ` · ${cr.label}`;
        } else if (e.category==='turndown') {
          if (e.initiatedBy === 'her') {
            const tt  = TURNDOWN_TYPES.find(x=>x.val===e.turndownType);
            const sig = e.tdSignificance ? TURNDOWN_SIGNIFICANCE.find(s=>s.val===e.tdSignificance)?.label : null;
            const imp = e.tdImpact ? TURNDOWN_IMPACT.find(i=>i.val===e.tdImpact)?.label : null;
            const scored = bankScoreEntry(e, 1.0);
            line += `${P.Sub} turned down`
              + (imp ? ` · Impact: ${imp}` : '')
              + (sig ? ` · ${sig}` : '')
              + (tt ? ` · ${tt.label}` : '')
              + (scored.score ? ` · ${scored.score.toFixed(1)} pts` : '');
          } else {
            const tt = TD_MY_HOW.find(x=>x.val===e.turndownType);
            const reason = e.tdMyReason ? TD_MY_REASONS.find(r=>r.val===e.tdMyReason)?.label : null;
            line += `I turned ${P.obj} down`
              + (reason ? ` · ${reason}` : '')
              + (tt ? ` · ${resolveSub(tt.label)}` : '');
          }
        } else if (e.category==='notes') {
          line += (e.stressorTitle||'Note') + (e.observed ? ' — ' + e.observed.slice(0,80) : '');
        } else if (e.category==='burnout') {
          const types   = Array.isArray(e.burnoutTypes) ? e.burnoutTypes : (e.burnoutType ? [e.burnoutType] : []);
          const dl      = DRAIN_LEVELS.find(x=>x.val===e.drain);
          const outcome = e.caretakerOutcome ? CARETAKER_OUTCOME.find(o=>o.val===Number(e.caretakerOutcome)) : null;
          const scored  = bankScoreEntry(e, 1.0);
          const typeStr = e.caretakerType
            ? e.caretakerType + (types.length > 0 ? ' — ' + types.join(', ') : '')
            : types.map(t=>burnoutLabel(t).label).join(', ');
          line += typeStr
            + (e.duration ? ' · ' + e.duration : '')
            + (dl ? ' · Drain: ' + dl.label : '')
            + (outcome ? ' · ' + outcome.label : '')
            + (e.ctContext === 'relationship' ? ' · ⚠ My partner' : e.ctContext === 'external' ? ' · Not my partner' : '')
            + (scored.score !== 0 ? ' · ' + (scored.score > 0 ? '+' : '') + scored.score.toFixed(1) + ' pts' : '');
        } else if (e.category==='restore') {
          const rq = RESTORE_QUALITY.find(q=>q.val===migrateRestoreQuality(e.restoreQuality, e));
          const ri = RESTORE_IMMERSION.find(i=>i.val===(e.restoreImmersion||3));
          line += (e.eventType||'Restorative')
            + (ri ? ' · ' + ri.label : '')
            + (rq ? ' · ' + rq.label : '');
          const obstacles = (e.restoreObstacles||[]).map(v=>RESTORE_OBSTACLES.find(o=>o.val===v)?.label||v);
          if (obstacles.length > 0) line += ' · Obstacles: ' + obstacles.join(', ');
        } else if (e.category==='regulation') {
          const trigger  = e.regulationTrigger ? WOBBLE_TRIGGER.find(t=>t.val===e.regulationTrigger)?.label || e.regulationTrigger : null;
          const res      = e.regulationResolution ? WOBBLE_RESOLUTION.find(r=>r.val===e.regulationResolution) : null;
          const emotions = (e.regulationEmotions||[]).join(', ');
          const cap      = bankDayCap(S.allEntries.find(le=>le.date===e.date&&le.category==='libido'));
          const cost     = wobbleRestoreScore(e, cap);
          line += 'Life Wobble'
            + (e.regulationIntensity ? ` · Intensity ${e.regulationIntensity}/5` : '')
            + (trigger ? ` · ${trigger}` : '')
            + (emotions ? ` · ${emotions}` : '')
            + (res ? ` · ${res.label}` : '')
            + (cost !== 0 ? ` · ${cost.toFixed(1)} pts (restore)` : '');
        }
        lines.push(line);
        if (e.notes)    lines.push('      Notes: ' + e.notes);
        if (e.observed) lines.push('      Observed: ' + e.observed);
      }
      lines.push('');
    }
  }

  downloadFile(
    `daily-log-summary-${S.today}.txt`,
    lines.join('\n'),
    'text/plain'
  );
  return true;
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.entries || !Array.isArray(data.entries)) throw new Error('Invalid format — no entries array found.');

      // Warn on unknown version but proceed
      if (data.version && data.version > 4) {
        console.warn('Import: file version '+data.version+' is newer than this app (v4). Proceeding anyway.');
      }

      // Restore settings first (synchronously before entries)
      if (data.settings) {
        if (data.settings.physicalTypes)        S.physicalTypes        = data.settings.physicalTypes;
        if (data.settings.affectionTypes)       S.affectionTypes       = data.settings.affectionTypes;
        if (data.settings.caretakerTypes)       S.caretakerTypes       = data.settings.caretakerTypes;
        if (data.settings.restoreTypes)         S.restoreTypes         = data.settings.restoreTypes;
        if (data.settings.challengingEmotionTags && Array.isArray(data.settings.challengingEmotionTags))
          S.challengingEmotionTags = data.settings.challengingEmotionTags;
        if (data.settings.weights) {
          S.weights = Object.assign({}, S.weights, data.settings.weights);
          S.weights.confR = {resolved:0.40, partial:0.60, unresolved:0.80, worsened:1.00, breakthrough:0.20};
        }
        if (data.settings.needsRanking && Array.isArray(data.settings.needsRanking))
          S.needsRanking = data.settings.needsRanking;
        if (data.settings.personalNeedsRanking && Array.isArray(data.settings.personalNeedsRanking))
          S.personalNeedsRanking = data.settings.personalNeedsRanking;
        if (data.settings.partnerPronouns)      S.partnerPronouns      = data.settings.partnerPronouns;
        if (data.settings.userPronouns)         S.userPronouns         = data.settings.userPronouns;
        if (data.settings.showCaretaker  != null) S.showCaretaker      = data.settings.showCaretaker;
        if (data.settings.showRegulation != null) S.showRegulation     = data.settings.showRegulation;
        if (data.settings.showPhysical   != null) S.showPhysical       = data.settings.showPhysical;
        if (data.settings.calFilters && Array.isArray(data.settings.calFilters))
          S.calFilters = new Set(data.settings.calFilters);
        saveSettings();
        dbPut('settings', {key:'onboarded', value:true}); // prevent onboarding from running again after import
      }

      // Validate and filter entries
      const validCategories = new Set(['physical','affection','libido','conflict','turndown','notes','burnout','restore','regulation']);
      const validEntries = data.entries.filter(e => {
        if (!e || typeof e !== 'object') return false;
        if (!e.date || typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return false;
        if (!e.category || !validCategories.has(e.category)) return false;
        return true;
      });
      const invalidCount = data.entries.length - validEntries.length;

      // Dedup by stable key (date + category + primary field) not just ID
      const existingKeys = new Set(S.allEntries.map(entryKey));
      const toImport = validEntries.filter(e => !existingKeys.has(entryKey(e)));
      const dupCount = validEntries.length - toImport.length;

      let imported = 0;
      const importNext = (i) => {
        if (i >= toImport.length) {
          loadAll().then(loadDay).then(()=>{
            closeModal();
            render();
            const parts = [`${imported} new entries added`];
            if (dupCount > 0)     parts.push(`${dupCount} duplicate${dupCount!==1?'s':''} skipped`);
            if (invalidCount > 0) parts.push(`${invalidCount} invalid entr${invalidCount!==1?'ies':'y'} skipped`);
            setTimeout(()=>alert('Import complete. ' + parts.join(', ') + '.'), 100);
          });
          return;
        }
        const entry = {...toImport[i]};
        delete entry.id;
        dbPut('entries', entry).then(()=>{imported++;importNext(i+1);});
      };
      importNext(0);

    } catch(err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function buildExportSheet() {
  // Single file input, cleaned up on close
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  fileInput.onchange = e => { if(e.target.files[0]) importJSON(e.target.files[0]); };
  document.body.appendChild(fileInput);
  const cleanup = () => { if(fileInput.parentNode) fileInput.parentNode.removeChild(fileInput); };

  const firstDate = S.allEntries.length ? S.allEntries.map(e=>e.date).sort()[0] : null;
  const lastDate  = S.allEntries.length ? S.allEntries.map(e=>e.date).sort().pop() : null;
  const days = firstDate && lastDate ? [...new Set(S.allEntries.map(e=>e.date))].length : 0;

  const exportWithFeedback = (fn, btn) => {
    fn();
    btn.textContent = '✓ Saved';
    btn.style.color = 'var(--c-partner)';
    setTimeout(()=>{ btn.textContent = 'Export'; btn.style.color = ''; }, 2500);
  };

  const jsonBtn    = h('button',{class:'export-btn',onclick:()=>exportWithFeedback(exportJSON, jsonBtn)},   'Export');
  const summaryBtn = h('button',{class:'export-btn',onclick:()=>exportWithFeedback(exportSummary, summaryBtn)}, 'Export');

  const ov = overlay(h('div',{},
    h('div',{class:'sheet-title'},'Export & Backup'),
    h('div',{class:'export-row'},
      h('div',{},
        h('div',{class:'export-row-title'},'JSON Backup'),
        h('div',{class:'export-row-desc'},'Full data export for backup or moving to another device.')
      ),
      jsonBtn
    ),
    h('div',{class:'export-row'},
      h('div',{},
        h('div',{class:'export-row-title'},'Readable Summary'),
        h('div',{class:'export-row-desc'},'Weekly plain text export. Good for sharing with your therapist.')
      ),
      summaryBtn
    ),
    h('div',{class:'export-row'},
      h('div',{},
        h('div',{class:'export-row-title'},'Import JSON'),
        h('div',{class:'export-row-desc'},'Restore from a backup. Duplicates are automatically skipped.')
      ),
      h('button',{class:'export-btn',onclick:()=>fileInput.click()},'Import')
    ),
    h('div',{class:'export-row'},
      h('div',{},
        h('div',{class:'export-row-title',style:{color:'var(--muted)'}},'Data'),
        h('div',{class:'export-row-desc'},
          S.allEntries.length + ' entries · ' + days + ' days logged' +
          (firstDate ? ' · ' + new Date(firstDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + ' → now' : '')
        )
      ),
      h('div',{})
    )
  ));

  // Clean up file input when overlay is dismissed (either by clicking outside or closeModal)
  ov.addEventListener('click', e => { if(e.target===ov) { cleanup(); } });

  return ov;
}
