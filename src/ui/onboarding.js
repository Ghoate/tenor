'use strict';

/* ── Inline Onboarding ──────────────────────────────────
   Shown when onboarding.html isn't reachable (artifact viewer, standalone).
   Full-screen overlay with the same flow as onboarding.html.
─────────────────────────────────────────────────────── */
function showInlineOnboarding(onComplete) {
  const EN_MALE_O   = ['sexual','recreation','attraction','domestic','admiration','conversation','honesty','financial','family','affection'];
  const EN_FEMALE_O = ['affection','conversation','honesty','financial','family','domestic','attraction','admiration','recreation','sexual'];
  const EN_NEEDS_O  = [
    {val:'sexual',      icon:'💋', label:'Sexual Fulfillment',         hint:'The need for a satisfying sexual relationship — a partner who is genuinely enthusiastic, engaged, and makes you feel desired.'},
    {val:'attraction',  icon:'✨', label:'Physical Attractiveness',    hint:'The need to feel proud of and attracted to how your partner looks — that she makes an effort with her appearance for herself and for you.'},
    {val:'recreation',  icon:'🎲', label:'Recreational Companionship', hint:'The need for a partner who shares in fun, hobbies, and leisure.'},
    {val:'admiration',  icon:'🏆', label:'Admiration',                 hint:'The need to be genuinely admired by your partner — to feel that they respect your judgment, believe in your abilities, and are proud of who you are.'},
    {val:'domestic',    icon:'🏠', label:'Domestic Support',           hint:'The need for a partner who manages the home well — cooking, cleaning, childcare, and the daily demands of family life — so the home feels like a refuge rather than another responsibility.'},
    {val:'conversation',icon:'💬', label:'Conversation',               hint:'The need for a partner who genuinely wants to talk with you — sharing thoughts, asking questions, and connecting through regular meaningful conversation.'},
    {val:'honesty',     icon:'🪟', label:'Honesty & Openness',         hint:'The need for a partner who is honest and authentic — openly sharing their true thoughts, feelings, and relevant information so you always know where you stand.'},
    {val:'financial',   icon:'💰', label:'Financial Support',          hint:'The need for a partner who contributes income and manages money responsibly — reducing the financial pressure on you and pulling their weight in providing for the household.'},
    {val:'family',      icon:'👨‍👩‍👧‍👦', label:'Family Commitment',           hint:'The need for a partner invested in family life — parenting, shared values, building a future.'},
    {val:'affection',   icon:'🤗', label:'Affection',                  hint:'The need for warmth, tenderness, and non-sexual physical closeness — hugs, holding, and touch that communicates care and connection.'},
  ];
  const PN_NEEDS_O  = [
    {val:'autonomy',    icon:'🗝️', label:'Autonomy',          hint:'Freedom from demands — doing things on your own terms, free from external pressure.'},
    {val:'belonging',   icon:'👥', label:'Belonging',          hint:'Feeling part of a group or community beyond your relationship.'},
    {val:'challenge',   icon:'🧗', label:'Challenge / Edge',   hint:'Being pushed — risk, difficulty, the feeling of being at your limit.'},
    {val:'competition', icon:'🏁', label:'Competition',        hint:'Measuring yourself against others — competing and striving against a benchmark.'},
    {val:'competence',  icon:'🎯', label:'Competence',         hint:'Doing things well — developing skill, experiencing mastery, feeling capable.'},
    {val:'escape',      icon:'🏖️', label:'Escape',             hint:'Psychological relief from daily demands and the pressures of ordinary life.'},
    {val:'flow',        icon:'🎼', label:'Flow',               hint:'Deep absorption where self-consciousness disappears and time distorts.'},
    {val:'identity',    icon:'🌱', label:'Identity',           hint:'Connecting with who you are outside your relational roles — your own sense of self.'},
    {val:'nature',      icon:'🌲', label:'Nature',             hint:'Immersion in the natural world — water, weather, open space, landscape.'},
    {val:'sensory',     icon:'🛁', label:'Aesthetic Pleasure',  hint:'A pleasant physical environment — atmosphere, comfort, sounds, warmth.'},
  ];
  const PN_DEFAULT_O = ['competence','autonomy','challenge','flow','escape','competition','identity','belonging','nature','sensory'];
  const PN_MALE_O    = ['competence','autonomy','challenge','flow','escape','competition','identity','belonging','nature','sensory'];
  const PN_FEMALE_O  = ['belonging','identity','sensory','nature','flow','escape','autonomy','competence','challenge','competition'];

  // Default sample-loading flags to FALSE when user already has types in that
  // category — onboarding shouldn't suggest loading samples that would risk
  // touching existing user data.
  const hasBondingTypes   = Array.isArray(S.affectionTypes) && S.affectionTypes.length > 0;
  const hasIntimacyTypes  = Array.isArray(S.physicalTypes)  && S.physicalTypes.length  > 0;
  const hasRestoreTypes   = Array.isArray(S.restoreTypes)   && S.restoreTypes.length   > 0;
  const hasSteadyingTypes = Array.isArray(S.caretakerTypes) && S.caretakerTypes.length > 0;
  const hasWobbleTags     = Array.isArray(S.challengingEmotionTags) && S.challengingEmotionTags.length > 0;

  const OS = {
    step: 0,
    userPronouns: 'he', partnerPronouns: 'she',
    relationshipMode: 'partner', // 'partner' | 'dating' | 'individual'
    showBonding: true, showConflict: true,
    showPhysical: true, showCaretaker: false, showRegulation: true,
    showAttachment: false, showRepair: false,
    enRanking: [...EN_MALE_O],
    pnRanking: [...PN_MALE_O],
    loadSampleBonding:   !hasBondingTypes,
    loadSamplePhysical:  !hasIntimacyTypes,
    loadSampleRestore:   !hasRestoreTypes,
    loadSampleSteadying: !hasSteadyingTypes,
    loadSampleWobble:    !hasWobbleTags,
    drag: null,
  };

  // Guided flow: per-feature introduction screens with value demos. Each
  // feature gets its own moment to be introduced (educates the user even
  // when they choose not to enable it). Order: most universal first
  // (Intimacy), then progressively more specialised (Wobble, Caretaking).
  const OSTEPS = [oSplash, oWelcome, oPronouns, oFeatureIntimacy, oFeatureWobble, oFeatureCaretaking, oENRanking, oPNRanking, oReady];

  // ── overlay shell ──
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;background:var(--bg);font-family:\'DM Sans\',sans-serif;max-width:480px;margin:0 auto;';
  // Force light mode vars on the overlay regardless of app theme
  overlay.style.setProperty('--bg',          '#f5f4f0');
  overlay.style.setProperty('--bg2',         '#eeede8');
  overlay.style.setProperty('--bg3',         '#e4e3de');
  overlay.style.setProperty('--border',      'rgba(0,0,0,0.10)');
  overlay.style.setProperty('--border-mid',  'rgba(0,0,0,0.18)');
  overlay.style.setProperty('--text',        '#2a2a32');
  overlay.style.setProperty('--text-strong', 'rgba(0,0,0,0.88)');
  overlay.style.setProperty('--interactive', '#4a4a58');
  overlay.style.setProperty('--muted',       'rgba(26,26,32,0.62)');
  overlay.style.setProperty('--muted-2',     'rgba(26,26,32,0.45)');
  overlay.style.setProperty('--muted-3',     'rgba(26,26,32,0.30)');
  overlay.style.setProperty('--muted-4',     'rgba(26,26,32,0.12)');
  overlay.style.setProperty('--surface-1',   'rgba(0,0,0,0.04)');
  overlay.style.setProperty('--surface-3',   'rgba(0,0,0,0.08)');
  overlay.style.backgroundColor = '#f5f4f0';

  const progBar = document.createElement('div');
  progBar.style.cssText = 'height:3px;background:var(--bg3);flex-shrink:0;';
  const progFill = document.createElement('div');
  progFill.style.cssText = 'height:3px;background:var(--interactive);transition:width 0.4s;';
  progBar.appendChild(progFill);
  overlay.appendChild(progBar);

  const screens = document.createElement('div');
  screens.style.cssText = 'flex:1;overflow:hidden;position:relative;';
  overlay.appendChild(screens);

  const footer = document.createElement('div');
  footer.style.cssText = 'padding:12px 24px 24px;border-top:1px solid var(--border);background:var(--bg);flex-shrink:0;display:flex;flex-direction:column;gap:8px;';
  overlay.appendChild(footer);

  document.body.appendChild(overlay);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k,v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  }

  function oGoTo(step) {
    // Clean up any portal-attached overlays from the previous screen.
    for (const _id of ['onboarding-en-quiz-modal', 'onboarding-pn-quiz-modal']) {
      const _stale = document.getElementById(_id);
      if (_stale) _stale.remove();
    }
    OS.enQuiz = null; OS.pnQuiz = null;
    OS._enRebuild = null; OS._pnRebuild = null;
    const cur = screens.querySelector('.ob-screen.active');
    if (cur) { cur.classList.remove('active'); cur.classList.add('ob-exiting'); setTimeout(() => cur.remove(), 300); }
    OS.step = step;
    OS.footerHint = null; // cleared so each step starts blank; steps that want a hint set it during their render
    progFill.style.width = ((step + 1) / OSTEPS.length * 100) + '%';
    const sc = OSTEPS[step](); sc.classList.add('active'); screens.appendChild(sc);
    oRenderFooter();
  }

  // In individual mode, skip the feature-intro screens (Intimacy/Wobble/
  // Caretaking) and the Love Needs ranking — none apply when the user is
  // tracking personal-only. Indexes 3..6 in OSTEPS cover those four steps.
  function isStepHidden(idx) {
    if (OS.relationshipMode !== 'individual') return false;
    return idx >= 3 && idx <= 6;
  }
  function oNext() {
    let next = OS.step + 1;
    while (next < OSTEPS.length && isStepHidden(next)) next++;
    if (next >= OSTEPS.length) { oFinish(); return; }
    oGoTo(next);
  }
  function oBack() {
    if (OS.step === 0) return;
    let prev = OS.step - 1;
    while (prev > 0 && isStepHidden(prev)) prev--;
    const cur = screens.querySelector('.ob-screen.active');
    if (cur) { cur.classList.remove('active'); cur.style.transition='opacity 0.25s,transform 0.25s'; cur.style.opacity='0'; cur.style.transform='translateX(40px)'; setTimeout(()=>cur.remove(),250); }
    OS.step = prev;
    OS.footerHint = null; // cleared so the previous step renders fresh
    progFill.style.width = ((OS.step + 1) / OSTEPS.length * 100) + '%';
    const sc = OSTEPS[OS.step](); sc.style.cssText+='opacity:0;transform:translateX(-40px);'; screens.appendChild(sc);
    requestAnimationFrame(() => { sc.style.transition='opacity 0.3s,transform 0.3s'; sc.style.opacity='1'; sc.style.transform='translateX(0)'; sc.classList.add('active'); });
    oRenderFooter();
  }

  function oRenderFooter() {
    footer.innerHTML = '';

    // Optional hint above the buttons — set per-step via OS.footerHint.
    // Cleared at the start of each render so stale hints don't persist.
    if (OS.footerHint) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11px;color:var(--muted-2);text-align:center;padding:0 4px;line-height:1.4;';
      hint.textContent = OS.footerHint;
      footer.appendChild(hint);
    }

    // Buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;';
    if (OS.step > 0) {
      const b = document.createElement('button');
      b.textContent = '←'; b.onclick = oBack;
      b.style.cssText = 'padding:16px 20px;border-radius:14px;border:1px solid var(--border);background:var(--bg3);color:var(--muted);font-size:15px;font-weight:500;font-family:\'DM Sans\',sans-serif;cursor:pointer;';
      btnRow.appendChild(b);
    }
    const btn = document.createElement('button');
    btn.textContent = OS.step === OSTEPS.length - 1 ? 'Get started →' : 'Continue →';
    btn.onclick = oNext;
    btn.style.cssText = 'flex:1;padding:16px;border-radius:14px;border:none;background:var(--interactive);color:var(--bg);font-size:15px;font-weight:500;font-family:\'DM Sans\',sans-serif;cursor:pointer;';
    btnRow.appendChild(btn);
    footer.appendChild(btnRow);
  }

  function oScreen() {
    const s = document.createElement('div');
    s.className = 'ob-screen';
    s.style.cssText = 'position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:32px 24px 100px;opacity:0;transform:translateX(40px);transition:opacity 0.3s,transform 0.3s;pointer-events:none;';
    return s;
  }

  // Inline CSS for ob-screen.active
  if (!document.getElementById('ob-style')) {
    const st = document.createElement('style');
    st.id = 'ob-style';
    st.textContent = '.ob-screen.active{opacity:1!important;transform:translateX(0)!important;pointer-events:auto!important;}.ob-screen.ob-exiting{opacity:0!important;transform:translateX(-40px)!important;}.ob-rank-item{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-radius:10px;margin-bottom:4px;background:var(--bg2);border:1px solid var(--border);}.ob-pronoun-btn{padding:16px 10px;border-radius:14px;border:2px solid var(--border);background:var(--bg2);cursor:pointer;font-size:14px;font-weight:500;text-align:center;color:var(--muted);line-height:1.4;transition:all 0.15s;font-family:\'DM Sans\',sans-serif;width:100%;}.ob-pronoun-btn.ob-sel{border-color:var(--interactive);background:var(--interactive);color:var(--bg)!important;}.ob-feature-card{border-radius:14px;padding:14px 16px;margin-bottom:8px;border:1px solid var(--border);background:var(--bg2);cursor:pointer;display:flex;align-items:center;gap:14px;}.ob-feature-card.ob-on{border-color:var(--border-mid);background:var(--bg3);}.ob-toggle{width:40px;height:24px;border-radius:12px;flex-shrink:0;background:var(--bg3);border:1px solid var(--border);position:relative;transition:all 0.2s;}.ob-toggle::after{content:\'\';position:absolute;top:4px;left:4px;width:14px;height:14px;border-radius:50%;background:var(--muted-3);transition:all 0.2s;}.ob-feature-card.ob-on .ob-toggle{background:var(--interactive);border-color:var(--interactive);}.ob-feature-card.ob-on .ob-toggle::after{background:white;transform:translateX(16px);}';
    document.head.appendChild(st);
  }

  function oTitle(text) {
    const d = document.createElement('div');
    d.style.cssText = 'font-family:\'Libre Baskerville\',serif;font-size:26px;font-weight:400;line-height:1.25;color:var(--text-strong);margin-bottom:14px;';
    d.innerHTML = text; return d;
  }
  function oBody(text) {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:15px;color:var(--muted);line-height:1.7;margin-bottom:24px;';
    d.textContent = text; return d;
  }
  function oEyebrow(text) {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;';
    d.textContent = text; return d;
  }
  // Auto-computes "Step N of M" eyebrow from current step's position in
  // OSTEPS, excluding bookend steps (Welcome at index 0, Ready at end).
  // Lets the same step function produce the right label whether it's used
  // in the default 5-step flow or the alternate 4-step flow.
  function oStepLabel() {
    const numbered = OSTEPS.length - 2;  // exclude Welcome + Ready
    const pos = OS.step;  // 0-indexed position in OSTEPS
    return 'Step ' + pos + ' of ' + numbered;
  }
  function oHint(text) {
    const d = document.createElement('div');
    d.style.cssText = 'padding:12px 14px;border-radius:10px;background:var(--surface-1);border:1px solid var(--border);font-size:12px;color:var(--muted);line-height:1.6;margin-top:16px;';
    d.textContent = text; return d;
  }
  function oSectionLabel(text) {
    const d = document.createElement('div');
    d.style.cssText = 'font-size:11px;letter-spacing:0.07em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;';
    d.textContent = text; return d;
  }

  function oPronounGrid(currentVal, onSelect) {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;';
    for (const {val,label,sub} of [{val:'he',label:'He / Him',sub:'he, him, his'},{val:'she',label:'She / Her',sub:'she, her, hers'},{val:'they',label:'They / Them',sub:'they, them, their'}]) {
      const btn = document.createElement('button');
      btn.className = 'ob-pronoun-btn' + (currentVal === val ? ' ob-sel' : '');
      btn.innerHTML = label + '<span style="font-size:11px;display:block;margin-top:3px;opacity:0.6;">' + sub + '</span>';
      btn.onclick = () => {
        onSelect(val);
        grid.querySelectorAll('.ob-pronoun-btn').forEach(b => b.classList.remove('ob-sel'));
        btn.classList.add('ob-sel');
      };
      grid.appendChild(btn);
    }
    return grid;
  }

  function oRankList(needs, ranking, onChange) {
    const list = document.createElement('div');
    list.style.marginBottom = '20px';

    function render() {
      list.innerHTML = '';
      ranking.forEach((val, idx) => {
        const need = needs.find(n => n.val === val);
        const item = document.createElement('div');
        item.className = 'ob-rank-item';

        // Number badge
        const numEl = document.createElement('div');
        numEl.style.cssText = "font-family:'Libre Baskerville',serif;font-size:13px;color:var(--muted-2);width:18px;text-align:center;flex-shrink:0;";
        numEl.textContent = String(idx + 1);
        item.appendChild(numEl);

        // Emoji
        const iconEl = document.createElement('div');
        iconEl.style.cssText = 'font-size:18px;flex-shrink:0;width:24px;text-align:center;line-height:1.3;';
        iconEl.textContent = need && need.icon ? need.icon : '';
        item.appendChild(iconEl);

        // Label + hint
        const textEl = document.createElement('div');
        textEl.style.flex = '1';
        const labelEl = document.createElement('div');
        labelEl.style.cssText = 'font-size:13px;color:var(--text);';
        labelEl.textContent = need ? need.label : val;
        textEl.appendChild(labelEl);
        if (need && need.hint) {
          const hintEl = document.createElement('div');
          hintEl.style.cssText = 'font-size:11px;color:var(--muted);line-height:1.4;margin-top:2px;';
          hintEl.textContent = need.hint;
          textEl.appendChild(hintEl);
        }
        item.appendChild(textEl);

        // ↑ / ↓ buttons
        const btnCol = document.createElement('div');
        btnCol.style.cssText = 'display:flex;flex-direction:column;gap:2px;flex-shrink:0;';
        const btnStyle = (disabled) =>
          'width:28px;height:28px;border-radius:7px;border:1px solid var(--border);background:var(--bg3);' +
          'font-size:13px;cursor:'+(disabled?'default':'pointer')+';' +
          'color:'+(disabled?'var(--muted-3)':'var(--muted)')+';font-family:\'DM Sans\',sans-serif;' +
          'display:flex;align-items:center;justify-content:center;flex-shrink:0;';
        const upBtn = document.createElement('button');
        upBtn.textContent = '↑'; upBtn.style.cssText = btnStyle(idx === 0); upBtn.disabled = idx === 0;
        upBtn.addEventListener('click', () => {
          if (idx === 0) return;
          const arr = [...ranking]; [arr[idx-1], arr[idx]] = [arr[idx], arr[idx-1]];
          ranking.length = 0; arr.forEach(v => ranking.push(v)); onChange&&onChange(); render();
        });
        const dnBtn = document.createElement('button');
        dnBtn.textContent = '↓'; dnBtn.style.cssText = btnStyle(idx === ranking.length - 1); dnBtn.disabled = idx === ranking.length - 1;
        dnBtn.addEventListener('click', () => {
          if (idx === ranking.length - 1) return;
          const arr = [...ranking]; [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]];
          ranking.length = 0; arr.forEach(v => ranking.push(v)); onChange&&onChange(); render();
        });
        btnCol.appendChild(upBtn); btnCol.appendChild(dnBtn);
        item.appendChild(btnCol);

        list.appendChild(item);
      });
    }
    render();
    return list;
  }

  // ── Calibration quiz (onboarding-scoped) ─────────────
  // Mirrors the Needs-tab quiz but reads/writes OS state instead of S state.
  // Pronoun tokens substitute via OS.partnerPronouns (which is set on the
  // Pronouns screen earlier in the flow).
  const OS_PRONOUNS_O = {
    she:  { sub:'she', obj:'her',  pos:'her',   ref:'herself',    Sub:'She'  },
    he:   { sub:'he',  obj:'him',  pos:'his',   ref:'himself',    Sub:'He'   },
    they: { sub:'they',obj:'them', pos:'their', ref:'themselves', Sub:'They' },
    any:  { sub:'they',obj:'them', pos:'their', ref:'themselves', Sub:'They' },
  };
  function osApplyPronouns(text) {
    if (!text) return text;
    const p = OS_PRONOUNS_O[OS.partnerPronouns] || OS_PRONOUNS_O.she;
    return text
      .replace(/\{Sub\}/g, p.Sub)
      .replace(/\{sub\}/g, p.sub)
      .replace(/\{obj\}/g, p.obj)
      .replace(/\{pos\}/g, p.pos)
      .replace(/\{ref\}/g, p.ref);
  }

  // Shared quiz-modal builder. cfg supplies the data and target callbacks.
  // EN vs PN share the same modal layout — only quiz content and accent differ.
  function osBuildQuizModal(cfg) {
    const quiz = cfg.quiz;
    const baseCount = cfg.quizData.length;
    const inTieBreaker = quiz.idx >= baseCount;
    const totalQuestions = baseCount + needs2TotalTieBreakers(quiz.tieGroups);

    const goBack = () => { if (quiz.idx > 0) { quiz.idx -= 1; cfg.rerender(); } };
    const onSaveQuiz = () => {
      const counts = cfg.tallyHits(quiz.answers);
      const order  = cfg.orderFromCounts(counts, quiz.tieGroups);
      cfg.onSave(order);
    };
    const goNext = () => {
      if (!inTieBreaker && quiz.idx === baseCount - 1) {
        const counts    = cfg.tallyHits(quiz.answers);
        const tieGroups = cfg.buildTieGroups(counts);
        if (tieGroups.length > 0) {
          quiz.idx = baseCount; quiz.tieGroups = tieGroups; cfg.rerender();
        } else {
          quiz.tieGroups = null; onSaveQuiz();
        }
        return;
      }
      if (quiz.idx < totalQuestions - 1) {
        quiz.idx += 1; cfg.rerender();
      } else {
        onSaveQuiz();
      }
    };
    const selectChoice = (cIdx) => {
      const max = cfg.maxSelections || 1;
      const raw = quiz.answers[quiz.idx];
      const current = Array.isArray(raw) ? raw.slice() : (raw != null ? [raw] : []);
      let next;
      if (current.includes(cIdx)) {
        next = current.filter(i => i !== cIdx);
      } else if (max === 1) {
        next = [cIdx];
      } else if (current.length < max) {
        next = [...current, cIdx];
      } else {
        return; // at max — ignore
      }
      quiz.answers = { ...quiz.answers, [quiz.idx]: next };
      quiz.tieGroups = null;
      cfg.rerender();
    };
    const selectTieBreaker = (chosenVal) => {
      const tbIdx = quiz.idx - baseCount;
      const info  = needs2TieBreakerAt(quiz.tieGroups, tbIdx);
      if (!info) return;
      quiz.tieGroups = quiz.tieGroups.map((g, gi) => {
        if (gi !== info.groupIdx) return g;
        const newPicks = g.picks.slice(0, info.pickIdx);
        newPicks.push(chosenVal);
        return { ...g, picks: newPicks };
      });
      cfg.rerender();
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

    let qText, qChoices, selectedSet, onPick;
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
      qText = osApplyPronouns(current.q);
      qChoices = current.choices.map(c => ({ label: osApplyPronouns(c.label) }));
      const raw = quiz.answers[quiz.idx];
      const indices = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
      selectedSet = new Set(indices);
      onPick = (cIdx) => selectChoice(cIdx);
    }

    const accent = cfg.accentColor;
    const accentTint = cfg.accentTintBg;

    return h('div',{style:{
      position:'fixed', inset:'0', zIndex:'10000',
      background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'center', justifyContent:'center',
      padding:'20px',
    }, onclick:(e)=>{ if (e.target === e.currentTarget) cfg.onClose(); }},
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
          h('div',{style:{fontSize:'11px',fontWeight:'600',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)'}},
            inTieBreaker
              ? 'Tie-breaker '+(quiz.idx - baseCount + 1)+' of '+(totalQuestions - baseCount)
              : 'Question '+(quiz.idx + 1)+' of '+baseCount),
          h('button',{
            style:{background:'none',border:'none',cursor:'pointer',fontSize:'18px',color:'var(--muted)',padding:'4px 8px'},
            onclick: cfg.onClose,
          }, '×')
        ),
        h('div',{style:{height:'3px', background:'var(--surface-1)'}},
          h('div',{style:{height:'100%', width:(((quiz.idx + 1) / totalQuestions) * 100).toFixed(1)+'%', background: accent, transition:'width 0.25s'}})
        ),
        h('div',{style:{
          padding:'20px 18px', flex:'1 1 auto', minHeight:'0',
          overflowY:'auto', WebkitOverflowScrolling:'touch',
          overscrollBehavior:'contain',
        }},
          h('div',{style:{fontSize:'15px',color:'var(--text)',lineHeight:'1.5',marginBottom: (cfg.maxSelections > 1 && !inTieBreaker) ? '6px' : '18px',fontFamily:"'DM Sans',sans-serif"}}, qText),
          (cfg.maxSelections > 1 && !inTieBreaker) ? h('div',{style:{
            fontSize:'11px',color:'var(--muted)',marginBottom:'14px',fontStyle:'italic',
          }}, 'Pick up to '+cfg.maxSelections+' that resonate most.') : null,
          h('div',{style:{display:'flex',flexDirection:'column',gap:'8px'}},
            ...qChoices.map((choice, idx) => {
              const selected = selectedSet.has(idx);
              return h('button',{
                style:{
                  display:'flex',alignItems:'center',gap:'10px',
                  padding:'12px 14px',borderRadius:'10px',cursor:'pointer',
                  fontFamily:"'DM Sans',sans-serif",textAlign:'left',
                  background: selected ? accentTint : 'var(--bg2)',
                  border: selected ? '1px solid '+accent : '1px solid var(--border)',
                  color: selected ? accent : 'var(--text)',
                  fontSize:'13px',
                },
                onclick:()=>onPick(idx),
              },
                h('span',{style:{
                  width:'16px',height:'16px',borderRadius:'50%',
                  border: selected ? '1px solid '+accent : '1px solid var(--muted)',
                  background: selected ? accent : 'transparent',
                  boxShadow: selected ? 'inset 0 0 0 3px var(--bg2)' : 'none',
                  flexShrink:'0',
                }}),
                h('span',{}, choice.label)
              );
            })
          )
        ),
        h('div',{style:{padding:'12px 18px',borderTop:'1px solid var(--surface-2)',display:'flex',gap:'8px'}},
          h('button',{
            style:{
              flex:'0 0 auto',padding:'12px 18px',borderRadius:'12px',
              border:'1px solid var(--border)',background:'var(--bg3)',
              color: quiz.idx === 0 ? 'var(--muted-3)' : 'var(--text)',
              fontSize:'13px',fontWeight:'500',
              cursor: quiz.idx === 0 ? 'default' : 'pointer',
              fontFamily:"'DM Sans',sans-serif",
            },
            onclick: quiz.idx === 0 ? null : goBack,
          }, 'Back'),
          h('button',{
            style:{
              flex:'1',padding:'12px',borderRadius:'12px',border:'none',
              background: hasAnswer ? accent : 'var(--bg3)',
              color: hasAnswer ? 'var(--bg)' : 'var(--muted)',
              fontSize:'13px',fontWeight:'500',
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
  }

  const OS_EN_QUIZ_MODAL_ID = 'onboarding-en-quiz-modal';
  const OS_PN_QUIZ_MODAL_ID = 'onboarding-pn-quiz-modal';
  function osRemoveEnQuizModal() {
    const existing = document.getElementById(OS_EN_QUIZ_MODAL_ID);
    if (existing) existing.remove();
  }
  function osRemovePnQuizModal() {
    const existing = document.getElementById(OS_PN_QUIZ_MODAL_ID);
    if (existing) existing.remove();
  }
  function osOpenEnQuiz() {
    OS.enQuiz = { idx: 0, answers: {}, tieGroups: null };
    osRenderEnQuizModal();
  }
  function osCloseEnQuiz() {
    OS.enQuiz = null;
    osRemoveEnQuizModal();
  }
  function osOpenPnQuiz() {
    OS.pnQuiz = { idx: 0, answers: {}, tieGroups: null };
    osRenderPnQuizModal();
  }
  function osClosePnQuiz() {
    OS.pnQuiz = null;
    osRemovePnQuizModal();
  }
  function osRenderEnQuizModal() {
    osRemoveEnQuizModal();
    if (!OS.enQuiz) return;
    const modal = osBuildQuizModal({
      quiz: OS.enQuiz,
      quizData: NEEDS2_QUIZ,
      needsList: EMOTIONAL_NEEDS,
      tallyHits: needs2TallyHits,
      buildTieGroups: needs2BuildTieGroups,
      orderFromCounts: needs2OrderFromCounts,
      accentColor: 'var(--c-affection)',
      accentTintBg: 'rgba(224,133,184,0.12)',
      maxSelections: 2,
      rerender: osRenderEnQuizModal,
      onClose: osCloseEnQuiz,
      onSave: (order) => {
        OS.enRanking = order;
        osCloseEnQuiz();
        if (typeof OS._enRebuild === 'function') OS._enRebuild();
      },
    });
    modal.id = OS_EN_QUIZ_MODAL_ID;
    document.body.appendChild(modal);
  }
  function osRenderPnQuizModal() {
    osRemovePnQuizModal();
    if (!OS.pnQuiz) return;
    const modal = osBuildQuizModal({
      quiz: OS.pnQuiz,
      quizData: NEEDS_PN_QUIZ,
      needsList: PERSONAL_NEEDS,
      tallyHits: needsPnTallyHits,
      buildTieGroups: needsPnBuildTieGroups,
      orderFromCounts: needsPnOrderFromCounts,
      accentColor: 'var(--c-restore)',
      accentTintBg: 'rgba(90,184,212,0.15)',
      maxSelections: 2,
      rerender: osRenderPnQuizModal,
      onClose: osClosePnQuiz,
      onSave: (order) => {
        OS.pnRanking = order;
        osClosePnQuiz();
        if (typeof OS._pnRebuild === 'function') OS._pnRebuild();
      },
    });
    modal.id = OS_PN_QUIZ_MODAL_ID;
    document.body.appendChild(modal);
  }

  // ── Screens ──
  // Splash — the first thing a new user sees. Just the wordmark, definition,
  // and an invitation forward. No feature pitch on this page.
  function oSplash() {
    const s = oScreen();
    s.style.background = 'radial-gradient(ellipse at 50% 0%, rgba(181,118,42,0.10) 0%, transparent 60%)';

    s.appendChild(h('div',{style:{height:'48px'}}));

    // Wordmark
    s.appendChild(h('div',{style:{
      textAlign:'center',
      fontFamily:"'Libre Baskerville',serif",
      fontSize:'42px',
      letterSpacing:'0.01em',
      color:'#b5762a',
      marginBottom:'4px',
    }}, 'Atmos'));
    s.appendChild(h('div',{style:{
      textAlign:'center',
      fontFamily:"'Libre Baskerville',serif",
      fontStyle:'italic',
      fontSize:'15px',
      color:'var(--muted)',
      letterSpacing:'0.04em',
      marginBottom:'40px',
    }}, 'emotional bearings'));

    // Dictionary-style definition with IPA pronunciation.
    const defBox = h('div',{style:{
      padding:'18px 0 18px',
      borderTop:'2px solid rgba(181,118,42,0.35)',
      borderBottom:'1px solid var(--border)',
      fontFamily:"'Libre Baskerville',serif",
      lineHeight:'1.7',
    }},
      h('div',{style:{display:'flex',alignItems:'baseline',gap:'10px',marginBottom:'6px',flexWrap:'wrap'}},
        h('span',{style:{fontSize:'19px',fontWeight:'600',color:'#b5762a'}},'Atmos'),
        h('span',{style:{fontSize:'13px',color:'var(--muted)',fontFamily:"'DM Sans',sans-serif"}},'/ˈat-məs/'),
      ),
      h('div',{style:{fontSize:'12px',fontStyle:'italic',color:'var(--muted)',marginBottom:'8px'}},'noun'),
      h('div',{style:{fontSize:'14px',color:'var(--text)',lineHeight:'1.65',marginBottom:'12px'}},
        'The surrounding atmosphere of one\'s life, relationships, or experiences — the ambient feeling that hangs over a place or moment.'),
      h('div',{style:{fontSize:'11px',fontStyle:'italic',color:'var(--muted)',letterSpacing:'0.02em'}},
        'from Greek ', h('span',{style:{fontStyle:'italic',color:'var(--text)'}},'atmós'), ', vapor or breath'),
    );
    s.appendChild(defBox);

    return s;
  }

  function oWelcome() {
    const s = oScreen();

    // Hero
    s.appendChild(h('div',{style:{
      fontFamily:"'Libre Baskerville',serif",
      fontSize:'22px', fontWeight:'400',
      color:'var(--text-strong)', lineHeight:'1.35',
      marginBottom:'8px',
    }}, 'Log your relationship.\nWatch it take shape.'));
    s.appendChild(h('div',{style:{
      fontSize:'14px', color:'var(--muted)', lineHeight:'1.65', marginBottom:'24px',
    }}, 'Every entry is scored, weighted to what matters to you personally, and rolled into one running number — the emotional atmosphere of your life right now.'));

    // Feature list
    const features = [
      { icon:'🩷', label:'Bonding',          desc:'Quality time, affection, and shared experiences.',      color:'#e87a9b' },
      { icon:'🌡️', label:'Mood & Energy',    desc:'Daily check-in that calibrates everything else.',       color:'#e0a040' },
      { icon:'⛈️',  label:'Conflict',         desc:'Hard moments logged — intensity, resolution, repair.',  color:'#e06060' },
      { icon:'🌊',  label:'Restorative',      desc:'Activities that refill your personal meter.',           color:'#4dc4a0' },
      { icon:'🌹',  label:'Intimacy',         desc:'Desire and closeness, tracked over time.',              color:'#e07a4a' },
      { icon:'🌪️',  label:'Wobble',      desc:'Your difficult moments, separate from the relationship.',color:'#7d99c9' },
      { icon:'💨', label:'Steadying',        desc:'When you show up for someone in a hard moment.',        color:'#d4956a' },
    ];

    for (const {icon,label,desc,color} of features) {
      s.appendChild(h('div',{style:{
        display:'flex', alignItems:'center', gap:'12px',
        padding:'9px 12px', marginBottom:'5px',
        borderRadius:'10px', background:'var(--bg2)',
        borderLeft:'3px solid '+color,
      }},
        h('div',{style:{fontSize:'18px',width:'26px',textAlign:'center',flexShrink:'0',lineHeight:'1.3'}}, icon),
        h('div',{style:{flex:'1'}},
          h('div',{style:{fontSize:'13px',fontWeight:'500',color:'var(--text)',marginBottom:'1px'}}, label),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',lineHeight:'1.4'}}, desc)
        )
      ));
    }

    s.appendChild(h('div',{style:{height:'8px'}}));
    s.appendChild(oHint('Setup takes about two minutes. Everything can be changed later in Config.'));
    return s;
  }

  function oPronouns() {
    const s = oScreen();
    s.appendChild(oEyebrow(oStepLabel()));
    s.appendChild(oTitle('Pronouns'));
    const bodyText = OS.relationshipMode === 'individual'
      ? 'Used throughout the app when referring to you.'
      : 'Used throughout the app when referring to you' + (OS.relationshipMode === 'partner' ? ' and your partner.' : ' and the people you log moments with.');
    s.appendChild(oBody(bodyText));

    s.appendChild(oSectionLabel('Yours'));
    s.appendChild(oPronounGrid(OS.userPronouns, v => { OS.userPronouns = v; }));
    s.appendChild(h('div',{style:{height:'18px'}}));

    // ── Relationship-situation question ──
    // Determines whether dating mode, partner mode, or individual (personal-only)
    // mode is on. Affects which pronoun grid we show below, and whether we
    // show one at all (Individual mode hides the partner area entirely).

    // Container so we can re-render the bottom area when mode changes
    const partnerArea = document.createElement('div');
    const renderPartnerArea = () => {
      partnerArea.innerHTML = '';
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:11px;letter-spacing:0.07em;text-transform:uppercase;color:var(--muted);margin:8px 0 8px;';

      if (OS.relationshipMode === 'individual') {
        // Personal-only tracking — no partner/dating pronouns needed. Show a
        // brief explanation so the user understands what's happening.
        const note = document.createElement('div');
        note.style.cssText = 'font-size:12px;color:var(--muted);line-height:1.6;padding:14px 16px;border-radius:12px;background:var(--bg2);border:1px solid var(--border);';
        note.textContent = 'Individual mode — relational categories (bonding, intimacy, conflict) are hidden so the app focuses on your personal state. You\'ll skip the relational setup steps.';
        partnerArea.appendChild(note);
      } else if (OS.relationshipMode === 'partner') {
        lbl.textContent = 'Your partner\'s pronouns';
        partnerArea.appendChild(lbl);
        partnerArea.appendChild(oPronounGrid(OS.partnerPronouns, v => { OS.partnerPronouns = v; }));
      } else {
        // Dating mode: ask about the pronouns of people they're dating.
        lbl.textContent = 'Dating';
        partnerArea.appendChild(lbl);
        partnerArea.appendChild(oDatingPronounGrid(OS.partnerPronouns, v => { OS.partnerPronouns = v; }));
      }
    };

    const modeGrid = document.createElement('div');
    modeGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;';
    for (const {val,icon,label,sub} of [
      {val:'individual', icon:'🌊', label:'Individual', sub:'personal-only'},
      {val:'partner',    icon:'👤', label:'Committed',  sub:'one, exclusive'},
      {val:'dating',     icon:'👥', label:'Dating',     sub:'multiple or open'},
    ]) {
      const btn = document.createElement('button');
      btn.className = 'ob-pronoun-btn' + (OS.relationshipMode === val ? ' ob-sel' : '');
      btn.innerHTML = '<span style="font-size:18px;display:block;margin-bottom:4px;">' + icon + '</span>' + label + '<span style="font-size:11px;display:block;margin-top:3px;opacity:0.6;">' + sub + '</span>';
      btn.onclick = () => {
        OS.relationshipMode = val;
        // When Individual is selected, flip the relational feature flags off
        // so oFinish saves consistent state and downstream skip logic kicks in.
        if (val === 'individual') {
          OS.showBonding = false; OS.showPhysical = false;
          OS.showConflict = false; OS.showRepair = false;
        } else {
          OS.showBonding = true; OS.showPhysical = true;
          OS.showConflict = true;
        }
        modeGrid.querySelectorAll('.ob-pronoun-btn').forEach(b => b.classList.remove('ob-sel'));
        btn.classList.add('ob-sel');
        renderPartnerArea();
      };
      modeGrid.appendChild(btn);
    }
    s.appendChild(modeGrid);
    s.appendChild(partnerArea);
    renderPartnerArea();

    return s;
  }

  // 4-button variant of the pronoun grid for dating mode.
  // Adds 'any' for users dating people of varying genders. Stored as 'any'
  // and resolved to they/them at render time via PRONOUN_MAP.
  function oDatingPronounGrid(currentVal, onSelect) {
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px;';
    for (const {val,label,sub} of [
      {val:'he',   label:'He / Him',   sub:'he, him, his'},
      {val:'she',  label:'She / Her',  sub:'she, her, hers'},
      {val:'they', label:'They / Them',sub:'they, them, their'},
      {val:'any',  label:'Any',        sub:'mixed or fluid'},
    ]) {
      const btn = document.createElement('button');
      btn.className = 'ob-pronoun-btn' + (currentVal === val ? ' ob-sel' : '');
      btn.innerHTML = label + '<span style="font-size:11px;display:block;margin-top:3px;opacity:0.6;">' + sub + '</span>';
      btn.onclick = () => {
        onSelect(val);
        grid.querySelectorAll('.ob-pronoun-btn').forEach(b => b.classList.remove('ob-sel'));
        btn.classList.add('ob-sel');
      };
      grid.appendChild(btn);
    }
    return grid;
  }

  // ── Onboarding step: situation-based ──────────────────────────────
  // Asks 5 yes/no questions about the user's life and turns features on
  // based on the answers.
  // Mappings:
  //   Q1 (partner mental health)    → showCaretaker + showAttachment
  //   Q2 (your difficult moments)   → showRegulation
  //   Q3 (physical intimacy)        → showPhysical
  //   Q4 (repair work)              → showRepair
  //   Q5 (attachment patterns)      → showAttachment
  // ── Helpers shared across feature-intro steps ──────────────────────────

  // Renders a feature-intro screen: emoji at top, name, body paragraph,
  // a value-demo block, and an opt-in button. The demo block is provided
  // by the caller so each feature gets its own appropriate visualization.
  function oFeatureScreen({ stateKey, icon, name, body, demoEl, applyOn }) {
    const s = oScreen();
    s.appendChild(oEyebrow(oStepLabel()));
    s.appendChild(h('div',{style:{fontSize:'52px',textAlign:'center',marginBottom:'14px',lineHeight:'1'}}, icon));
    s.appendChild(oTitle(name));
    s.appendChild(oBody(body));

    // Demo block — boxed visualization showing what the feature gives you
    if (demoEl) {
      const demoWrap = h('div',{style:{
        padding:'14px',marginBottom:'18px',
        borderRadius:'12px',background:'var(--bg2)',border:'1px solid var(--border)',
      }});
      demoWrap.appendChild(demoEl);
      s.appendChild(demoWrap);
    }

    // Opt-in button
    if (!OS.situationIncluded) OS.situationIncluded = {};
    const included = !!OS.situationIncluded[stateKey];
    // Apply the feature flag based on inclusion state
    applyOn(included);
    const btnRow = h('div',{style:{textAlign:'center',marginBottom:'12px'}});
    const btn = document.createElement('button');
    btn.textContent = included ? 'Included ✓' : 'Include';
    btn.style.cssText = 'padding:11px 28px;border-radius:22px;font-size:14px;cursor:pointer;font-family:\'DM Sans\',sans-serif;transition:all 0.12s;'
      + (included
        ? 'border:1px solid var(--c-partner);background:var(--c-partner);color:white;'
        : 'border:1px solid var(--border);background:var(--bg3);color:var(--muted);');
    btn.onclick = () => {
      OS.situationIncluded[stateKey] = !included;
      oGoTo(OS.step);
    };
    btnRow.appendChild(btn);
    s.appendChild(btnRow);

    // Hint moves to the footer (above the Continue button) so it's adjacent
    // to the action it qualifies, not competing with the demo for attention
    OS.footerHint = 'You can change this later in Config — nothing locked in.';

    return s;
  }

  // Sample entry card — styled to look like a real entry preview
  // Sample entry card — supports two display modes:
  //   fields: [[label, value], ...]  → renders as label/value rows (form-like)
  //   detail: 'natural language string' → renders as a single italic line
  // An optional tagline below the card explains the longer-term value.
  function oSampleEntryCard(opts) {
    const { color, icon, title, fields, detail, tagline } = opts;
    const wrap = h('div',{});
    const card = h('div',{style:{
      padding:'12px 14px',borderRadius:'10px',
      background:'var(--bg3)',
      borderLeft:'3px solid '+color,
    }});
    card.appendChild(h('div',{style:{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}},
      h('span',{style:{fontSize:'16px'}}, icon),
      h('span',{style:{fontSize:'13px',fontWeight:'500',color:'var(--text)'}}, title)
    ));
    if (Array.isArray(fields)) {
      for (const [label, value] of fields) {
        card.appendChild(h('div',{style:{
          display:'flex',justifyContent:'space-between',padding:'4px 0',fontSize:'11px',
        }},
          h('span',{style:{color:'var(--muted)'}}, label),
          h('span',{style:{color:'var(--text)'}}, value)
        ));
      }
    } else if (detail) {
      card.appendChild(h('div',{style:{
        fontSize:'12px',color:'var(--muted)',fontStyle:'italic',lineHeight:'1.5',
      }}, detail));
    }
    wrap.appendChild(card);
    if (tagline) {
      wrap.appendChild(h('div',{style:{
        fontSize:'10px',color:'var(--muted-2)',marginTop:'10px',fontStyle:'italic',textAlign:'center',
      }}, tagline));
    }
    return wrap;
  }

  // Sample bar chart for caretaking — small horizontal bars showing weekly load
  function oSampleSteadyingBars() {
    const wrap = h('div',{});
    wrap.appendChild(h('div',{style:{
      fontSize:'11px',color:'var(--muted)',marginBottom:'10px',letterSpacing:'0.04em',
    }}, 'STEADYING LOAD · LAST WEEK'));
    const days = [
      ['Mon', 0.2], ['Tue', 0.6], ['Wed', 0.0], ['Thu', 0.9],
      ['Fri', 0.4], ['Sat', 0.1], ['Sun', 0.7],
    ];
    for (const [day, load] of days) {
      const row = h('div',{style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'5px'}});
      row.appendChild(h('span',{style:{fontSize:'10px',color:'var(--muted-2)',width:'28px'}}, day));
      const barWrap = h('div',{style:{flex:'1',height:'10px',borderRadius:'5px',background:'var(--bg)',overflow:'hidden'}});
      barWrap.appendChild(h('div',{style:{
        height:'100%', width:(load*100).toFixed(0)+'%',
        background:'#d4956a',borderRadius:'5px',
      }}));
      row.appendChild(barWrap);
      wrap.appendChild(row);
    }
    wrap.appendChild(h('div',{style:{
      fontSize:'10px',color:'var(--muted-2)',marginTop:'8px',fontStyle:'italic',
    }}, 'See your caretaking load over time — when it spikes, when you got a break.'));
    return wrap;
  }

  // Sample attachment quadrant grid — mini SVG showing dots clustered to
  // suggest a tendency. A few clearly secure dots (low-left), a couple
  // anxious (high-left), and a centroid marker.
  function oSampleAttachmentMap() {
    const wrap = h('div',{});
    wrap.appendChild(h('div',{style:{
      fontSize:'11px',color:'var(--muted)',marginBottom:'10px',letterSpacing:'0.04em',
    }}, 'WHERE YOUR MOMENTS LAND'));
    // SVG quadrant grid — 220x220, simplified
    const W = 220, H = 220;
    // Quadrant colors (subtle tints)
    const quadrants = [
      { x:0,    y:H/2, w:W/2, h:H/2, fill:'rgba(77,196,120,0.06)', label:'Secure',       lx:W/4,    ly:H-12 },
      { x:W/2,  y:H/2, w:W/2, h:H/2, fill:'rgba(212,154,106,0.06)', label:'Avoidant',    lx:3*W/4,  ly:H-12 },
      { x:0,    y:0,   w:W/2, h:H/2, fill:'rgba(212,123,123,0.06)', label:'Anxious',     lx:W/4,    ly:14 },
      { x:W/2,  y:0,   w:W/2, h:H/2, fill:'rgba(155,127,212,0.06)', label:'Disorganized',lx:3*W/4,  ly:14 },
    ];
    // Sample dots — mostly secure cluster, a couple anxious. Coords as fraction of W/H.
    const dots = [
      { x:0.18, y:0.78, axis:'secure' },
      { x:0.28, y:0.85, axis:'secure' },
      { x:0.22, y:0.72, axis:'secure' },
      { x:0.35, y:0.80, axis:'secure' },
      { x:0.30, y:0.20, axis:'anxious' },
      { x:0.20, y:0.30, axis:'anxious' },
    ];
    // Compute centroid
    const cx = dots.reduce((s,d)=>s+d.x,0) / dots.length;
    const cy = dots.reduce((s,d)=>s+d.y,0) / dots.length;
    const colorFor = (axis) => axis === 'secure' ? '#4dc478' : '#d47a7a';

    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:240px;display:block;margin:0 auto;font-family:'DM Sans',sans-serif;">`;
    // Background quadrants
    for (const q of quadrants) {
      svg += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="${q.fill}" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>`;
    }
    // Quadrant labels
    for (const q of quadrants) {
      svg += `<text x="${q.lx}" y="${q.ly}" text-anchor="middle" font-size="9" fill="rgba(0,0,0,0.4)" letter-spacing="0.5">${q.label.toUpperCase()}</text>`;
    }
    // Center crosshair
    svg += `<line x1="${W/2}" y1="0" x2="${W/2}" y2="${H}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>`;
    svg += `<line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>`;
    // Dots
    for (const d of dots) {
      svg += `<circle cx="${d.x*W}" cy="${d.y*H}" r="5" fill="${colorFor(d.axis)}" opacity="0.6"/>`;
    }
    // Centroid (ringed marker)
    svg += `<circle cx="${cx*W}" cy="${cy*H}" r="9" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>`;
    svg += `<circle cx="${cx*W}" cy="${cy*H}" r="3" fill="rgba(0,0,0,0.7)"/>`;
    svg += `</svg>`;

    const svgWrap = document.createElement('div');
    svgWrap.innerHTML = svg;
    wrap.appendChild(svgWrap);
    wrap.appendChild(h('div',{style:{
      fontSize:'10px',color:'var(--muted-2)',marginTop:'8px',fontStyle:'italic',textAlign:'center',
    }}, 'A tendency toward secure, with anxious moments mixed in — observed, not labelled.'));
    return wrap;
  }

  // ── Four feature-intro steps ──────────────────────────────────────────

  function oFeatureIntimacy() {
    return oFeatureScreen({
      stateKey: 'physical',
      icon: '🌹',
      name: 'Intimacy',
      body: 'Track physical intimacy and desire over time. Logs shared and solo intimacy with quality and context. Useful when you want to notice patterns in desire — what supports it, what dampens it.',
      demoEl: oSampleEntryCard({
        color: '#e07a4a', icon: '🌹', title: 'Slow Sunday morning',
        detail: 'Mutual · desire was high · stayed close all day',
        tagline: 'Over weeks, what supports desire and what dampens it becomes visible.',
      }),
      applyOn: (on) => { OS.showPhysical = on; },
    });
  }

  function oFeatureWobble() {
    return oFeatureScreen({
      stateKey: 'ownMoments',
      icon: '🌪️',
      name: 'Wobble',
      body: 'Track your own difficult moments — anxiety, dissociation, burnout, dysregulation — and what brought you back. Useful when you want to see the texture of your hard moments separately from how the relationship is doing.',
      demoEl: oSampleEntryCard({
        color: '#7d99c9', icon: '🌪️', title: 'Sunday afternoon spiral',
        detail: 'Came on slow, no clear trigger · cold water + a walk eventually broke it',
        tagline: 'Over time, the texture of your hard moments becomes visible.',
      }),
      applyOn: (on) => { OS.showRegulation = on; },
    });
  }

  function oFeatureCaretaking() {
    return oFeatureScreen({
      stateKey: 'partnerMH',
      icon: '💨',
      name: 'Steadying',
      body: 'Track the emotional work you do showing up for someone in a hard moment — your partner, a parent, a friend, anyone close to you. The app shows your steadying load over time so spikes and breaks become visible.',
      demoEl: oSampleSteadyingBars(),
      applyOn: (on) => { OS.showCaretaker = on; },
    });
  }

  function oFeatureAttachment() {
    return oFeatureScreen({
      stateKey: 'attachment',
      icon: '🪞',
      name: 'Attachment Lens',
      body: 'Notice patterns in how you reach, withdraw, settle — the attachment-shaped texture of moments. Anchored in attachment theory but used as observation, not diagnosis. Includes Repair entries (logging when reconnection happens after a rupture).',
      demoEl: oSampleAttachmentMap(),
      // Lens implies Repair — they\'re structurally coupled (the Lens is
      // diminished without repair data feeding into it)
      applyOn: (on) => { OS.showAttachment = on; OS.showRepair = on; },
    });
  }

  function oENRanking() {
    const s = oScreen();
    s.appendChild(oEyebrow(oStepLabel()));
    s.appendChild(oTitle('What you need from a relationship'));
    s.appendChild(oBody('Different people need different things from a relationship. The order here calibrates how the app reads your entries — what\'s at the top weighs more heavily in scoring. Pick a default to start, drag to make it yours.'));
    s.appendChild(h('div',{style:{
      padding:'10px 12px',marginBottom:'14px',
      borderRadius:'8px',background:'var(--bg2)',border:'1px solid var(--border)',
      fontSize:'11px',color:'var(--muted)',lineHeight:'1.5',
    }},
      h('strong',{style:{color:'var(--text)',fontWeight:'500'}},'About the defaults: '),
      'Drawn from Willard Harley\'s couples-counseling framework (His Needs, Her Needs), averaged from decades of his clinical practice. They\'re starting points, not destinations — your actual order may differ significantly.'
    ));
    // Default by pronouns — 'she' → female, anything else (he, they, any) → male
    if (!OS._enInit) {
      OS.enRanking = OS.userPronouns === 'she' ? [...EN_FEMALE_O] : [...EN_MALE_O];
      OS._enInit = true;
    }

    // Calibration quiz button — opens the 12-scenario quiz used on the Needs tab.
    // Sits at the top so it's the first thing the user sees as the way to shape
    // their ranking. Below it, the list shows the current order with up/down arrows.
    const calibrateBtn = h('button',{
      style:{
        width:'100%', marginBottom:'16px',
        padding:'12px', borderRadius:'14px', border:'none',
        background:'var(--c-affection)', color:'var(--bg)',
        fontSize:'13px', fontWeight:'500', cursor:'pointer',
        fontFamily:"'DM Sans',sans-serif",
      },
      onclick: osOpenEnQuiz,
    }, 'Take the calibration quiz');
    s.appendChild(calibrateBtn);

    const listWrap = document.createElement('div');
    function rebuild() {
      listWrap.innerHTML='';
      listWrap.appendChild(oRankList(EN_NEEDS_O, OS.enRanking, null));
    }
    s.appendChild(listWrap); rebuild();
    OS._enRebuild = rebuild;

    s.appendChild(oHint('Fine-tune this any time in the Needs tab.'));
    return s;
  }

  function oPNRanking() {
    const s = oScreen();
    s.appendChild(oEyebrow(oStepLabel()));
    s.appendChild(oTitle('What restores you outside the relationship'));
    s.appendChild(oBody('Ten things people commonly use to restore themselves outside a relationship — autonomy, flow, nature, time alone, etc. The order calibrates how the app scores restorative activities you log. Pick a default to start, drag to make it yours.'));
    s.appendChild(h('div',{style:{
      padding:'10px 12px',marginBottom:'14px',
      borderRadius:'8px',background:'var(--bg2)',border:'1px solid var(--border)',
      fontSize:'11px',color:'var(--muted)',lineHeight:'1.5',
    }},
      h('strong',{style:{color:'var(--text)',fontWeight:'500'}},'About the defaults: '),
      'Personal needs come from frameworks like Self-Determination Theory (autonomy, competence) and flow theory. The male/female ordering reflects general patterns from leisure-psychology research — not a verdict on what you should value, since most of these frameworks treat needs as universal rather than gendered. Drag to make it yours.'
    ));

    // Default based on user pronouns: she → female, anything else → male
    if (!OS._pnInit) {
      OS.pnRanking = OS.userPronouns === 'she' ? [...PN_FEMALE_O] : [...PN_MALE_O];
      OS._pnInit = true;
    }

    // Calibration quiz button at top — same 12-scenario flow as the Needs tab PN.
    const calibrateBtn = h('button',{
      style:{
        width:'100%', marginBottom:'16px',
        padding:'12px', borderRadius:'14px', border:'none',
        background:'var(--c-restore)', color:'var(--bg)',
        fontSize:'13px', fontWeight:'500', cursor:'pointer',
        fontFamily:"'DM Sans',sans-serif",
      },
      onclick: osOpenPnQuiz,
    }, 'Take the calibration quiz');
    s.appendChild(calibrateBtn);

    const listWrap = document.createElement('div');
    function rebuild() {
      listWrap.innerHTML='';
      listWrap.appendChild(oRankList(PN_NEEDS_O, OS.pnRanking, null));
    }
    s.appendChild(listWrap); rebuild();
    OS._pnRebuild = rebuild;

    s.appendChild(oHint('Fine-tune this any time in the Needs tab.'));
    return s;
  }

  function oReady() {
    const s = oScreen();
    s.appendChild(h('div',{style:{fontSize:'52px',textAlign:'center',margin:'8px 0 24px',lineHeight:'1'}},'✓'));
    s.appendChild(oTitle('You\'re all set'));
    s.appendChild(oBody('Here\'s what we\'ve configured. Everything can be changed in Config.'));
    const pl = {'he':'He / Him','she':'She / Her','they':'They / Them'};
    const top3EN = OS.enRanking.slice(0,3).map(v=>EN_NEEDS_O.find(n=>n.val===v)?.label.split(' ')[0]).filter(Boolean).join(', ');
    const top3PN = OS.pnRanking.slice(0,3).map(v=>PN_NEEDS_O.find(n=>n.val===v)?.label).filter(Boolean).join(', ');
    const isIndividual = OS.relationshipMode === 'individual';
    const summary = [
      ['Your pronouns',pl[OS.userPronouns]||OS.userPronouns],
      isIndividual ? ['Mode','Individual'] : ['Partner pronouns',pl[OS.partnerPronouns]||OS.partnerPronouns],
      isIndividual ? null : ['Physical',OS.showPhysical?'On':'Off'],
      ['Wobble',OS.showRegulation?'On':'Off'],
      ['Steadying',OS.showCaretaker?'On':'Off'],
      isIndividual ? null : ['Top love needs',top3EN+'…'],
      ['Top personal needs',top3PN+'…'],
    ].filter(Boolean);
    for (const [label,value] of summary) {
      s.appendChild(h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'9px 0',borderBottom:'1px solid var(--border)',fontSize:'14px'}},
        h('span',{style:{color:'var(--muted)'}},label),
        h('span',{style:{color:'var(--text)',fontWeight:'500'}},value)
      ));
    }
    s.appendChild(h('div',{style:{marginTop:'20px',fontSize:'11px',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'4px'}},'Sample Types'));
    s.appendChild(h('div',{style:{fontSize:'12px',color:'var(--muted)',marginBottom:'10px',lineHeight:'1.5'}},
      'Sample types are added to your library — they won\'t overwrite or remove anything you\'ve already created.'
    ));
    for (const {key,icon,label,show,countFn} of [
      {key:'loadSampleBonding',   icon:'🩷',label:'Bonding',     show:OS.showBonding, countFn:()=>S.affectionTypes.length},
      {key:'loadSamplePhysical',  icon:'🌹',label:'Intimacy',    show:OS.showPhysical, countFn:()=>S.physicalTypes.length},
      {key:'loadSampleRestore',   icon:'🌊',label:'Restorative', show:true,           countFn:()=>S.restoreTypes.length},
      {key:'loadSampleSteadying', icon:'💨',label:'Steadying',   show:OS.showCaretaker, countFn:()=>S.caretakerTypes.length},
      {key:'loadSampleWobble',    icon:'🌪️',label:'Wobble',  show:OS.showRegulation, countFn:()=>S.challengingEmotionTags.length},
    ]) {
      if (!show) continue;
      const existingCount = countFn();
      const row = h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}});
      const labelDiv = h('div',{style:{display:'flex',flexDirection:'column',gap:'2px'}});
      labelDiv.appendChild(h('span',{style:{fontSize:'14px',color:'var(--text)'}},icon+' '+label));
      if (existingCount > 0) {
        labelDiv.appendChild(h('span',{style:{fontSize:'11px',color:'var(--muted)'}},
          existingCount+' existing type'+(existingCount===1?'':'s')+' — samples added alongside'));
      }
      row.appendChild(labelDiv);
      const tog = document.createElement('div');
      const dotEl = document.createElement('div');
      const setStyle = () => {
        tog.style.cssText = 'width:40px;height:24px;border-radius:12px;flex-shrink:0;position:relative;transition:all 0.2s;cursor:pointer;'+(OS[key]?'background:var(--interactive);border:1px solid var(--interactive);':'background:var(--bg3);border:1px solid var(--border);');
        dotEl.style.cssText = 'position:absolute;top:4px;'+(OS[key]?'left:22px;':'left:4px;')+'width:14px;height:14px;border-radius:50%;transition:all 0.2s;background:'+(OS[key]?'white':'var(--muted-3)')+';';
      };
      tog.appendChild(dotEl); setStyle();
      tog.addEventListener('click',()=>{ OS[key]=!OS[key]; setStyle(); });
      row.appendChild(tog);
      s.appendChild(row);
    }
    s.appendChild(h('div',{style:{marginTop:'24px',padding:'14px 16px',borderRadius:'12px',background:'rgba(77,196,120,0.08)',border:'1px solid rgba(77,196,120,0.2)',fontSize:'13px',color:'var(--text)',lineHeight:'1.6'}},
      h('div',{style:{fontWeight:'500',marginBottom:'4px'}},'Start with Mood & Energy'),
      'Your first entry each day is the 🌡️ check-in. It calibrates the scoring for everything else you log that day.'
    ));
    return s;
  }

  async function oFinish() {
    const puts = [
      ['userPronouns',         OS.userPronouns],
      ['partnerPronouns',      OS.partnerPronouns],
      ['relationshipMode',     OS.relationshipMode],
      ['showBonding',          OS.showBonding],
      ['showConflict',         OS.showConflict],
      ['showPhysical',         OS.showPhysical],
      ['showCaretaker',        OS.showCaretaker],
      ['showRegulation',       OS.showRegulation],
      ['showAttachment',       OS.showAttachment],
      ['showRepair',           OS.showRepair],
      ['needsRanking',         OS.enRanking],
      ['personalNeedsRanking', OS.pnRanking],
      ['theme',                'light'],
      ['onboarded',            true],
    ];
    await Promise.all(puts.map(([k,v]) => dbPut('settings', {key:k, value:v})));

    // Re-read type lists from IndexedDB before merging — don't trust S which
    // could be stale. This ensures existing custom types are always preserved
    // even if the in-memory state got out of sync before oFinish ran.
    const [storedAffection, storedPhysical, storedRestore, storedCaretaker, storedWobble, storedSocial] =
      await Promise.all([
        dbGet('settings','affectionTypes').then(r => r?.value || S.affectionTypes || []),
        dbGet('settings','physicalTypes').then(r  => r?.value || S.physicalTypes  || []),
        dbGet('settings','restoreTypes').then(r   => r?.value || S.restoreTypes   || []),
        dbGet('settings','caretakerTypes').then(r => r?.value || S.caretakerTypes || []),
        dbGet('settings','challengingEmotionTags').then(r => r?.value || S.challengingEmotionTags || []),
        dbGet('settings','socialTypes').then(r    => r?.value || S.socialTypes    || []),
      ]);

    // Sample-loading helper: merges sample types into the existing list,
    // adding only those whose names don't already exist. Preserves user data.
    const mergeSamples = (existing, samples) => {
      const haveNames = new Set((existing || []).map(t => (typeof t === 'string' ? t : t.name)));
      const additions = samples.filter(s => !haveNames.has(s.name));
      return [...(existing || []), ...additions];
    };

    if (OS.loadSampleBonding) {
      const samples = [
        {name:'Netflix Movie Night',description:'Pick a good romcom, get popcorn and cuddle on the couch',descEffort:1,descTime:3,descFinancial:1,descRarity:2,descPresence:2,needsMap:{sexual:1,recreation:3,affection:3,conversation:2,honesty:1,admiration:1,financial:1,domestic:2,family:1,attraction:1}},
        {name:'Ballard Farmers Market',description:'Drive to Ballard, browse the market, pat the dogs, grab lunch together',descEffort:2,descTime:4,descFinancial:2,descRarity:3,descPresence:3,needsMap:{sexual:1,recreation:4,affection:2,conversation:3,honesty:1,admiration:1,financial:2,domestic:2,family:1,attraction:2}},
        {name:'Picnic Dog Beach',description:'Pack a picnic, head to the beach with the dogs, eat outside, get wet and meet new dogs',descEffort:3,descTime:4,descFinancial:2,descRarity:3,descPresence:3,needsMap:{sexual:1,recreation:5,affection:2,conversation:3,honesty:1,admiration:1,financial:1,domestic:2,family:3,attraction:2}},
        {name:'Skein & Tipple',description:'Cocktails at the speakeasy, live music, friends and conversation',descEffort:2,descTime:4,descFinancial:3,descRarity:4,descPresence:4,needsMap:{sexual:1,recreation:5,affection:2,conversation:4,honesty:3,admiration:3,financial:3,domestic:1,family:1,attraction:4}},
      ];
      // Individual mode: the bonding samples apply equally well to social
      // activities (movie nights, markets, dog beach, speakeasy can be with
      // friends/family). Duplicate them into socialTypes with the needsMap
      // reset to SN defaults since the EN keys don't translate.
      if (OS.relationshipMode === 'individual') {
        const snDefaults = Object.fromEntries(SOCIAL_NEEDS.map(n => [n.val, 1]));
        const socialSamples = samples.map(s => ({
          name: s.name, description: s.description,
          descEffort: s.descEffort, descTime: s.descTime,
          descFinancial: s.descFinancial, descRarity: s.descRarity,
          descPresence: s.descPresence,
          needsMap: {...snDefaults},
        }));
        await dbPut('settings',{key:'socialTypes', value: mergeSamples(storedSocial, socialSamples)});
      } else {
        await dbPut('settings',{key:'affectionTypes', value: mergeSamples(storedAffection, samples)});
      }
    }
    if (OS.loadSamplePhysical) {
      const samples = [
        {name:'Morning in Bed',description:'Slow morning, no alarms, nowhere to be',defaultSolo:false,physIntentionality:2,physEnergy:2,physDesire:4,physNovelty:2,physSetting:3,needsMap:{sexual:4,attraction:3,recreation:2,admiration:1,domestic:1,conversation:2,honesty:1,financial:1,family:1,affection:4}},
      ];
      await dbPut('settings',{key:'physicalTypes', value: mergeSamples(storedPhysical, samples)});
    }
    if (OS.loadSampleRestore) {
      const samples = [
        {name:'Yoga',description:'Mat down, move slow, breathe it out',descEffort:2,descTime:2,descFinancial:1,descRarity:1,needsMap:{sexual:1,recreation:1,affection:1,conversation:1,honesty:1,admiration:1,financial:1,domestic:1,family:1,attraction:1,autonomy:4,belonging:1,challenge:1,competition:1,competence:2,escape:4,flow:4,identity:3,nature:1,sensory:3}},
        {name:'Sailing (practice)',description:'Practice sailing — upwind, downwind, starts and practice races',descEffort:5,descTime:4,descFinancial:3,descRarity:4,needsMap:{sexual:1,recreation:1,affection:1,conversation:1,honesty:1,admiration:1,financial:1,domestic:1,family:1,attraction:1,autonomy:4,belonging:3,challenge:5,competition:4,competence:5,escape:4,flow:3,identity:3,nature:5,sensory:1}},
        {name:'Writing (book)',description:'Working on the book — drafting, editing, finding the thread',descEffort:4,descTime:3,descFinancial:1,descRarity:1,needsMap:{sexual:1,recreation:1,affection:1,conversation:1,honesty:1,admiration:1,financial:1,domestic:1,family:1,attraction:1,autonomy:4,belonging:1,challenge:3,competition:1,competence:4,escape:3,flow:5,identity:5,nature:1,sensory:1}},
      ];
      await dbPut('settings',{key:'restoreTypes', value: mergeSamples(storedRestore, samples)});
    }

    if (OS.loadSampleSteadying && OS.showCaretaker) {
      const samples = DEFAULT_CARETAKER_TYPES.map(t => ({...t, weight: deriveCaretakerWeight(t)}));
      await dbPut('settings',{key:'caretakerTypes', value: mergeSamples(storedCaretaker, samples)});
    }
    if (OS.loadSampleWobble && OS.showRegulation) {
      const have = new Set(storedWobble);
      const additions = DEFAULT_CHALLENGING_EMOTION_TAGS.filter(t => !have.has(t));
      await dbPut('settings',{key:'challengingEmotionTags', value: [...storedWobble, ...additions]});
    }

    overlay.remove();
    // Always land on Home after onboarding completes — this is the right
    // first surface for a new user (the picker invites their first entry,
    // and reorienting users who just reset onboarding from another tab).
    S.activeTab = 'home';
    // Sync the relationshipMode into in-memory state so the first render
    // after onboarding uses the correct labels (Bonding vs Dating).
    S.relationshipMode = OS.relationshipMode;
    onComplete();
  }

  oGoTo(0);
}

