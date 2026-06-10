'use strict';

/* ── Calibration UI (generic, used by both EN and PN tabs) ──────
 * Renders the numbered list of needs, up/down arrows, the "Start / Re-calibrate"
 * button, and the quiz modal. Parameterized by cfg:
 *   quizKey      — S key for the transient quiz state
 *   rankingKey   — S key for the final ranking array
 *   hitsKey      — S key for saved hits map
 *   needsList    — EMOTIONAL_NEEDS or PERSONAL_NEEDS
 *   quizData     — NEEDS2_QUIZ or NEEDS_PN_QUIZ
 *   tallyHits / buildTieGroups / orderFromCounts — corresponding helpers
 *   onSaved      — extra work after save (e.g. recalculateAllWeights)
 *   accentColor  — CSS color var for highlights
 *   modalId      — DOM id used to portal the modal onto document.body
 *   savedToastMsg— toast text when calibration is committed
 */
function buildCalibrationSection(cfg) {
  if (!S[cfg.quizKey]) S[cfg.quizKey] = { open: false, idx: 0, answers: {}, tieGroups: null };
  const quiz = S[cfg.quizKey];
  const baseCount = cfg.quizData.length;
  const inTieBreaker = quiz.idx >= baseCount;
  const totalQuestions = baseCount + needs2TotalTieBreakers(quiz.tieGroups);

  const openQuiz = () => {
    S[cfg.quizKey] = { open: true, idx: 0, answers: {}, tieGroups: null };
    render();
  };
  const closeQuiz = () => {
    S[cfg.quizKey] = { ...quiz, open: false };
    render();
  };
  const goBack = () => {
    if (quiz.idx > 0) {
      S[cfg.quizKey] = { ...quiz, idx: quiz.idx - 1 };
      render();
    }
  };
  const onSaveQuiz = () => {
    const counts = cfg.tallyHits(quiz.answers);
    const order  = cfg.orderFromCounts(counts, quiz.tieGroups);
    S[cfg.rankingKey] = order;
    S[cfg.hitsKey]    = counts;
    if (cfg.onSaved) cfg.onSaved();
    saveSettings();
    showToast(cfg.savedToastMsg);
    closeQuiz();
  };
  const goNext = () => {
    if (!inTieBreaker && quiz.idx === baseCount - 1) {
      const counts    = cfg.tallyHits(quiz.answers);
      const tieGroups = cfg.buildTieGroups(counts);
      if (tieGroups.length > 0) {
        S[cfg.quizKey] = { ...quiz, idx: baseCount, tieGroups };
        render();
      } else {
        S[cfg.quizKey] = { ...quiz, tieGroups: null };
        onSaveQuiz();
      }
      return;
    }
    if (quiz.idx < totalQuestions - 1) {
      S[cfg.quizKey] = { ...quiz, idx: quiz.idx + 1 };
      render();
    } else {
      onSaveQuiz();
    }
  };
  const selectChoice = (choiceIdx) => {
    const max = cfg.maxSelections || 1;
    const raw = quiz.answers[quiz.idx];
    const current = Array.isArray(raw) ? raw.slice() : (raw != null ? [raw] : []);
    let next;
    if (current.includes(choiceIdx)) {
      // Tap a selected choice → deselect
      next = current.filter(i => i !== choiceIdx);
    } else if (max === 1) {
      // Single-select: replace
      next = [choiceIdx];
    } else if (current.length < max) {
      // Multi-select with room left: add
      next = [...current, choiceIdx];
    } else {
      // At max — ignore the tap, user must deselect first
      return;
    }
    S[cfg.quizKey] = { ...quiz, answers: { ...quiz.answers, [quiz.idx]: next }, tieGroups: null };
    render();
  };
  const selectTieBreaker = (chosenVal) => {
    const tbIdx = quiz.idx - baseCount;
    const info  = needs2TieBreakerAt(quiz.tieGroups, tbIdx);
    if (!info) return;
    const newGroups = quiz.tieGroups.map((g, gi) => {
      if (gi !== info.groupIdx) return g;
      const newPicks = g.picks.slice(0, info.pickIdx);
      newPicks.push(chosenVal);
      return { ...g, picks: newPicks };
    });
    S[cfg.quizKey] = { ...quiz, tieGroups: newGroups };
    render();
  };
  const moveNeed = (val, delta) => {
    const order = (S[cfg.rankingKey] || []).slice();
    const idx = order.indexOf(val);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    S[cfg.rankingKey] = order;
    if (cfg.onSaved) cfg.onSaved();
    saveSettings();
    render();
  };

  const isLast    = quiz.idx === totalQuestions - 1;
  const hasAnswer = (() => {
    if (!inTieBreaker) {
      const a = quiz.answers[quiz.idx];
      if (Array.isArray(a)) return a.length > 0;
      return a != null;
    }
    const info = needs2TieBreakerAt(quiz.tieGroups || [], quiz.idx - baseCount);
    return info != null && info.group.picks.length > info.pickIdx;
  })();
  const willEnterTieBreakers = !inTieBreaker && quiz.idx === baseCount - 1 && (() => {
    const c = cfg.tallyHits(quiz.answers);
    return cfg.buildTieGroups(c).length > 0;
  })();

  // List ordering — the ranking array should always contain all needs vals
  const orderedNeeds = (S[cfg.rankingKey] || [])
    .map(val => cfg.needsList.find(n => n.val === val))
    .filter(Boolean);

  const listEl = h('div',{style:{marginBottom:'12px'}},
    ...orderedNeeds.map((need, idx) => {
      const isFirstRow = idx === 0;
      const isLastRow  = idx === orderedNeeds.length - 1;

      const btnStyle = (disabled) => ({
        width:'28px', height:'28px', borderRadius:'7px',
        border:'1px solid var(--border)', background:'var(--surface-1)',
        fontSize:'13px', cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--muted-3)' : 'var(--muted)',
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:'0',
      });
      const upBtn = h('button',{style:btnStyle(isFirstRow)}, '↑');
      if (isFirstRow) upBtn.disabled = true;
      else upBtn.addEventListener('click', () => moveNeed(need.val, -1));
      const dnBtn = h('button',{style:btnStyle(isLastRow)}, '↓');
      if (isLastRow) dnBtn.disabled = true;
      else dnBtn.addEventListener('click', () => moveNeed(need.val, 1));

      const labelEl = h('span',{style:{fontSize:'13px',color:'var(--text)'}}, need.label);

      return h('div',{style:{
        display:'flex', alignItems:'flex-start', gap:'10px',
        padding:'10px 12px', borderRadius:'10px', marginBottom:'4px',
        background:'var(--bg2)', border:'1px solid var(--border)',
      }},
        h('span',{style:{fontSize:'11px',color:'var(--muted)',width:'18px',textAlign:'center',flexShrink:'0',fontFamily:"'Libre Baskerville',serif",paddingTop:'1px'}}, String(idx+1)),
        h('span',{style:{fontSize:'18px',width:'24px',textAlign:'center',flexShrink:'0',lineHeight:'1.3'}}, need.icon || ''),
        h('div',{style:{flex:'1'}},
          labelEl,
          need.hint ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginTop:'2px',lineHeight:'1.4'}},
            typeof need.hint === 'function' ? need.hint() : need.hint
          ) : null
        ),
        h('div',{style:{display:'flex',flexDirection:'column',gap:'2px',flexShrink:'0'}}, upBtn, dnBtn)
      );
    })
  );

  const hasRun = S[cfg.hitsKey] && Object.values(S[cfg.hitsKey]).some(v => v > 0);
  const ctaButton = h('button',{
    style:{
      width:'100%', marginBottom:'12px',
      padding:'12px', borderRadius:'14px', border:'none',
      background: cfg.accentColor, color:'var(--bg)',
      fontSize:'13px', fontWeight:'500', cursor:'pointer',
      fontFamily:"'DM Sans',sans-serif",
    },
    onclick: openQuiz,
  }, hasRun ? 'Re-calibrate' : 'Start calibration');

  // ── Debug panel ──
  const debugPanel = S.showDebug ? (() => {
    const savedCounts = S[cfg.hitsKey] || {};
    const hasSaved    = Object.values(savedCounts).some(v => v > 0);
    const draftCounts = cfg.tallyHits(quiz.answers || {});
    const hasDraft    = Object.values(draftCounts).some(v => v > 0);
    const liveCounts  = hasSaved && !hasDraft ? savedCounts : draftCounts;
    const hasAnyHits  = hasSaved || hasDraft;
    const rows = cfg.needsList.map(n => {
      const hits  = liveCounts[n.val] || 0;
      const slots = cfg.slotsMap[n.val] || 0;
      const ratio = slots > 0 ? hits / slots : 0;
      const rank  = (S[cfg.rankingKey] || []).indexOf(n.val);
      return { val: n.val, label: n.label, hits, slots, ratio, rank };
    }).sort((a, b) => {
      if (b.hits  !== a.hits)  return b.hits  - a.hits;
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return a.label.localeCompare(b.label);
    });

    const headerCell = (txt, w) => h('span',{style:{
      width:w, textAlign:'right', flexShrink:'0',
      fontSize:'10px', color:'var(--muted)',
      letterSpacing:'0.04em', textTransform:'uppercase',
    }}, txt);
    const dataCell = (txt, w, mono) => h('span',{style:{
      width:w, textAlign:'right', flexShrink:'0',
      fontSize:'11px', color:'var(--muted)',
      fontFamily: mono ? "'Libre Baskerville',serif" : "'DM Sans',sans-serif",
    }}, txt);

    return h('div',{style:{
      marginTop:'12px', padding:'10px 12px', borderRadius:'10px',
      background:'var(--surface-1)', border:'1px solid var(--surface-2)',
      fontSize:'11px', fontFamily:"'DM Sans',sans-serif",
    }},
      h('div',{style:{fontWeight:'600',color:'var(--text-strong)',marginBottom:'8px',fontSize:'11px',letterSpacing:'0.06em',textTransform:'uppercase'}},
        (cfg.debugLabel || 'Love needs') + ' · debug'),
      h('div',{style:{fontSize:'10px',color:'var(--muted)',marginBottom:'8px',lineHeight:'1.5'}},
        hasAnyHits
          ? (hasSaved && !hasDraft ? 'Showing saved hit counts and final ranking.' : 'Showing current draft answers (not yet saved).')
          : 'No answers yet. Start the calibration to populate.'),
      h('div',{style:{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0',borderBottom:'1px solid var(--surface-2)'}},
        h('span',{style:{flex:'1',fontSize:'10px',color:'var(--muted)',letterSpacing:'0.04em',textTransform:'uppercase'}}, 'Need'),
        headerCell('Hits', '38px'),
        headerCell('Slots','38px'),
        headerCell('Ratio','48px'),
        headerCell('Rank', '48px'),
      ),
      ...rows.map(r => h('div',{style:{
        display:'flex', alignItems:'center', gap:'8px',
        padding:'4px 0', borderBottom:'1px solid var(--surface-2)',
      }},
        h('span',{style:{flex:'1', fontSize:'11px', color:'var(--text)'}}, r.label),
        dataCell(String(r.hits),  '38px', true),
        dataCell(String(r.slots), '38px', false),
        dataCell(r.ratio.toFixed(2), '48px', true),
        dataCell(r.rank >= 0 ? '#'+(r.rank+1) : '—', '48px', true),
      )),
      h('div',{style:{marginTop:'8px',fontSize:'10px',color:'var(--muted)',lineHeight:'1.5'}},
        'Sorted by hits (selections). Rank column shows position in '+cfg.rankingKey+' after save / manual reorder.'
      ),
    );
  })() : null;

  // Modal (only rendered when open)
  const quizModal = quiz.open ? (() => {
    let qText, qChoices, currentAnswerIdx, onPick;
    let selectedSet;
    if (inTieBreaker) {
      const info = needs2TieBreakerAt(quiz.tieGroups, quiz.idx - baseCount);
      const pool = info ? needs2TieBreakerPool(info.group, info.pickIdx) : [];
      const poolNeeds = pool.map(v => cfg.needsList.find(n => n.val === v)).filter(Boolean);
      const remaining = pool.length;
      qText = remaining === info.group.members.length
        ? 'Tie-breaker — these needs tied. Which matters most to you?'
        : (remaining === 2
            ? 'Between the last two, which matters more?'
            : 'And from the remaining, which matters most next?');
      qChoices = poolNeeds.map(n => ({ label: n.label, val: n.val }));
      const tbPickIdx = info.group.picks[info.pickIdx] != null
        ? qChoices.findIndex(c => c.val === info.group.picks[info.pickIdx])
        : -1;
      selectedSet = new Set(tbPickIdx >= 0 ? [tbPickIdx] : []);
      onPick = (cIdx) => selectTieBreaker(qChoices[cIdx].val);
    } else {
      const current = cfg.quizData[quiz.idx];
      qText = applyPartnerPronouns(current.q);
      qChoices = current.choices.map(c => ({ label: applyPartnerPronouns(c.label) }));
      const raw = quiz.answers[quiz.idx];
      const indices = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
      selectedSet = new Set(indices);
      onPick = (cIdx) => selectChoice(cIdx);
    }
    return h('div',{style:{
      position:'fixed', inset:'0', zIndex:'1000',
      background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:'20px',
    }, onclick:(e)=>{ if (e.target === e.currentTarget) closeQuiz(); }},
      h('div',{style:{
        background:'var(--bg)', borderRadius:'18px',
        border:'1px solid var(--border)',
        width:'100%', maxWidth:'460px', maxHeight:'90vh',
        display:'flex', flexDirection:'column', overflow:'hidden',
      }},
        h('div',{style:{
          padding:'14px 18px', borderBottom:'1px solid var(--surface-2)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }},
          h('div',{style:{
            fontSize:'11px', fontWeight:'600', letterSpacing:'0.07em',
            textTransform:'uppercase', color:'var(--muted)',
          }}, inTieBreaker
            ? 'Tie-breaker '+(quiz.idx - baseCount + 1)+' of '+(totalQuestions - baseCount)
            : 'Question '+(quiz.idx + 1)+' of '+baseCount),
          h('button',{
            style:{background:'none', border:'none', cursor:'pointer', fontSize:'18px', color:'var(--muted)', padding:'4px 8px'},
            onclick: closeQuiz,
          }, '×')
        ),
        h('div',{style:{height:'3px', background:'var(--surface-1)'}},
          h('div',{style:{height:'100%', width:(((quiz.idx + 1) / totalQuestions) * 100).toFixed(1)+'%', background: cfg.accentColor, transition:'width 0.25s'}})
        ),
        h('div',{style:{
          padding:'20px 18px', flex:'1 1 auto', minHeight:'0',
          overflowY:'auto', WebkitOverflowScrolling:'touch',
          overscrollBehavior:'contain',
        }},
          h('div',{style:{fontSize:'15px', color:'var(--text)', lineHeight:'1.5', marginBottom: (cfg.maxSelections > 1 && !inTieBreaker) ? '6px' : '18px', fontFamily:"'DM Sans',sans-serif"}}, qText),
          (cfg.maxSelections > 1 && !inTieBreaker) ? h('div',{style:{
            fontSize:'11px', color:'var(--muted)', marginBottom:'14px', fontStyle:'italic',
          }}, 'Pick up to '+cfg.maxSelections+' that resonate most.') : null,
          h('div',{style:{display:'flex', flexDirection:'column', gap:'8px'}},
            ...qChoices.map((choice, idx) => {
              const selected = selectedSet.has(idx);
              return h('button',{
                style:{
                  display:'flex', alignItems:'center', gap:'10px',
                  padding:'12px 14px', borderRadius:'10px', cursor:'pointer',
                  fontFamily:"'DM Sans',sans-serif", textAlign:'left',
                  background: selected ? cfg.accentTintBg : 'var(--bg2)',
                  border: selected ? '1px solid '+cfg.accentColor : '1px solid var(--border)',
                  color: selected ? cfg.accentColor : 'var(--text)',
                  fontSize:'13px',
                },
                onclick:()=>onPick(idx),
              },
                h('span',{style:{
                  width:'16px', height:'16px', borderRadius:'50%',
                  border: selected ? '1px solid '+cfg.accentColor : '1px solid var(--muted)',
                  background: selected ? cfg.accentColor : 'transparent',
                  boxShadow: selected ? 'inset 0 0 0 3px var(--bg2)' : 'none',
                  flexShrink:'0',
                }}),
                h('span',{}, choice.label)
              );
            })
          )
        ),
        h('div',{style:{padding:'12px 18px', borderTop:'1px solid var(--surface-2)', display:'flex', gap:'8px'}},
          h('button',{
            style:{
              flex:'0 0 auto', padding:'12px 18px', borderRadius:'12px',
              border:'1px solid var(--border)', background:'var(--bg3)',
              color: quiz.idx === 0 ? 'var(--muted-3)' : 'var(--text)',
              fontSize:'13px', fontWeight:'500',
              cursor: quiz.idx === 0 ? 'default' : 'pointer',
              fontFamily:"'DM Sans',sans-serif",
            },
            onclick: quiz.idx === 0 ? null : goBack,
          }, 'Back'),
          h('button',{
            style:{
              flex:'1', padding:'12px', borderRadius:'12px', border:'none',
              background: hasAnswer ? cfg.accentColor : 'var(--bg3)',
              color: hasAnswer ? 'var(--bg)' : 'var(--muted)',
              fontSize:'13px', fontWeight:'500',
              cursor: hasAnswer ? 'pointer' : 'default',
              fontFamily:"'DM Sans',sans-serif",
            },
            onclick: hasAnswer ? goNext : null,
          }, willEnterTieBreakers
              ? 'Continue to tie-breakers'
              : (isLast ? 'Save' : 'Continue'))
        )
      )
    );
  })() : null;

  // Portal the modal to document.body so it escapes any parent stacking context.
  const existingModal = document.getElementById(cfg.modalId);
  if (existingModal) existingModal.remove();
  if (quizModal) {
    quizModal.id = cfg.modalId;
    document.body.appendChild(quizModal);
  }

  return h('div',{style:{marginBottom:'24px'}}, ctaButton, listEl, debugPanel);
}

/* ── Needs Panel ────────────────────────────────────── */
function buildNeedsPanel() {
  // Live-entries model: include every entry whose experimental lifespan decay
  // hasn't zeroed it out yet. No fixed window — the entry's own magnitude
  // determines how long it counts. Past cutoff = drops out of the picture.
  const _src = calcEntries();
  const libidoByDate = {};
  for (const e of _src) {
    if (e.category === 'libido') libidoByDate[e.date] = e;
  }
  const entryRawScore = (e, cap) => {
    if (e.category === 'affection' || e.category === 'physical' || e.category === 'conflict' || e.category === 'turndown')
      return bankScoreEntry(e, cap).score;
    if (e.category === 'restore') {
      const t = S.restoreTypes.find(x => (typeof x === 'string' ? x : x.name) === e.eventType);
      return restoreScore(e, t, cap);
    }
    if (e.category === 'regulation') return wobbleRestoreScore(e, cap);
    if (e.category === 'burnout')    return caretakerPersonalScore(e, cap);
    return 0;
  };
  const weekEntries = _src.filter(e => {
    const cap = bankDayCap(libidoByDate[e.date]);
    const raw = entryRawScore(e, cap);
    if (raw === 0) return false;
    const daysAgo = daysBetween(e.date, S.today);
    return expRemaining(raw, daysAgo) !== 0;
  });
  const wLabel = 'based on what\'s currently active';

  // Track scores per source: restore, physical, affection
  const scoresBySource = {
    physical: Object.fromEntries(EMOTIONAL_NEEDS.map(n => [n.val, 0])),
    affection:Object.fromEntries(EMOTIONAL_NEEDS.map(n => [n.val, 0])),
  };

  weekEntries.forEach(e => {
    let needsMap = null;
    let score    = 0;
    let source   = null;

    if (e.category === 'physical' && !e.solo && S.showPhysical) {
      const typeObj = S.physicalTypes.find(t => t.name === e.eventType);
      if (typeObj && typeObj.needsMap) {
        const raw = deriveActivityWeight(typeObj);
        const R   = BANK_OUTCOME_M[e.connectionQuality || 3] || 0.60;
        const cap = bankDayCap(weekEntries.find(le => le.date === e.date && le.category === 'libido'));
        score = (raw * R * cap / SCORE_MAX_RAW) * 100;
        needsMap = typeObj.needsMap; source = 'physical';
      }
    } else if (e.category === 'affection') {
      const typeObj = S.affectionTypes.find(t => t.name === e.eventType);
      if (typeObj && typeObj.needsMap) {
        const raw = deriveActivityWeight(typeObj);
        const R   = BANK_OUTCOME_M[e.connectionQuality || 3] || 0.60;
        const cap = bankDayCap(weekEntries.find(le => le.date === e.date && le.category === 'libido'));
        score = (raw * R * cap / SCORE_MAX_RAW) * 100;
        needsMap = typeObj.needsMap; source = 'affection';
      }
    }

    if (!needsMap || !source || score <= 0) return;

    // Distribute score proportionally across emotional needs by (rating-1) share
    const totalRating = EMOTIONAL_NEEDS.reduce((s, n) => s + Math.max(0, (needsMap[n.val] || 1) - 1), 0);
    if (totalRating === 0) return;
    EMOTIONAL_NEEDS.forEach(n => {
      const share = Math.max(0, (needsMap[n.val] || 1) - 1) / totalRating;
      scoresBySource[source][n.val] += score * share;
    });
  });

  // Personal needs — restore only, using geomean formula with immersion
  const personalScores = Object.fromEntries(PERSONAL_NEEDS.map(n => [n.val, 0]));

  weekEntries.forEach(e => {
    if (e.category !== 'restore') return;
    const typeObj = S.restoreTypes.find(t => (typeof t==='string'?t:t.name) === e.eventType);
    if (!typeObj || typeof typeObj !== 'object' || !typeObj.needsMap) return;
    const cap   = bankDayCap(weekEntries.find(le => le.date === e.date && le.category === 'libido'));
    const total = restoreScore(e, typeObj, cap);
    if (total <= 0) return;
    // Distribute proportionally across personal needs by (rating-1) share
    const totalRating = PERSONAL_NEEDS.reduce((s, n) => s + Math.max(0, (typeObj.needsMap[n.val]||1)-1), 0);
    if (totalRating === 0) return;
    PERSONAL_NEEDS.forEach(n => {
      const share = Math.max(0, (typeObj.needsMap[n.val]||1)-1) / totalRating;
      personalScores[n.val] += total * share;
    });
  });

  const personalByScore = PERSONAL_NEEDS
    .map(n => ({...n, total: personalScores[n.val]}))
    .sort((a, b) => b.total - a.total);
  const personalByRank = S.personalNeedsRanking
    .map(val => PERSONAL_NEEDS.find(n => n.val === val))
    .filter(Boolean)
    .map(n => ({...n, total: personalScores[n.val]}));
  const personalSorted = S.needsSort === 'rank' ? personalByRank : personalByScore;
  const maxPersonal = Math.max(...personalSorted.map(n => n.total), 1);
  const hasPersonal = personalSorted.some(n => n.total > 0);

  // Combined totals
  const totals = Object.fromEntries(EMOTIONAL_NEEDS.map(n => [n.val,
    scoresBySource.physical[n.val] + scoresBySource.affection[n.val]
  ]));

  const byScore = EMOTIONAL_NEEDS
    .map(n => ({...n, total: totals[n.val]}))
    .sort((a, b) => b.total - a.total);

  const byRank = S.needsRanking
    .map(val => EMOTIONAL_NEEDS.find(n => n.val === val))
    .filter(Boolean)
    .map(n => ({...n, total: totals[n.val]}));

  if (!S.needsSort) S.needsSort = 'fill';
  const sorted   = S.needsSort === 'rank' ? byRank : byScore;
  const maxTotal = Math.max(...sorted.map(s => s.total), 1);
  const hasAny   = sorted.some(n => n.total > 0);

  // Source colors
  const SRC_COLOR = { physical:'var(--c-physical)', affection:'var(--c-affection)' };

  const isIndividual = S.relationshipMode === 'individual';
  // In Individual mode, swap Love Needs for Social Needs. In other modes, the
  // SN tab doesn't exist; in Individual mode the EN tab doesn't exist.
  if (isIndividual && S.needsTab === 'en') S.needsTab = 'sn';
  if (!isIndividual && S.needsTab === 'sn') S.needsTab = 'en';
  if (!S.showBonding && !isIndividual && S.needsTab === 'en') S.needsTab = 'pn';

  return h('div',{class:'insights-panel'},

    // ── Tab switcher ──────────────────────────────────
    // Hidden when bonding's off and not in individual mode (PN is the only tab).
    (S.showBonding || isIndividual) ? h('div',{style:{display:'flex',gap:'6px',marginBottom:'20px',paddingTop:'14px'}},
      isIndividual ? h('button',{
        style:{
          flex:'1', padding:'10px', borderRadius:'12px', fontSize:'13px',
          fontWeight: S.needsTab==='sn' ? '600' : '400',
          border: S.needsTab==='sn' ? '1px solid var(--c-social)' : '1px solid var(--border)',
          background: S.needsTab==='sn' ? 'rgba(217,152,117,0.10)' : 'var(--bg2)',
          color: S.needsTab==='sn' ? 'var(--c-social)' : 'var(--muted)',
          cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
        },
        onclick:()=>{ S.needsTab='sn'; saveSettings(); render(); }
      }, '🫂 Social Needs') : h('button',{
        style:{
          flex:'1', padding:'10px', borderRadius:'12px', fontSize:'13px',
          fontWeight: S.needsTab==='en' ? '600' : '400',
          border: S.needsTab==='en' ? '1px solid var(--c-affection)' : '1px solid var(--border)',
          background: S.needsTab==='en' ? 'rgba(224,133,184,0.10)' : 'var(--bg2)',
          color: S.needsTab==='en' ? 'var(--c-affection)' : 'var(--muted)',
          cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
        },
        onclick:()=>{ S.needsTab='en'; saveSettings(); render(); }
      }, '🩷 Love Needs'),
      h('button',{
        style:{
          flex:'1', padding:'10px', borderRadius:'12px', fontSize:'13px',
          fontWeight: S.needsTab==='pn' ? '600' : '400',
          border: S.needsTab==='pn' ? '1px solid var(--c-restore)' : '1px solid var(--border)',
          background: S.needsTab==='pn' ? 'rgba(90,184,212,0.10)' : 'var(--bg2)',
          color: S.needsTab==='pn' ? 'var(--c-restore)' : 'var(--muted)',
          cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
        },
        onclick:()=>{ S.needsTab='pn'; saveSettings(); render(); }
      }, '🌊 Personal Needs'),
    ) : null,

    // ── SN tab (Individual mode only) ─────────────────
    isIndividual && S.needsTab === 'sn' ? h('div',{},
      h('div',{class:'ins-section'},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}}, 'Your ranking')
      ),
      h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'10px',lineHeight:'1.5'}},
        'Take the calibration quiz to set your ranking, or fine-tune manually with the arrows.'
      ),
      buildCalibrationSection({
        quizKey:        'needsSnQuiz',
        rankingKey:     'socialNeedsRanking',
        hitsKey:        'needsSnHits',
        needsList:      SOCIAL_NEEDS,
        quizData:       NEEDS_SN_QUIZ,
        slotsMap:       NEEDS_SN_SLOTS,
        tallyHits:      needsSnTallyHits,
        buildTieGroups: needsSnBuildTieGroups,
        orderFromCounts:needsSnOrderFromCounts,
        onSaved:        recalculateAllWeights,
        accentColor:    'var(--c-social)',
        accentTintBg:   'rgba(217,152,117,0.12)',
        modalId:        'needs-sn-calibration-modal',
        savedToastMsg:  '✓ Social needs ranking saved',
        maxSelections:  2,
        debugLabel:     'Social needs',
      }),
      h('div',{style:{
        fontSize:'10px', color:'var(--muted-2)', lineHeight:'1.6',
        padding:'10px 12px', borderRadius:'8px',
        background:'var(--bg2)', border:'1px solid var(--border)',
        marginBottom:'14px', marginTop:'14px',
      }},
        h('div',{style:{fontWeight:'500',color:'var(--muted)',marginBottom:'4px'}}, 'Sources'),
        'Cohen & Wills (1985) social support typology — Emotional Support, Companionship, Advice, Practical Help. ',
        'Baumeister & Leary (1995) "Need to belong" — Belonging. ',
        'Weiss (1974) "Provisions of Social Relationships" — Validation, Challenge & Growth. ',
        'Reis & Shaver (1988) intimacy process model — Intimacy. ',
        'Stuart Brown (2009) and PERMA — Play. ',
        'Schwartz values theory and Vaillant Grant Study — Shared Meaning.'
      ),
    ) : null,

    // ── EN tab ───────────────────────────────────────
    S.needsTab === 'en' ? h('div',{},

      // EN ranking — calibration quiz + numbered list with up/down arrows
      h('div',{class:'ins-section'},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}}, 'Your ranking')
      ),
      h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'10px',lineHeight:'1.5'}},
        'Take the calibration quiz to set your ranking, or fine-tune manually with the arrows.'
      ),
      buildCalibrationSection({
        quizKey:        'needsQuiz',
        rankingKey:     'needsRanking',
        hitsKey:        'needsHits',
        needsList:      EMOTIONAL_NEEDS,
        quizData:       NEEDS2_QUIZ,
        slotsMap:       NEEDS2_SLOTS,
        tallyHits:      needs2TallyHits,
        buildTieGroups: needs2BuildTieGroups,
        orderFromCounts:needs2OrderFromCounts,
        onSaved:        recalculateAllWeights,
        accentColor:    'var(--c-affection)',
        accentTintBg:   'rgba(224,133,184,0.12)',
        modalId:        'needs-calibration-modal',
        savedToastMsg:  '✓ Love needs ranking saved',
        maxSelections:  2,
      }),

      // ── Chart section (description + sort toggle + legend + chart) ──
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.6'}},
        'How well '+bondingLabel().toLowerCase()+' and intimacy activities are filling your love needs. '+
        'Shows the full weight of every currently-alive entry — entries that have aged past their lifespan drop off, but the rest contribute at their original strength.'
      ),

      // Sort toggle + legend
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}},
        h('div',{style:{display:'flex',gap:'6px'}},
          h('button',{class:'win-btn'+(S.needsSort==='fill'?' active':''),onclick:()=>{S.needsSort='fill';saveSettings();render();}},'By fill'),
          h('button',{class:'win-btn'+(S.needsSort==='rank'?' active':''),onclick:()=>{S.needsSort='rank';saveSettings();render();}},'By rank'),
        ),
        h('div',{style:{display:'flex',gap:'10px'}},
          ...Object.entries(SRC_COLOR).filter(([src]) => src !== 'physical' || S.showPhysical).map(([src, color]) =>
            h('div',{style:{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',color:'var(--muted)'}},
              h('div',{style:{width:'8px',height:'8px',borderRadius:'2px',background:color,flexShrink:'0'}}),
              src === 'physical' ? 'Intimacy' : bondingLabel()
            )
          )
        )
      ),

      // EN chart
      !hasAny ? h('div',{class:'ins-empty'},
        'No currently active entries with needs profiles.\nLog '+bondingLabel().toLowerCase()+' or intimacy activities and map their love needs to see this chart.'
      ) : h('div',{style:{marginBottom:'24px'}},
        ...sorted.map((n, idx) => {
          const noScore = n.total === 0;
          const rankPos = S.needsSort === 'rank' ? idx + 1 : S.needsRanking.indexOf(n.val) + 1;
          const pScore  = scoresBySource.physical[n.val];
          const aScore  = scoresBySource.affection[n.val];
          const pPct    = (pScore / maxTotal) * 100;
          const aPct    = (aScore / maxTotal) * 100;
          return h('div',{style:{marginBottom:'12px'}},
            h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'4px'}},
              h('span',{style:{fontSize:'13px', color: noScore ? 'var(--muted)' : 'var(--text)'}},
                h('span',{style:{fontSize:'11px',color:'var(--muted)',marginRight:'6px'}}, String(rankPos)),
                n.icon ? h('span',{style:{marginRight:'6px',fontSize:'15px'}}, n.icon) : null,
                n.label
              ),
              h('span',{style:{fontSize:'12px',color:'var(--muted)',fontFamily:"'Libre Baskerville',serif"}},
                n.total > 0 ? String(Math.round(n.total)) : '—')
            ),
            h('div',{style:{height:'8px',borderRadius:'4px',background:'var(--bg3)',overflow:'hidden',display:'flex'}},
              (S.showPhysical && pPct > 0) ? h('div',{style:{height:'100%',width:pPct.toFixed(1)+'%',background:SRC_COLOR.physical,transition:'width 0.4s ease'}}) : null,
              aPct > 0 ? h('div',{style:{height:'100%',width:aPct.toFixed(1)+'%',background:SRC_COLOR.affection,transition:'width 0.4s ease'}}) : null
            )
          );
        })
      )

    ) : null,

    // ── PN tab ───────────────────────────────────────
    S.needsTab === 'pn' ? h('div',{},

      // PN ranking — calibration quiz + numbered list with up/down arrows
      h('div',{class:'ins-section'},
        h('div',{class:'ins-section-title',style:{fontWeight:'600'}}, 'Your ranking')
      ),
      h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'10px',lineHeight:'1.5'}},
        'Take the calibration quiz to set your ranking, or fine-tune manually with the arrows.'
      ),
      buildCalibrationSection({
        quizKey:        'needsPnQuiz',
        rankingKey:     'personalNeedsRanking',
        hitsKey:        'needsPnHits',
        needsList:      PERSONAL_NEEDS,
        quizData:       NEEDS_PN_QUIZ,
        slotsMap:       NEEDS_PN_SLOTS,
        tallyHits:      needsPnTallyHits,
        buildTieGroups: needsPnBuildTieGroups,
        orderFromCounts:needsPnOrderFromCounts,
        accentColor:    'var(--c-restore)',
        accentTintBg:   'rgba(90,184,212,0.15)',
        modalId:        'needs-pn-calibration-modal',
        savedToastMsg:  '✓ Personal needs ranking saved',
        maxSelections:  2,
        debugLabel:     'Personal needs',
      }),

      // ── Chart section (description + sort toggle + chart) ──
      h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'12px',lineHeight:'1.6'}},
        'How well restorative activities are filling your personal needs. '+
        'Shows the full weight of every currently-alive entry — entries that have aged past their lifespan drop off, but the rest contribute at their original strength.'
      ),

      // Sort toggle
      h('div',{style:{display:'flex',gap:'6px',marginBottom:'12px'}},
        h('button',{class:'win-btn'+(S.needsSort==='fill'?' active':''),onclick:()=>{S.needsSort='fill';saveSettings();render();}},'By fill'),
        h('button',{class:'win-btn'+(S.needsSort==='rank'?' active':''),onclick:()=>{S.needsSort='rank';saveSettings();render();}},'By rank'),
      ),

      // PN chart
      !hasPersonal ? h('div',{class:'ins-empty',style:{paddingTop:'10px',marginBottom:'24px'}},
        'No currently active restore entries with personal needs profiles.'
      ) : h('div',{style:{marginBottom:'24px'}},
        ...personalSorted.map((n, idx) => {
          const noScore = n.total === 0;
          const pct     = (n.total / maxPersonal) * 100;
          const rankPos = S.needsSort === 'rank' ? idx + 1 : S.personalNeedsRanking.indexOf(n.val) + 1;
          return h('div',{style:{marginBottom:'12px'}},
            h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:'4px'}},
              h('span',{style:{fontSize:'13px', color: noScore ? 'var(--muted)' : 'var(--text)'}},
                h('span',{style:{fontSize:'11px',color:'var(--muted)',marginRight:'6px'}}, String(rankPos)),
                n.icon ? h('span',{style:{marginRight:'6px',fontSize:'15px'}}, n.icon) : null,
                n.label
              ),
              h('span',{style:{fontSize:'12px',color:'var(--muted)',fontFamily:"'Libre Baskerville',serif"}},
                n.total > 0 ? String(Math.round(n.total)) : '—')
            ),
            h('div',{style:{height:'8px',borderRadius:'4px',background:'var(--bg3)',overflow:'hidden'}},
              pct > 0 ? h('div',{style:{height:'100%',width:pct.toFixed(1)+'%',background:'var(--c-restore)',transition:'width 0.4s ease'}}) : null
            )
          );
        })
      )

    ) : null,

  );
}
