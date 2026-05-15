'use strict';


/* ── INSIGHTS ENGINE ────────────────────────────────── */
function getWindowEntries() {
  // In experimental mode the window selector is hidden, so observations use a
  // fixed 7-day frame regardless of whatever S.loveBankWindow happens to hold.
  const w = S.useExperimentalScoring ? 7 : Number(S.loveBankWindow);
  const src = calcEntries();
  if (w === 0) return src;
  const cutoff = addDays(S.today, -(w - 1));
  return src.filter(e => e.date >= cutoff && e.date <= S.today);
}

function getPrevWindowEntries() {
  const w = S.useExperimentalScoring ? 7 : Number(S.loveBankWindow);
  if (w === 0) return [];
  const end   = addDays(S.today, -w);
  const start = addDays(S.today, -w*2);
  return calcEntries().filter(e => e.date >= start && e.date < end);
}

function groupByWeek(entries, windowDays) {
  // Weeks always start on Monday
  // Find the most recent Monday on or before today
  const todayDate = new Date(S.today + 'T00:00:00');
  const dow = todayDate.getDay(); // 0=Sun
  const daysSinceMonday = (dow === 0) ? 6 : dow - 1;
  const lastMonday = new Date(todayDate);
  lastMonday.setDate(lastMonday.getDate() - daysSinceMonday);

  const w = windowDays;
  const numWeeks = Math.ceil(w / 7);
  const weeks = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const wkStart = new Date(lastMonday);
    wkStart.setDate(wkStart.getDate() - i * 7);
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkEnd.getDate() + 6);
    weeks.push({ start: dateStr(wkStart), end: dateStr(wkEnd), entries: [] });
  }
  for (const e of entries) {
    for (const wk of weeks) {
      if (e.date >= wk.start && e.date <= wk.end) { wk.entries.push(e); break; }
    }
  }
  return weeks;
}

function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }

function trendLabel(curr, prev) {
  if (prev === null || curr === null) return null;
  const diff = curr - prev;
  if (Math.abs(diff) < 0.5) return {cls:'trend-flat', text:'→ Stable'};
  if (diff > 0) return {cls:'trend-up', text:'↑ Up from prior period'};
  return {cls:'trend-dn', text:'↓ Down from prior period'};
}

function isNextDay(a, b) { return daysBetween(a, b) === 1; }

/* Correlation helpers — take explicit entries array so window filter applies */
function getCorrData(entries) {
  const byDate = {};
  for (const e of entries) {
    if (!byDate[e.date]) byDate[e.date] = [];
    byDate[e.date].push(e);
  }
  const dates = Object.keys(byDate).sort();
  const signals = {};
  for (const d of dates) {
    const es = byDate[d];
    const physEntries = es.filter(e=>e.category==='physical'&&!e.solo);
    const burnoutEntries = es.filter(e=>e.category==='burnout');
    const turndownEntries = es.filter(e=>e.category==='turndown');
    signals[d] = {
      hasPhysical:         physEntries.length > 0,
      hasAffection:        es.some(e=>e.category==='affection'),
      hasConflict:         es.some(e=>e.category==='conflict'),
      hasTurndownByHer:    turndownEntries.some(e=>e.initiatedBy==='her'),
      hasTurndownByMe:     turndownEntries.some(e=>e.initiatedBy==='me'),
      hasBurnout:          burnoutEntries.length > 0,
      hasRestore:          es.some(e=>e.category==='restore'&&e.eventType!==RESTORE_NONE_TYPE),
      restoreQuality:      es.filter(e=>e.category==='restore').reduce((mx,e)=>Math.max(mx,migrateRestoreQuality(e.restoreQuality, e)||0),0),
      burnoutDrain:        burnoutEntries.length > 0 ? Math.round(burnoutEntries.reduce((s,e)=>s+burnoutLoadEntry(e),0)) : 0,
      burnoutIntensity:    burnoutEntries.length > 0 ? avg(burnoutEntries.map(e=>e.steadyingIntensity).filter(Boolean)) : null,
      burnoutTypes:        burnoutEntries.flatMap(e => {
        if (Array.isArray(e.caretakerTypes) && e.caretakerTypes.length) return e.caretakerTypes;
        if (e.caretakerType) return [e.caretakerType];
        // Legacy fallback
        return (Array.isArray(e.burnoutTypes) ? e.burnoutTypes : (e.burnoutType ? [e.burnoutType] : []));
      }).filter(Boolean),
      // Conflict numeric signals — conflictLoad is the sum of bankConfLoad for all conflict entries
      // conflictHeavy = true when any conflict entry has intensity >= 3 or conduct in angry/withdrawn
      conflictLoad:        es.filter(e=>e.category==='conflict').reduce((s,e)=>s+bankConfLoad(e),0),
      conflictHeavy:       es.some(e=>e.category==='conflict'&&(e.intensity>=3||e.conduct==='angry'||e.conduct==='withdrawn')),
      libidoLevel:         (es.find(e=>e.category==='libido')||{}).libiLevel ?? null,
      physQuality:         physEntries.filter(e=>!e.solo&&e.connectionQuality).length > 0
                             ? avg(physEntries.filter(e=>!e.solo).map(e=>e.connectionQuality).filter(Boolean))
                             : null,
      // Wobble signals
      hasWobble:           es.some(e=>e.category==='regulation'),
      wobbleIntensity:     (() => { const ws=es.filter(e=>e.category==='regulation'&&e.regulationIntensity); return ws.length ? ws.reduce((s,e)=>s+e.regulationIntensity,0)/ws.length : null; })(),
    };
  }
  return { dates, signals, byDate };
}

function computeCorrelations(winEntries) {
  const { dates, signals, byDate } = getCorrData(winEntries);
  const results = [];
  const minSamples = 3;

  // 1a. Conflict (any) → Turn Down by her (same day or immediately next day only)
  {
    let conflictDays=0, tdAfter=0, noConflictDays=0, tdNoConflict=0;
    for (let i=0; i<dates.length; i++) {
      const d=dates[i], s=signals[d];
      const next=dates[i+1];
      const nextS = next && isNextDay(d,next) ? signals[next] : null;
      if (s.hasConflict) {
        conflictDays++;
        if (s.hasTurndownByHer || (nextS && nextS.hasTurndownByHer)) tdAfter++;
      } else {
        noConflictDays++;
        if (s.hasTurndownByHer) tdNoConflict++;
      }
    }
    if (conflictDays >= minSamples) {
      const rWith = tdAfter/conflictDays;
      const rWithout = noConflictDays>0 ? tdNoConflict/noConflictDays : 0;
      const lift = rWithout>0 ? rWith/rWithout : rWith>0 ? 99 : 1;
      results.push({
        icon:'⚡→🌒', title:'Conflict & turn downs',
        desc:`On conflict days (or the next day), ${P.sub} turned down on ${Math.round(rWith*100)}% of occasions`+
             (rWithout>0 ? ` vs ${Math.round(rWithout*100)}% on other days.` : '.'),
        strength: lift>=2.5?'strong':lift>=1.5?'moderate':'weak', n:conflictDays,
      });
    }
  }

  // 1b. Heavy vs light conflict → turn down rate (split by severity)
  {
    let heavyDays=0, tdAfterHeavy=0, lightDays=0, tdAfterLight=0;
    for (let i=0; i<dates.length; i++) {
      const d=dates[i], s=signals[d];
      const next=dates[i+1];
      const nextS = next && isNextDay(d,next) ? signals[next] : null;
      const tdSameOrNext = s.hasTurndownByHer || (nextS && nextS.hasTurndownByHer);
      if (!s.hasConflict) continue;
      if (s.conflictHeavy) { heavyDays++; if (tdSameOrNext) tdAfterHeavy++; }
      else                  { lightDays++; if (tdSameOrNext) tdAfterLight++; }
    }
    if (heavyDays >= minSamples && lightDays >= minSamples) {
      const rH = tdAfterHeavy/heavyDays;
      const rL = tdAfterLight/lightDays;
      const diff = rH - rL;
      results.push({
        icon:'⚡⚡→🌒', title:'Conflict severity & turn downs',
        desc:`After heavy conflicts (intensity 3+ or angry/withdrawn conduct), ${P.sub} turned down ${Math.round(rH*100)}% of the time`+
             ` vs ${Math.round(rL*100)}% after lighter conflicts.`,
        strength: Math.abs(diff)>=0.3?'strong':Math.abs(diff)>=0.15?'moderate':'weak',
        lowData: heavyDays < 3 || lightDays < 3,
        n: heavyDays+lightDays,
      });
    }
  }

  // 1c. Conflict → next-day desire
  {
    const afterConflict=[], afterNoConflict=[];
    for (let i=0; i<dates.length-1; i++) {
      const d=dates[i], next=dates[i+1];
      if (!isNextDay(d,next)) continue;
      const ns=signals[next];
      if (ns.libidoLevel===null) continue;
      if (signals[d].hasConflict) afterConflict.push(ns.libidoLevel);
      else afterNoConflict.push(ns.libidoLevel);
    }
    if (afterConflict.length>=minSamples) {
      const aC=avg(afterConflict), aN=avg(afterNoConflict);
      const diff = aC!==null&&aN!==null ? aN-aC : 0;
      results.push({
        icon:'⚡→🌡️', title:'Conflict & next-day desire',
        desc:`After conflict days, next-day desire averages ${aC!==null?aC.toFixed(1):'—'}/5`+
             (aN!==null&&afterNoConflict.length>=minSamples ? ` vs ${aN.toFixed(1)}/5 on other days.` : '.'),
        strength: diff>=1.5?'strong':diff>=0.7?'moderate':'weak', n:afterConflict.length,
      });
    }
  }

  // 2. Medium/heavy caretaking → next day's libido (adjacent days only)
  {
    const afterHeavy=[], afterLight=[];
    for (let i=0; i<dates.length-1; i++) {
      const d=dates[i], next=dates[i+1];
      if (!isNextDay(d,next)) continue;
      const ns=signals[next];
      if (ns.libidoLevel!==null) {
        if (signals[d].burnoutDrain>=20) afterHeavy.push(ns.libidoLevel);
        else afterLight.push(ns.libidoLevel);
      }
    }
    if (afterHeavy.length>=minSamples) {
      const aH=avg(afterHeavy), aL=avg(afterLight);
      const diff = aH!==null&&aL!==null ? aL-aH : 0;
      results.push({
        icon:'🕯️→🌡️', title:'Steadying & next-day desire',
        desc:`After medium/heavy steadying, next-day desire averages ${aH!==null?aH.toFixed(1):'—'}/5`+
             (aL!==null ? ` vs ${aL.toFixed(1)}/5 after lighter days.` : '.'),
        strength: diff>=1.5?'strong':diff>=0.7?'moderate':'weak', n:afterHeavy.length,
      });
    }
  }

  // 3. Affection → physical intimacy (same day or immediately next)
  {
    let affDays=0, physAfter=0, noAffDays=0, physNoAff=0;
    for (let i=0; i<dates.length; i++) {
      const d=dates[i], s=signals[d];
      const next=dates[i+1];
      const nextS = next&&isNextDay(d,next) ? signals[next] : null;
      if (s.hasAffection) {
        affDays++;
        if (s.hasPhysical||(nextS&&nextS.hasPhysical)) physAfter++;
      } else {
        noAffDays++;
        if (s.hasPhysical) physNoAff++;
      }
    }
    if (affDays>=minSamples) {
      const rWith=physAfter/affDays;
      const rWithout=noAffDays>0?physNoAff/noAffDays:0;
      const lift=rWithout>0?rWith/rWithout:rWith>0?99:1;
      results.push({
        icon:'🩷→🌹', title:bondingLabel()+' & intimacy',
        desc:`On affection days (or the next day), physical intimacy occurred ${Math.round(rWith*100)}% of the time`+
             (rWithout>0 ? ` vs ${Math.round(rWithout*100)}% otherwise.` : '.'),
        strength: lift>=2.0?'strong':lift>=1.3?'moderate':'weak', n:affDays,
      });
    }
  }

  // 4. Relational friction → same-day desire level
  {
    const withStressor=[], withoutStressor=[];
    for (const d of dates) {
      const s = signals[d];
      if (s.libidoLevel === null) continue;
      if (s.hasConflict || s.hasTurndownByHer) withStressor.push(s.libidoLevel);
      else withoutStressor.push(s.libidoLevel);
    }
    if (withStressor.length >= minSamples) {
      const aWith = avg(withStressor), aWithout = avg(withoutStressor);
      const diff = aWith !== null && aWithout !== null ? aWithout - aWith : 0;
      results.push({
        icon:'⚡🌒→🌡️', title:'Relational friction & same-day desire',
        desc:`On days with conflict or a turn down, desire averages ${aWith !== null ? aWith.toFixed(1) : '—'}/5`+
             (aWithout !== null && withoutStressor.length >= minSamples ? ` vs ${aWithout.toFixed(1)}/5 on other days.` : '.'),
        strength: diff >= 1.5 ? 'strong' : diff >= 0.7 ? 'moderate' : 'weak',
        n: withStressor.length,
      });
    }
  }

  // 5. Caretaker type → next-day desire (lowered to 2 instances per type)
  {
    const typeMap = {};
    for (let i=0; i<dates.length-1; i++) {
      const d=dates[i], next=dates[i+1];
      if (!isNextDay(d,next)) continue;
      const ns=signals[next];
      if (ns.libidoLevel===null) continue;
      for (const t of signals[d].burnoutTypes) {
        if (!typeMap[t]) typeMap[t]=[];
        typeMap[t].push(ns.libidoLevel);
      }
    }
    const typeResults = Object.entries(typeMap)
      .filter(([,arr])=>arr.length>=minSamples)
      .map(([t,arr])=>({type:t, avg:avg(arr), n:arr.length}))
      .sort((a,b)=>a.avg-b.avg);
    if (typeResults.length >= 2) {
      const worst = typeResults[0];
      const best  = typeResults[typeResults.length-1];
      const typeLabel = t => burnoutLabel(t).label;
      const diff = best.avg - worst.avg;
      results.push({
        icon:'🕯️→🌡️🔍', title:'Steadying type & next-day desire',
        desc:`${typeLabel(worst.type)} is hardest on next-day desire (avg ${worst.avg.toFixed(1)}/5). `+
             `${typeLabel(best.type)} has the least impact (avg ${best.avg.toFixed(1)}/5).`,
        strength: diff>=1.5?'strong':diff>=0.7?'moderate':'weak',
        lowData: worst.n < 3,
        n: worst.n,
      });
    }
  }

  // 6. Physical intensity → next-day affection
  {
    const afterHigh=[], afterLow=[];
    for (let i=0; i<dates.length-1; i++) {
      const d=dates[i], next=dates[i+1];
      if (!isNextDay(d,next)) continue;
      const pq = signals[d].physQuality;
      if (pq===null) continue;
      const hasAffNext = signals[next].hasAffection;
      if (pq >= 4) afterHigh.push(hasAffNext ? 1 : 0);
      else afterLow.push(hasAffNext ? 1 : 0);
    }
    if (afterHigh.length>=minSamples) {
      const rHigh = avg(afterHigh), rLow = avg(afterLow);
      const lift = rLow>0 ? rHigh/rLow : rHigh>0 ? 99 : 1;
      results.push({
        icon:'🌹→🩷', title:'Intimacy quality & next-day '+bondingLabel().toLowerCase(),
        desc:`After meaningful or peak physical intimacy, affection occurred the next day ${Math.round((rHigh||0)*100)}% of the time`+
             (rLow!==null ? ` vs ${Math.round((rLow||0)*100)}% after lower-quality encounters.` : '.'),
        strength: lift>=2.0?'strong':lift>=1.3?'moderate':'weak', n:afterHigh.length,
      });
    }
  }

  // 7. Consecutive steadying days → desire drop
  {
    const afterRun=[], afterSingle=[];
    for (let i=0; i<dates.length; i++) {
      const d=dates[i];
      if (!signals[d].hasBurnout) continue;
      // Check if previous day was also a steadying day (consecutive run)
      const prev=dates[i-1];
      const isConsecutive = prev && isNextDay(prev,d) && signals[prev].hasBurnout;
      // Look for libido on the next day
      const next=dates[i+1];
      if (!next || !isNextDay(d,next)) continue;
      const nl=signals[next].libidoLevel;
      if (nl===null) continue;
      if (isConsecutive) afterRun.push(nl);
      else afterSingle.push(nl);
    }
    if (afterRun.length>=minSamples) {
      const aR=avg(afterRun), aS=avg(afterSingle);
      const diff = aR!==null&&aS!==null ? aS-aR : 0;
      results.push({
        icon:'🕯️🕯️→🌡️', title:'Consecutive steadying & desire',
        desc:`After 2+ consecutive steadying days, next-day desire averages ${aR!==null?aR.toFixed(1):'—'}/5`+
             (aS!==null ? ` vs ${aS.toFixed(1)}/5 after a single steadying day.` : '.'),
        strength: diff>=1.5?'strong':diff>=0.7?'moderate':'weak', n:afterRun.length,
      });
    }
  }

  // 8. Her turn down — how it happened → days until next physical
  {
    const typeGaps = {};
    const physDates = dates.filter(d=>signals[d].hasPhysical);
    for (let i=0; i<dates.length; i++) {
      const d=dates[i];
      const herTDs = (byDate[d]||[]).filter(e=>e.category==='turndown'&&e.initiatedBy==='her'&&e.turndownType);
      for (const e of herTDs) {
        const key = e.turndownType;
        const nextPhys = physDates.find(pd=>pd>d);
        if (!nextPhys) continue;
        const gap = daysBetween(d, nextPhys);
        if (gap > 30) continue;
        if (!typeGaps[key]) typeGaps[key]=[];
        typeGaps[key].push(gap);
      }
    }
    const typeResults = Object.entries(typeGaps)
      .filter(([,arr])=>arr.length>=2)
      .map(([t,arr])=>({type:t, avg:avg(arr), n:arr.length}))
      .sort((a,b)=>b.avg-a.avg);
    if (typeResults.length >= 1) {
      const worst = typeResults[0];
      const best  = typeResults[typeResults.length-1];
      const tdLabel = t => TURNDOWN_TYPES.find(x=>x.val===t)?.label || t;
      const diff = worst.avg - best.avg;
      const desc = typeResults.length >= 2
        ? `After "${tdLabel(worst.type)}" turn downs, next intimacy averages ${worst.avg.toFixed(1)} days. After "${tdLabel(best.type)}", ${best.avg.toFixed(1)} days.`
        : `After "${tdLabel(worst.type)}" turn downs, next intimacy averages ${worst.avg.toFixed(1)} days.`;
      results.push({
        icon:'🌒→🌹', title:`How ${P.sub} turns you down & recovery time`,
        desc,
        strength: typeResults.length >= 2 ? (diff >= 3 ? 'strong' : diff >= 1.5 ? 'moderate' : 'weak') : 'weak',
        lowData: worst.n < 3,
        n: worst.n,
      });
    }
  }

  // 9. Affection day before → physical quality (connection-first test)
  {
    const withAff=[], withoutAff=[];
    for (let i=0; i<dates.length; i++) {
      const d=dates[i];
      const pq=signals[d].physQuality;
      if (pq===null) continue;
      const prev=dates[i-1];
      const prevHadAff = prev && isNextDay(prev,d) && signals[prev].hasAffection;
      if (prevHadAff) withAff.push(pq);
      else withoutAff.push(pq);
    }
    if (withAff.length>=minSamples) {
      const aWith=avg(withAff), aWithout=avg(withoutAff);
      const diff = aWith!==null&&aWithout!==null ? aWith-aWithout : 0;
      results.push({
        icon:'🩷→🌹★', title:bondingLabel()+' & intimacy quality',
        desc:`Physical intimacy following an affection day averages ${aWith!==null?aWith.toFixed(1):'—'}/5 quality`+
             (aWithout!==null ? ` vs ${aWithout.toFixed(1)}/5 without prior affection.` : '.'),
        strength: diff>=1.0?'strong':diff>=0.5?'moderate':'weak', n:withAff.length,
      });
    }
  }


  // 12. Solo context → days until next shared physical
  {
    const contextGaps = {};
    const sharedDates = dates.filter(d=>signals[d].hasPhysical);
    for (const d of dates) {
      const soloEntries = (byDate[d]||[]).filter(e=>e.category==='physical'&&e.solo&&e.soloContext);
      for (const e of soloEntries) {
        const nextShared = sharedDates.find(sd=>sd>d);
        if (!nextShared) continue;
        const gap = daysBetween(d, nextShared);
        if (gap > 30) continue;
        if (!contextGaps[e.soloContext]) contextGaps[e.soloContext]=[];
        contextGaps[e.soloContext].push(gap);
      }
    }
    const ctxResults = Object.entries(contextGaps)
      .filter(([,arr])=>arr.length>=2)
      .map(([c,arr])=>({ctx:c, avg:avg(arr), n:arr.length}))
      .sort((a,b)=>b.avg-a.avg);
    if (ctxResults.length >= 1) {
      const SOLO_CTX_LABEL = c => SOLO_CONTEXT.find(x=>x.val===c)?.label || c;
      const worst = ctxResults[0];
      const best  = ctxResults[ctxResults.length-1];
      const desc = ctxResults.length >= 2
        ? `"${SOLO_CTX_LABEL(worst.ctx)}" is followed by the longest gap to shared intimacy (avg ${worst.avg.toFixed(1)} days). "${SOLO_CTX_LABEL(best.ctx)}" has the shortest gap (avg ${best.avg.toFixed(1)} days).`
        : `After "${SOLO_CTX_LABEL(worst.ctx)}", shared intimacy follows after avg ${worst.avg.toFixed(1)} days.`;
      results.push({
        icon:'🌹→🌹🌹', title:'Solo context & recovery to shared',
        desc,
        strength: ctxResults.length>=2 ? ((worst.avg-best.avg)>=3?'strong':(worst.avg-best.avg)>=1.5?'moderate':'weak') : 'weak',
        lowData: worst.n < 3,
        n: worst.n,
      });
    }

    // Post-turndown coping frequency
    const postTD = dates.filter(d => {
      const solo = (byDate[d]||[]).filter(e=>e.category==='physical'&&e.solo&&e.soloContext==='postturndown');
      return solo.length > 0;
    });
    const tdDays = dates.filter(d => signals[d].hasTurndownByHer);
    if (postTD.length >= 2 && tdDays.length >= 2) {
      const pct = Math.round(postTD.length / tdDays.length * 100);
      results.push({
        icon:'🌒→🌹', title:'Post-turndown coping',
        desc:`Solo activity logged after a turn-down on ${postTD.length} occasion${postTD.length!==1?'s':''} (${pct}% of turn-down days). ${pct >= 50 ? 'A consistent coping pattern.' : 'Occasional pattern.'}`,
        strength: pct>=50?'moderate':'weak',
        lowData: postTD.length < 3,
        n: postTD.length,
      });
    }
  }

  // 14. Me turning her down — relational balance on those days
  {
    const timeline = computeLoveBankScore(winEntries);
    const balanceByDate = {};
    for (const pt of timeline) balanceByDate[pt.date] = pt.balance;

    const myTurndownDays  = dates.filter(d => signals[d].hasTurndownByMe);
    const otherDays       = dates.filter(d => !signals[d].hasTurndownByMe);
    const balOn  = myTurndownDays.map(d => balanceByDate[d]).filter(v => v != null);
    const balOff = otherDays.map(d => balanceByDate[d]).filter(v => v != null);

    if (myTurndownDays.length >= minSamples) {
      const avgOn  = avg(balOn);
      const avgOff = avg(balOff);
      const diff   = avgOn != null && avgOff != null ? avgOn - avgOff : null;
      const lowerOnTD = diff != null && diff < -10;
      const tdDesc = avgOn != null
        ? `On days you turned ${P.obj} down, avg relational balance was ` + (avgOn >= 0 ? '+' : '') + avgOn.toFixed(0)
          + (avgOff != null ? ' vs ' + (avgOff >= 0 ? '+' : '') + avgOff.toFixed(0) + ' on other days.' : '.')
          + (lowerOnTD ? ' Your turn downs tend to follow lower-balance periods.' : '')
        : 'Not enough data yet.';
      results.push({
        icon:'🌒↩', title:'Your turn downs & relational balance',
        desc: tdDesc,
        strength: lowerOnTD ? (Math.abs(diff) >= 50 ? 'strong' : 'moderate') : 'weak',
        n: myTurndownDays.length,
      });
    }
  }

  // 15. Restorative → next-day desire
  {
    const afterRestore=[], afterNoRestore=[];
    for (let i=0; i<dates.length-1; i++) {
      const d=dates[i], next=dates[i+1];
      if (!isNextDay(d,next)) continue;
      const ns=signals[next];
      if (ns.libidoLevel===null) continue;
      if (signals[d].hasRestore) afterRestore.push(ns.libidoLevel);
      else afterNoRestore.push(ns.libidoLevel);
    }
    if (afterRestore.length>=minSamples) {
      const aR=avg(afterRestore), aN=avg(afterNoRestore);
      const diff = aR!==null&&aN!==null ? aR-aN : 0;
      results.push({
        icon:'🌊→🌡️', title:'Restorative activity & next-day desire',
        desc:`After a restorative activity, next-day desire averages ${aR!==null?aR.toFixed(1):'—'}/5`+
             (aN!==null ? ` vs ${aN.toFixed(1)}/5 on other days.` : '.'),
        strength: diff>=1.5?'strong':diff>=0.7?'moderate':'weak',
        lowData: afterRestore.length < 3,
        n: afterRestore.length,
      });
    }
  }

  // 16. Restorative → next-day steadying drain
  {
    const afterRestore=[], afterNoRestore=[];
    for (let i=0; i<dates.length-1; i++) {
      const d=dates[i], next=dates[i+1];
      if (!isNextDay(d,next)) continue;
      const nextBurnout = (byDate[next]||[]).filter(e=>e.category==='burnout');
      if (nextBurnout.length === 0) continue;
      const nextDrain = nextBurnout.reduce((s,e)=>s+burnoutLoadEntry(e),0);
      if (signals[d].hasRestore) afterRestore.push(nextDrain);
      else afterNoRestore.push(nextDrain);
    }
    if (afterRestore.length>=minSamples) {
      const aR=avg(afterRestore), aN=avg(afterNoRestore);
      const diff = aR!==null&&aN!==null ? aN-aR : 0;
      results.push({
        icon:'🌊→🕯️', title:'Restorative activity & next-day steadying',
        desc:`After a restorative activity, next-day steadying load averages ${aR!==null?Math.round(aR):'—'} pts`+
             (aN!==null ? ` vs ${Math.round(aN)} pts on other days.` : '.'),
        strength: diff>=15?'strong':diff>=8?'moderate':'weak',
        lowData: afterRestore.length < 3,
        n: afterRestore.length,
      });
    }
  }

  // 17. My turn down reason → next-day steadying load
  {
    const byReason = {};
    for (let i=0; i<dates.length-1; i++) {
      const d=dates[i], next=dates[i+1];
      if (!isNextDay(d,next)) continue;
      const myTDs = (byDate[d]||[]).filter(e=>e.category==='turndown'&&e.initiatedBy==='me'&&e.tdMyReason);
      if (!myTDs.length) continue;
      const nextBurnout = (byDate[next]||[]).filter(e=>e.category==='burnout');
      const nextLoad = nextBurnout.reduce((s,e)=>s+burnoutLoadEntry(e),0);
      for (const e of myTDs) {
        if (!byReason[e.tdMyReason]) byReason[e.tdMyReason]=[];
        byReason[e.tdMyReason].push(nextLoad);
      }
    }
    const reasonResults = Object.entries(byReason)
      .filter(([,arr])=>arr.length>=2)
      .map(([r,arr])=>({reason:r, avg:avg(arr), n:arr.length}))
      .sort((a,b)=>b.avg-a.avg);
    if (reasonResults.length >= 1) {
      const worst = reasonResults[0];
      const best  = reasonResults[reasonResults.length-1];
      const rLabel = r => TD_MY_REASONS.find(x=>x.val===r)?.label || r;
      const diff = reasonResults.length >= 2 ? worst.avg - best.avg : 0;
      const desc = reasonResults.length >= 2
        ? `When you turn ${P.obj} down because "${rLabel(worst.reason)}", next-day steadying load averages ${Math.round(worst.avg)} pts — highest of your reasons. "${rLabel(best.reason)}" has the lowest follow-on load (${Math.round(best.avg)} pts).`
        : `When you turn ${P.obj} down because "${rLabel(worst.reason)}", next-day steadying load averages ${Math.round(worst.avg)} pts.`;
      results.push({
        icon:'🌒↩→🕯️', title:`Why you turn ${P.obj} down & next-day steadying`,
        desc,
        strength: diff>=15?'strong':diff>=8?'moderate':'weak',
        lowData: worst.n < 3,
        n: worst.n,
      });
    }
  }

  // 18. My turn down reasons — pattern summary
  {
    const allMyTDs = winEntries.filter(e=>e.category==='turndown'&&e.initiatedBy==='me'&&e.tdMyReason);
    if (allMyTDs.length >= 3) {
      const counts = {};
      for (const e of allMyTDs) counts[e.tdMyReason] = (counts[e.tdMyReason]||0) + 1;
      const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
      const top = sorted[0];
      const rLabel = r => TD_MY_REASONS.find(x=>x.val===r)?.label || r;
      const pct = Math.round(top[1] / allMyTDs.length * 100);
      const parts = sorted.map(([r,n]) => `${rLabel(r)} (${n})`).join(', ');
      results.push({
        icon:'🌒↩', title:'Your turn down reasons',
        desc:`You most often turn ${P.obj} down because "${rLabel(top[0])}" (${pct}% of ${allMyTDs.length} logged). Full breakdown: ${parts}.`,
        strength: pct >= 60 ? 'moderate' : 'weak',
        lowData: allMyTDs.length < 5,
        n: allMyTDs.length,
      });
    }
  }


  {
    const affEntries  = winEntries.filter(e=>e.category==='affection');
    const physEntries = winEntries.filter(e=>e.category==='physical'&&!e.solo);
    const allInit     = [...affEntries, ...physEntries].filter(e=>e.initiatedBy);

    if (allInit.length >= minSamples) {
      const byMe    = allInit.filter(e=>e.initiatedBy==='me').length;
      const byHer   = allInit.filter(e=>e.initiatedBy==='her').length;
      const mutual  = allInit.filter(e=>e.initiatedBy==='mutual').length;
      const total   = allInit.length;
      const herPct  = Math.round((byHer / total) * 100);
      const mePct   = Math.round((byMe  / total) * 100);

      // Split affection and physical separately for nuance
      const affByHerPct = affEntries.filter(e=>e.initiatedBy).length > 0
        ? Math.round(affEntries.filter(e=>e.initiatedBy==='her').length / affEntries.filter(e=>e.initiatedBy).length * 100)
        : null;
      const physByHerPct = physEntries.filter(e=>e.initiatedBy).length > 0
        ? Math.round(physEntries.filter(e=>e.initiatedBy==='her').length / physEntries.filter(e=>e.initiatedBy).length * 100)
        : null;

      const asymmetry = mePct - herPct;
      const strength  = asymmetry >= 60 ? 'strong' : asymmetry >= 35 ? 'moderate' : 'weak';

      const breakdown = [
        affByHerPct  !== null ? `${bondingLabel()}: ${P.sub} initiated ${affByHerPct}%`   : null,
        physByHerPct !== null ? `Physical: ${P.sub} initiated ${physByHerPct}%` : null,
      ].filter(Boolean).join(' · ');

      results.push({
        icon:'🩷🌹↔', title:'Initiation asymmetry',
        desc:`Across ${bondingLabel().toLowerCase()} and physical events, you initiated ${mePct}% vs ${P.obj} ${herPct}%`+
             (mutual > 0 ? ` (${Math.round(mutual/total*100)}% mutual).` : '.') +
             (breakdown ? ' ' + breakdown + '.' : '') +
             (asymmetry >= 35 ? ' Connection is mostly initiated by you.' : asymmetry <= -10 ? ` ${P.Sub} is initiating more connection than you.` : ' Initiation is broadly balanced.'),
        strength,
        lowData: total < 5,
        n: total,
      });
    }
  }

  // 19. Wobble → next-day desire
  if (S.showRegulation) {
    const afterWobble=[], afterNoWobble=[];
    for (let i=0; i<dates.length-1; i++) {
      const d=dates[i], next=dates[i+1];
      if (!isNextDay(d,next)) continue;
      const ns=signals[next];
      if (ns.libidoLevel===null) continue;
      if (signals[d].hasWobble) afterWobble.push(ns.libidoLevel);
      else afterNoWobble.push(ns.libidoLevel);
    }
    if (afterWobble.length>=minSamples) {
      const aW=avg(afterWobble), aN=avg(afterNoWobble);
      const diff = aW!==null&&aN!==null ? aN-aW : 0;
      results.push({
        icon:'🫧→🌡️', title:'Life Wobble & next-day desire',
        desc:`After a wobble day, next-day desire averages ${aW!==null?aW.toFixed(1):'—'}/5`+
             (aN!==null&&afterNoWobble.length>=minSamples ? ` vs ${aN.toFixed(1)}/5 on other days.` : '.'),
        strength: diff>=1.5?'strong':diff>=0.7?'moderate':'weak',
        lowData: afterWobble.length < 3,
        n: afterWobble.length,
      });
    }
  }

  // 20. Wobble intensity → same-day restore rate
  if (S.showRegulation) {
    const wobbleDays = dates.filter(d=>signals[d].hasWobble);
    const withRestore    = wobbleDays.filter(d=>signals[d].hasRestore).length;
    const withoutRestore = wobbleDays.length - withRestore;
    const nonWobbleDays  = dates.filter(d=>!signals[d].hasWobble);
    const nonWobbleRestore = nonWobbleDays.filter(d=>signals[d].hasRestore).length;
    if (wobbleDays.length >= minSamples) {
      const rWith    = withRestore / wobbleDays.length;
      const rWithout = nonWobbleDays.length > 0 ? nonWobbleRestore / nonWobbleDays.length : null;
      const lift     = rWithout != null && rWithout > 0 ? rWith / rWithout : rWith > 0 ? 99 : 1;
      results.push({
        icon:'🫧→🌊', title:'Wobble days & restore activity',
        desc:`On wobble days, you logged restorative activity ${Math.round(rWith*100)}% of the time`+
             (rWithout!=null&&nonWobbleDays.length>=minSamples ? ` vs ${Math.round(rWithout*100)}% on other days.` : '.') +
             (rWith < 0.25 ? ' Wobble rarely triggers restoration.' : rWith >= 0.5 ? ' Good instinct — restoration is following wobble.' : ''),
        strength: lift>=2.0?'strong':lift>=1.3?'moderate':'weak',
        lowData: wobbleDays.length < 3,
        n: wobbleDays.length,
      });
    }
  }

  // 21. Tones in your wobbles — dominant emotional tones + polyvagal lean
  if (S.showRegulation) {
    const wobbleWithEmotions = winEntries.filter(e =>
      e.category === 'regulation' && Array.isArray(e.regulationEmotions) && e.regulationEmotions.length > 0
    );
    if (wobbleWithEmotions.length >= 5) {
      // Entry-level dominant tone: each entry votes for its most-tagged tone
      const toneCounts = {};
      for (const e of wobbleWithEmotions) {
        const tv = entryDominantTone(e);
        if (tv) toneCounts[tv] = (toneCounts[tv]||0) + 1;
      }
      const total = wobbleWithEmotions.length;
      const sortedTones = Object.entries(toneCounts)
        .sort((a,b) => b[1]-a[1])
        .filter(([,n]) => Math.round(n/total*100) >= 10)
        .slice(0, 3);

      if (sortedTones.length > 0) {
        const toneList = sortedTones.map(([val, n]) => {
          const tone = EMOTION_TONES.find(t => t.val === val);
          return `${tone ? tone.label : val} (${Math.round(n/total*100)}%)`;
        }).join(', ');
        const toneIntro = sortedTones.length === 1
          ? `One tone dominated your wobbles this period: ${toneList}.`
          : `Your wobbles this period clustered around ${toneList}.`;

        // Polyvagal lean as closing sentence
        const stateCounts = { activated: 0, withdrawal: 0, mixed: 0 };
        for (const e of wobbleWithEmotions) stateCounts[entryPolyvagalState(e)]++;
        const topState = Object.entries(stateCounts).sort((a,b) => b[1]-a[1])[0][0];
        const leanText = {
          activated:  'Most of your wobbles were activating — the nervous system tending to mobilize rather than collapse.',
          withdrawal: 'Most of your wobbles trended toward shutdown — the nervous system tending to collapse rather than mobilize when overwhelmed.',
          mixed:      'Your wobbles were split across activating and shutdown tones — the nervous system shifting rather than settling in one direction.',
        };

        const topToneCount = sortedTones[0][1];
        results.push({
          icon:'🫧', title:'Tones in your wobbles',
          desc: `${toneIntro} ${leanText[topState]}`,
          strength: Math.round(topToneCount/total*100) >= 50 ? 'moderate' : 'weak',
          lowData: wobbleWithEmotions.length < 8,
          n: wobbleWithEmotions.length,
        });
      }
    }
  }

  // 22. Tone shift across periods — compares current 7 days vs prior 7.
  //     Fixed 7-day frame for both legacy and experimental modes since this
  //     is a recency-comparison signal, not a scoring window.
  if (S.showRegulation) {
    const _tsDays   = 7;
    const _currFrom = addDays(S.today, -(_tsDays - 1));
    const _prevFrom = addDays(S.today, -(_tsDays * 2 - 1));
    const _isWobble = e => e.category === 'regulation' && Array.isArray(e.regulationEmotions) && e.regulationEmotions.length > 0;
    const currWobble = calcEntries().filter(e => _isWobble(e) && e.date >= _currFrom && e.date <= S.today);
    const prevWobble = calcEntries().filter(e => _isWobble(e) && e.date >= _prevFrom && e.date < _currFrom);
    if (currWobble.length >= 3 && prevWobble.length >= 3) {
      const entryTonePcts = (entries) => {
        const tc = {};
        for (const e of entries) { const tv = entryDominantTone(e); if (tv) tc[tv] = (tc[tv]||0) + 1; }
        const total = entries.length;
        return Object.fromEntries(Object.entries(tc).map(([k,n]) => [k, Math.round(n/total*100)]));
      };

      const currPcts = entryTonePcts(currWobble);
      const prevPcts = entryTonePcts(prevWobble);
      const currTop  = Object.entries(currPcts).sort((a,b) => b[1]-a[1])[0];
      const prevTop  = Object.entries(prevPcts).sort((a,b) => b[1]-a[1])[0];

      if (currTop && prevTop && currTop[0] !== prevTop[0]) {
        // Shift = how much the prev dominant tone fell between periods
        const prevToneInCurr = currPcts[prevTop[0]] || 0;
        const shift = prevTop[1] - prevToneInCurr;

        if (shift >= 20) {
          const cLabel = (EMOTION_TONES.find(t => t.val === currTop[0]) || {label: currTop[0]}).label;
          const pLabel = (EMOTION_TONES.find(t => t.val === prevTop[0]) || {label: prevTop[0]}).label;

          const activatedTones = new Set(['fear','anger','activation']);
          const withdrawalTones = new Set(['sadness','shame','shutdown']);
          const prevDir = activatedTones.has(prevTop[0]) ? 'activated' : withdrawalTones.has(prevTop[0]) ? 'withdrawal' : 'mixed';
          const currDir = activatedTones.has(currTop[0]) ? 'activated' : withdrawalTones.has(currTop[0]) ? 'withdrawal' : 'mixed';

          const pairText = {
            'fear->sadness':    'A shift from Fear to Sadness often follows acute stress easing — the nervous system stops bracing and starts feeling what was held back.',
            'fear->anger':      'Fear converting to Anger can signal the threat feels more direct — the nervous system shifting from bracing to pushing back.',
            'anger->sadness':   'Anger often protects against sadness. This shift may signal deeper processing beginning as the defences ease.',
            'anger->fear':      'Anger stepping back toward Fear can mean the sense of threat is returning — worth noticing what\'s changed.',
            'shutdown->fear':   'A shift from Shutdown to Fear suggests the nervous system is coming back online — finding energy, but encountering new anxiety.',
            'shutdown->anger':  'Shutdown lifting into Anger — the nervous system finding mobilisation energy after a period of collapse.',
            'shame->sadness':   'Shame softening into Sadness can be a positive shift — feeling the hurt without the self-judgment attached.',
            'sadness->fear':    'A shift from Sadness toward Fear may signal a new stressor entering, or a return to anticipatory anxiety.',
            'sadness->shutdown':'Sadness deepening into Shutdown suggests the nervous system is pulling back further — worth checking in on resources.',
          };
          const dirText = {
            'activated->withdrawal': 'A shift from activating to withdrawal tones — the nervous system moving from mobilisation toward collapse or processing.',
            'withdrawal->activated': 'A shift from withdrawal to activating tones — the nervous system finding energy again, or encountering new pressure.',
          };

          const meaning = pairText[`${prevTop[0]}->${currTop[0]}`]
            || dirText[`${prevDir}->${currDir}`]
            || 'Your emotional centre of gravity has shifted — worth noticing what has changed in your circumstances.';

          results.push({
            icon:'🫧↕', title:'Tone shift across periods',
            desc: `The dominant tone in your wobbles has shifted from ${pLabel} to ${cLabel} this period. ${meaning}`,
            strength: shift >= 35 ? 'moderate' : 'weak',
            lowData: currWobble.length < 5,
            n: currWobble.length,
          });
        }
      }
    }
  }

  // 23. Tone after conflict — which tone dominates conflict-aftermath wobbles
  if (S.showRegulation) {
    const conflictEntries = winEntries.filter(e => e.category === 'conflict');
    if (conflictEntries.length >= 3) {
      const conflictDates = new Set(conflictEntries.map(e => e.date));
      const aftermathWobbles = winEntries.filter(e =>
        e.category === 'regulation' &&
        Array.isArray(e.regulationEmotions) && e.regulationEmotions.length > 0 &&
        (conflictDates.has(e.date) || conflictDates.has(addDays(e.date, -1)))
      );
      if (aftermathWobbles.length >= 3) {
        const toneCounts = {};
        for (const e of aftermathWobbles) {
          const tv = entryDominantTone(e);
          if (tv) toneCounts[tv] = (toneCounts[tv]||0) + 1;
        }
        const total = aftermathWobbles.length;
        const sorted = Object.entries(toneCounts).sort((a,b) => b[1]-a[1]);
        if (sorted.length > 0 && sorted[0][1] / total >= 0.60) {
          const [topVal, topN] = sorted[0];
          const tLabel = (EMOTION_TONES.find(t => t.val === topVal) || {label: topVal}).label;
          const toneText = {
            shame:      'After-conflict shame often signals criticism in the room — focusing on who someone is rather than what they did tends to leave both people feeling small.',
            fear:       'Fear after conflicts may signal the conflict feels threatening — bracing for escalation, or anticipating the next round.',
            anger:      'Lingering anger after conflict often means something still feels unresolved — unfair, unheard, or unacknowledged.',
            sadness:    'Sadness after conflict often signals a loss layer — of connection, of how things were expected to go, or of closeness.',
            shutdown:   'Shutdown after conflict may be the nervous system protecting itself — too depleted to process further, going quiet to recover.',
            activation: 'Continued activation after conflict suggests the threat response is still running — the body hasn\'t settled even though the argument ended.',
          };
          const meaning = toneText[topVal] || 'Worth noticing which emotional tone tends to follow conflict for you.';
          results.push({
            icon:'⚡🫧', title:'Tone after conflict',
            desc: `${tLabel} appeared in ${topN} of your ${total} conflict aftermath wobbles. ${meaning}`,
            strength: sorted[0][1] / total >= 0.75 ? 'moderate' : 'weak',
            lowData: aftermathWobbles.length < 5,
            n: aftermathWobbles.length,
          });
        }
      }
    }
  }

  // 24. What helps which tone — support source correlated with settling per tone
  if (S.showRegulation) {
    const withData = winEntries.filter(e =>
      e.category === 'regulation' &&
      Array.isArray(e.regulationEmotions) && e.regulationEmotions.length > 0 &&
      e.regulationResolution &&
      Array.isArray(e.regulationSupportSources) && e.regulationSupportSources.length > 0
    );
    if (withData.length >= 10) {
      const settled = new Set(['resolved','coming-down']);
      // Per-tone: gather support sources from well-settled entries
      const toneSettled = {};
      for (const e of withData) {
        const tv = entryDominantTone(e);
        if (!tv) continue;
        if (!toneSettled[tv]) toneSettled[tv] = { settled: {}, unsettled: {} };
        const bucket = settled.has(e.regulationResolution) ? 'settled' : 'unsettled';
        for (const src of e.regulationSupportSources)
          toneSettled[tv][bucket][src] = (toneSettled[tv][bucket][src]||0) + 1;
      }
      const srcLabel = { self:'working through it alone', partner:'connection with your partner', friends:'support from friends or family', therapist:'professional support', other:'other support' };
      const toneFindings = [];
      for (const [tv, data] of Object.entries(toneSettled)) {
        const settledTotal = Object.values(data.settled).reduce((s,n)=>s+n,0);
        if (settledTotal < 4) continue;
        const topSrc = Object.entries(data.settled).sort((a,b)=>b[1]-a[1])[0];
        if (!topSrc || topSrc[1] / settledTotal < 0.45) continue;
        toneFindings.push({ tv, topSrc: topSrc[0], pct: Math.round(topSrc[1]/settledTotal*100) });
      }
      if (toneFindings.length >= 2) {
        const activatedTones = new Set(['fear','anger','activation']);
        const lines = toneFindings.slice(0,3).map(f => {
          const tLabel = (EMOTION_TONES.find(t=>t.val===f.tv)||{label:f.tv}).label;
          return `${tLabel} wobbles tend to settle with ${srcLabel[f.topSrc]||f.topSrc} (${f.pct}% of settled entries).`;
        });
        const hasActivated = toneFindings.some(f => activatedTones.has(f.tv));
        const hasWithdrawal = toneFindings.some(f => !activatedTones.has(f.tv));
        const closing = hasActivated && hasWithdrawal
          ? 'Different states seem to need different responses — worth knowing which resource to reach for.'
          : 'Your own data is pointing toward what helps.';
        results.push({
          icon:'🫧🌊', title:'What helps which tone',
          desc: lines.join(' ') + ' ' + closing,
          strength: toneFindings.length >= 3 ? 'moderate' : 'weak',
          lowData: withData.length < 15,
          n: withData.length,
        });
      }
    }
  }

  // 25. How tones settle — avg resolution state per tone as proxy for lingering
  if (S.showRegulation) {
    const resM = { resolved:0.20, 'coming-down':0.40, 'still-on':0.60, 'no-better':0.80, heavier:1.00 };
    const toneRes = {};
    for (const e of winEntries) {
      if (e.category !== 'regulation') continue;
      if (!e.regulationResolution || !resM[e.regulationResolution]) continue;
      const tv = entryDominantTone(e);
      if (!tv) continue;
      if (!toneRes[tv]) toneRes[tv] = [];
      toneRes[tv].push(resM[e.regulationResolution]);
    }
    const toneAvgs = Object.entries(toneRes)
      .filter(([,arr]) => arr.length >= 5)
      .map(([tv, arr]) => ({ tv, avg: arr.reduce((s,n)=>s+n,0)/arr.length, n: arr.length }))
      .sort((a,b) => a.avg - b.avg); // best-settling first
    if (toneAvgs.length >= 2 && toneAvgs[toneAvgs.length-1].avg - toneAvgs[0].avg >= 0.25) {
      const resLabel = avg => avg <= 0.30 ? 'tends to settle quickly' : avg <= 0.50 ? 'tends to partially resolve' : avg <= 0.70 ? 'tends to linger' : 'tends to stay heavy';
      const lines = toneAvgs.map(f => {
        const tLabel = (EMOTION_TONES.find(t=>t.val===f.tv)||{label:f.tv}).label;
        return `${tLabel} ${resLabel(f.avg)}.`;
      });
      results.push({
        icon:'🫧⏱', title:'How tones settle',
        desc: lines.join(' ') + ' Some tones move through quickly. Some need more time.',
        strength: toneAvgs.length >= 3 ? 'moderate' : 'weak',
        lowData: toneAvgs.every(t => t.n < 8),
        n: toneAvgs.reduce((s,t)=>s+t.n,0),
      });
    }
  }

  // 26. Capacity-tone correlation — which tone clusters on low-capacity days
  if (S.showRegulation) {
    const wobbleWithTone = winEntries.filter(e =>
      e.category === 'regulation' && entryDominantTone(e) !== null
    );
    const libiByDate = {};
    for (const e of winEntries) { if (e.category==='libido' && e.libiLevel) libiByDate[e.date] = e.libiLevel; }
    const paired = wobbleWithTone.filter(e => libiByDate[e.date] !== undefined);
    if (paired.length >= 10) {
      // Baseline: % of all paired days that were low-capacity (≤2)
      const allLow = paired.filter(e => libiByDate[e.date] <= 2).length;
      const baseline = allLow / paired.length;
      // Per-tone rate
      const toneData = {};
      for (const e of paired) {
        const tv = entryDominantTone(e);
        if (!toneData[tv]) toneData[tv] = { total: 0, low: 0 };
        toneData[tv].total++;
        if (libiByDate[e.date] <= 2) toneData[tv].low++;
      }
      const notable = Object.entries(toneData)
        .filter(([,d]) => d.total >= 4 && baseline > 0 && (d.low/d.total) >= baseline * 2)
        .sort((a,b) => (b[1].low/b[1].total) - (a[1].low/a[1].total));
      if (notable.length > 0) {
        const [topVal, topData] = notable[0];
        const tLabel = (EMOTION_TONES.find(t=>t.val===topVal)||{label:topVal}).label;
        const ratio = Math.round((topData.low/topData.total) / baseline * 10) / 10;
        const activatedTones = new Set(['fear','anger','activation']);
        const form = activatedTones.has(topVal) ? 'mobilising' : 'shutdown';
        results.push({
          icon:'🫧🪫', title:'Capacity-tone correlation',
          desc: `${tLabel} tones appeared on low-capacity days about ${ratio}× more often than on other days. When the body is depleted, overwhelm tends to take the ${form} form.`,
          strength: ratio >= 3 ? 'moderate' : 'weak',
          lowData: paired.length < 15,
          n: paired.length,
        });
      }
    }
  }

  // 27. What keeps showing up (horsemen) — one card per horseman that appeared
  {
    const conflictsWithHorsemen = winEntries.filter(e =>
      e.category === 'conflict' && Array.isArray(e.horsemen) && e.horsemen.length > 0
    );
    if (conflictsWithHorsemen.length >= 3) {
      const counts = {};
      for (const e of conflictsWithHorsemen)
        for (const hm of e.horsemen) counts[hm] = (counts[hm] || 0) + 1;
      const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
      for (const [val, count] of sorted) {
        const label = CONFLICT_HORSEMEN.find(h => h.val === val)?.label || val;
        const antidote = HORSEMEN_ANTIDOTE[val] || '';
        const pct = Math.round(count / conflictsWithHorsemen.length * 100);
        const desc = `${label} appeared in ${count} of ${conflictsWithHorsemen.length} logged conflicts (${pct}%).`
          + (antidote ? ' ' + antidote : '');
        results.push({
          icon:'🔄', title:'What keeps showing up: '+label,
          desc,
          strength: pct >= 60 ? 'strong' : pct >= 40 ? 'moderate' : 'weak',
          lowData: conflictsWithHorsemen.length < 5,
          n: count,
        });
      }
    }
  }

  return results;
}

/* ── Insights panel builder ─────────────────────────── */
function buildHomePage() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayFmt = now.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });

  // Calc-filtered entries: respects the debug "calc start date" setting.
  // The calendar / day panel still read from S.allEntries directly.
  const allEntries = calcEntries();

  // Data windows
  const last7  = allEntries.filter(e => e.date >= addDays(S.today, -6) && e.date <= S.today);
  const last14 = allEntries.filter(e => e.date >= addDays(S.today, -13) && e.date <= S.today);
  const todayEs = allEntries.filter(e => e.date === S.today);
  const yesterday = addDays(S.today, -1);
  const yestEs = allEntries.filter(e => e.date === yesterday);

  // Days since last bonding
  const lastBonding = allEntries.filter(e => e.category === 'affection').map(e => e.date).sort().pop();
  const daysSinceBonding = lastBonding ? daysBetween(lastBonding, S.today) : null;

  // Days since last restorative
  const lastRestore = allEntries.filter(e => e.category === 'restore' && e.eventType !== RESTORE_NONE_TYPE).map(e => e.date).sort().pop();
  const daysSinceRestore = lastRestore ? daysBetween(lastRestore, S.today) : null;

  // Days since last intimacy
  const lastPhysical = allEntries.filter(e => e.category === 'physical' && !e.solo).map(e => e.date).sort().pop();
  const daysSincePhysical = lastPhysical ? daysBetween(lastPhysical, S.today) : null;

  // This week counts
  const week7Bonding  = last7.filter(e => e.category === 'affection').length;
  const week7Physical = last7.filter(e => e.category === 'physical' && !e.solo).length;
  const week7Restore  = last7.filter(e => e.category === 'restore' && e.eventType !== RESTORE_NONE_TYPE).length;
  const week7Conflict = last7.filter(e => e.category === 'conflict').length;
  const week7Burnout  = last7.filter(e => e.category === 'burnout').length;
  const week7Wobble   = last7.filter(e => e.category === 'regulation').length;
  const conflictYest         = yestEs.some(e => e.category === 'conflict');
  const conflictYestResolved = yestEs.some(e => e.category === 'conflict' && ['resolved','breakthrough'].includes(e.resolution));
  const conflictToday        = todayEs.some(e => e.category === 'conflict');
  const repairToday          = todayEs.some(e => e.category === 'repair');
  const recentTurndowns      = allEntries.filter(e => e.category === 'turndown' && e.date >= addDays(S.today, -9) && e.date <= S.today).length;

  // Relational balance trend (7-day) — today-inclusive, matching score bar / gauge logic
  const decay = S.weights.decay || 0.05;
  let relBal7 = Math.round(last7.reduce((s, e) => {
    const dayEs = last7.filter(x => x.date === e.date);
    const cap = bankDayCap(dayEs.find(le => le.category === 'libido'));
    const dw = Math.pow(1 - decay, daysBetween(e.date, S.today));
    return s + bankScoreEntry(e, cap).score * dw;
  }, 0));

  // Personal balance 7-day
  let perBal7 = Math.round(last7.reduce((s, e) => {
    const dayEs = last7.filter(x => x.date === e.date);
    const cap = bankDayCap(dayEs.find(le => le.category === 'libido'));
    const dw = Math.pow(1 - decay, daysBetween(e.date, S.today));
    if (e.category === 'restore') { const t=S.restoreTypes.find(x=>(typeof x==='string'?x:x.name)===e.eventType); return s+restoreScore(e,t,cap)*dw; }
    if (e.category === 'regulation') return s + wobbleRestoreScore(e, cap)*dw;
    if (e.category === 'burnout')    return s + caretakerPersonalScore(e, cap)*dw;
    return s;
  }, 0));

  // Previous week scores (days -13 to -7) — aligned with today-inclusive window
  const prev7End   = addDays(S.today, -7);
  const prev7Start = addDays(S.today, -13);
  const prev7 = allEntries.filter(e => e.date >= prev7Start && e.date <= prev7End);
  let relBalPrev7 = prev7.length >= 2 ? Math.round(prev7.reduce((s, e) => {
    const dayEs = prev7.filter(x => x.date === e.date);
    const cap = bankDayCap(dayEs.find(le => le.category === 'libido'));
    const dw = Math.pow(1 - decay, daysBetween(e.date, prev7End));
    return s + bankScoreEntry(e, cap).score * dw;
  }, 0)) : null;
  let perBalPrev7 = prev7.length >= 2 ? Math.round(prev7.reduce((s, e) => {
    const dayEs = prev7.filter(x => x.date === e.date);
    const cap = bankDayCap(dayEs.find(le => le.category === 'libido'));
    const dw = Math.pow(1 - decay, daysBetween(e.date, prev7End));
    if (e.category === 'restore') { const t=S.restoreTypes.find(x=>(typeof x==='string'?x:x.name)===e.eventType); return s+restoreScore(e,t,cap)*dw; }
    if (e.category === 'regulation') return s + wobbleRestoreScore(e, cap)*dw;
    if (e.category === 'burnout')    return s + caretakerPersonalScore(e, cap)*dw;
    return s;
  }, 0)) : null;
  let tenorScorePrev7 = relBalPrev7 !== null && perBalPrev7 !== null
    ? Math.round((relBalPrev7 + perBalPrev7) / 2) : null;

  // Experimental override — replace today's and prev-period values with lifetime sums
  // (today's snapshot vs the snapshot from 7 days ago).
  if (S.useExperimentalScoring) {
    const expNow  = computeExperimentalScores(S.today);
    const expPrev = computeExperimentalScores(addDays(S.today, -7));
    relBal7 = Math.round(expNow.rel);
    perBal7 = Math.round(expNow.per);
    relBalPrev7    = Math.round(expPrev.rel);
    perBalPrev7    = Math.round(expPrev.per);
    tenorScorePrev7 = Math.round((expPrev.rel + expPrev.per) / 2);
  }

  const hasEnoughData = allEntries.length >= 3;
  const loggedMoodToday = todayEs.some(e => e.category === 'libido');

  // 7-day Tenor zone for greeting card
  const zones7 = getBounds(7);
  const tenorScore7 = hasEnoughData ? Math.round((relBal7 + perBal7) / 2) : null;
  const zoneBand7 = tenorScore7 === null ? null
    : tenorScore7 >= zones7.thriving ? { label:'Thriving',  color:'var(--c-partner)' }
    : tenorScore7 >= zones7.stable   ? { label:'Healthy',   color:'rgba(77,196,120,0.85)' }
    : tenorScore7 >= 0               ? { label:'Progressing',   color:'var(--c-burnout)' }
    : tenorScore7 >= zones7.strained ? { label:'Unsettled', color:'rgba(210,130,50,1)' }
    : tenorScore7 >= zones7.depleted ? { label:'Difficult', color:'var(--c-warning)' }
    :                                  { label:'Hurting',   color:'var(--c-conflict)' };
  const daySeed = (function() { const [y,m,d]=S.today.split('-').map(Number); const s=new Date(y,m-1,d); return Math.floor((s-new Date(y,0,0))/(1000*60*60*24)); })();
  const pick = (arr) => arr[daySeed % arr.length];
  const zoneLines = {
    none: ['Log a few more days and your tenor will appear here.'],
    Thriving: [
      'Connection is running strong right now.',
      'You\'re in a real high point — worth savouring.',
      'The data reflects what good stretches feel like.',
      'Everything is tracking well. Enjoy it.',
      'This is what thriving looks like in the numbers.',
    ],
    Healthy: [
      'Things are in a good place right now.',
      'Solid foundation showing.',
      'Not flashy, but real — this is what consistency looks like.',
      'Balance is showing up in the data.',
      'A steady stretch. That matters more than it seems.',
    ],
    Progressing: [
      "You're building momentum — keep showing up.",
      'Still finding your footing, and that\'s okay.',
      'Positive direction. Small steps still move the line.',
      'Moving forward, even if it doesn\'t feel dramatic.',
      'The trend is yours to shape.',
    ],
    Unsettled: [
      'Some friction showing. Awareness is the first step.',
      'A bumpy stretch — naming it is part of working through it.',
      'Not your best stretch, but you\'re still tracking.',
      'Things feel off. That\'s useful information.',
      'The tension is real. So is your capacity to navigate it.',
    ],
    Difficult: [
      'A hard stretch. Small intentional moments still count.',
      'The numbers reflect real weight right now.',
      'Difficult stretches happen. What you do next shapes the next one.',
      'Even one good moment can shift the trajectory.',
      'You\'re carrying a lot. Don\'t lose sight of what you can control.',
    ],
    Hurting: [
      'A tough stretch. Be gentle with yourself.',
      'The data shows strain — so does the effort it takes to keep going.',
      'Hard times are real. So is the possibility of things shifting.',
      'You\'re in a low point. That won\'t be the whole story.',
      'Even in difficult stretches, small acts of care leave a mark.',
    ],
  };
  const zoneNote = !zoneBand7 ? pick(zoneLines.none) : pick(zoneLines[zoneBand7.label] ?? zoneLines.none);

  const tenorDelta = tenorScore7 !== null && tenorScorePrev7 !== null ? tenorScore7 - tenorScorePrev7 : null;
  const trendNote = tenorDelta === null ? null
    : tenorDelta >= 15 ? '↑ Noticeably up from a week ago'
    : tenorDelta >= 5  ? '↑ Up from a week ago'
    : tenorDelta > -5  ? '→ Holding steady'
    : tenorDelta > -15 ? '↓ Down from a week ago'
    : '↓ Noticeably down from a week ago';

  // ── Tomorrow forecast (assumes nothing more logged today) ──
  // Tomorrow's window = [today-5, tomorrow], anchor = tomorrow, tomorrow has no entries.
  // So we re-score the same last7 entries minus the oldest day with tomorrow as anchor.
  const _fcAnchor  = addDays(S.today, 1);
  const _fcStart   = addDays(S.today, -5);
  const _fcEntries = allEntries.filter(e => e.date >= _fcStart && e.date <= S.today);
  let fcRel = Math.round(_fcEntries.reduce((s, e) => {
    const dayEs = _fcEntries.filter(x => x.date === e.date);
    const cap   = bankDayCap(dayEs.find(le => le.category === 'libido'));
    const dw    = Math.pow(1 - decay, daysBetween(e.date, _fcAnchor));
    return s + bankScoreEntry(e, cap).score * dw;
  }, 0));
  let fcPer = Math.round(_fcEntries.reduce((s, e) => {
    const dayEs = _fcEntries.filter(x => x.date === e.date);
    const cap   = bankDayCap(dayEs.find(le => le.category === 'libido'));
    const dw    = Math.pow(1 - decay, daysBetween(e.date, _fcAnchor));
    if (e.category === 'restore') { const t=S.restoreTypes.find(x=>(typeof x==='string'?x:x.name)===e.eventType); return s+restoreScore(e,t,cap)*dw; }
    if (e.category === 'regulation') return s + wobbleRestoreScore(e, cap) * dw;
    if (e.category === 'burnout')    return s + caretakerPersonalScore(e, cap) * dw;
    return s;
  }, 0));
  let fcTenor = Math.round((fcRel + fcPer) / 2);

  // Experimental override — forecast is the lifetime sum as of tomorrow (one more day of decay).
  if (S.useExperimentalScoring) {
    const expFc = computeExperimentalScores(_fcAnchor);
    fcRel   = Math.round(expFc.rel);
    fcPer   = Math.round(expFc.per);
    fcTenor = Math.round(expFc.tenor);
  }
  // Map each projected score to a weather icon based on its zone band
  const _zoneIcon = v =>
      v >= zones7.thriving  ? { icon:'☀️',  label:'Thriving',    color:'var(--c-partner)' }
    : v >= zones7.stable    ? { icon:'🌤️', label:'Healthy',     color:'rgba(77,196,120,0.85)' }
    : v >= 0                ? { icon:'⛅',  label:'Progressing', color:'var(--c-burnout)' }
    : v >= zones7.strained  ? { icon:'☁️',  label:'Unsettled',   color:'rgba(210,130,50,1)' }
    : v >= zones7.depleted  ? { icon:'🌧️', label:'Difficult',   color:'var(--c-warning)' }
    :                         { icon:'⛈️', label:'Hurting',     color:'var(--c-conflict)' };
  // Temperature-style change indicator: are we drifting warmer, holding steady, or cooler?
  // Thresholds are user-configurable in Config (fcTouch / fcWarm / fcMuch). The negative
  // side mirrors the positive — same magnitudes, just inverted.
  const fcTouch = S.weights.fcTouch ?? 1;
  const fcWarm  = S.weights.fcWarm  ?? 4;
  const fcMuch  = S.weights.fcMuch  ?? 8;
  const _tempDelta = (today, tomorrow) => {
    if (today == null || tomorrow == null) return null;
    const d = tomorrow - today;
    if (d >=  fcMuch)  return { arrow:'⇈', label:'much warmer',    color:'var(--c-partner)' };
    if (d >=  fcWarm)  return { arrow:'↑', label:'warmer',         color:'var(--c-partner)' };
    if (d >=  fcTouch) return { arrow:'↗', label:'a touch warmer', color:'rgba(77,196,120,0.85)' };
    if (d >  -fcTouch) return { arrow:'→', label:'about the same', color:'var(--muted)' };
    if (d >  -fcWarm)  return { arrow:'↘', label:'a touch cooler', color:'var(--c-warning)' };
    if (d >  -fcMuch)  return { arrow:'↓', label:'cooler',         color:'var(--c-conflict)' };
    return                    { arrow:'⇊', label:'much cooler',    color:'var(--c-conflict)' };
  };
  const forecast  = hasEnoughData ? [
    { name:'Relational', ..._zoneIcon(fcRel),   trend:_tempDelta(relBal7,    fcRel)   },
    { name:'Personal',   ..._zoneIcon(fcPer),   trend:_tempDelta(perBal7,    fcPer)   },
    { name:'Tenor',      ..._zoneIcon(fcTenor), trend:_tempDelta(tenorScore7, fcTenor) },
  ] : null;

  // ── Maintenance suggestion ─────────────────────────────
  // Only when: today is in a positive zone (Progressing/Healthy/Thriving)
  // AND tomorrow's tenor is cooler. We name what's about to roll off
  // and translate it back into entry-type language the user uses.
  let maintenanceSuggestion = null;
  if (forecast && tenorScore7 !== null && tenorScore7 >= 0) {
    const tenorTrend = forecast[2].trend?.label || '';
    const tenorCooling = tenorTrend === 'a touch cooler' || tenorTrend === 'cooler' || tenorTrend === 'much cooler';
    if (tenorCooling) {
      // What's about to roll off (oldest day in the current 7-day window)
      const rollDate    = addDays(S.today, -6);
      const rollEntries = allEntries.filter(e => e.date === rollDate);
      const rollCap     = bankDayCap(rollEntries.find(e => e.category === 'libido'));
      // Find the biggest positive deposit-type contributor rolling off
      let topCat = null, topScore = 0;
      for (const e of rollEntries) {
        let s = 0;
        if (e.category === 'affection') s = bankScoreEntry(e, rollCap).score;
        else if (e.category === 'physical' && !e.solo) s = bankScoreEntry(e, rollCap).score;
        else if (e.category === 'restore') {
          const t = S.restoreTypes.find(x => (typeof x==='string'?x:x.name) === e.eventType);
          s = restoreScore(e, t, rollCap);
        }
        if (s > topScore) { topScore = s; topCat = e.category; }
      }

      const relCooling = fcRel < relBal7;
      const perCooling = fcPer < perBal7;

      // Phrase by what's rolling off if we have a clear candidate;
      // otherwise lean on which dimension is cooling.
      const bondL = bondingLabel().toLowerCase();
      if (topCat === 'affection') {
        maintenanceSuggestion = `A ${bondL} moment today would help carry that warmth forward.`;
      } else if (topCat === 'physical') {
        maintenanceSuggestion = `An intimate moment today would help carry that warmth forward.`;
      } else if (topCat === 'restore') {
        maintenanceSuggestion = `Some restorative time today would help carry that warmth forward.`;
      } else if (relCooling && perCooling) {
        maintenanceSuggestion = `A ${bondL} moment or restorative break today would help hold this.`;
      } else if (relCooling) {
        maintenanceSuggestion = `A ${bondL} or intimate moment today would help hold the relational side.`;
      } else if (perCooling) {
        maintenanceSuggestion = `Some restorative time today would help hold the personal side.`;
      }
    }
  }

  // ── Build cards ──────────────────────────────────────

  const goInsights = () => { S.activeTab='insights'; render(); };
  const goInsightsMode = (mode) => { S.activeTab='insights'; if(mode) { S.gaugeMode=mode; saveSettings(); } render(); };

  const card = (icon, title, body, color='var(--text)', borderColor='var(--border)', bg='var(--bg2)', onclick=null) =>
    h('div',{style:{
      background:bg, border:'1px solid '+borderColor,
      borderRadius:'16px', padding:'14px 16px', marginBottom:'10px',
      display:'flex', gap:'12px', alignItems:'flex-start',
      cursor: onclick ? 'pointer' : 'default',
    },
    onclick: onclick || null,
    },
      h('span',{style:{fontSize:'22px',lineHeight:'1.3',flexShrink:'0'}}, icon),
      h('div',{style:{flex:'1',minWidth:'0'}},
        h('div',{style:{fontSize:'13px',fontWeight:'600',color:'var(--text)',marginBottom:'3px'}}, title),
        h('div',{style:{fontSize:'12px',color:'var(--muted)',lineHeight:'1.5'}},
          body,
          onclick ? h('span',{style:{marginLeft:'6px',fontSize:'11px',color:'var(--muted)',opacity:'0.6'}}, '→') : null
        )
      )
    );

  const nudges  = []; // suggestions
  const kudos   = []; // positive reinforcement

  // ── Daily check-in reminder ──
  if (!loggedMoodToday)
    nudges.push(h('div',{style:{
      background:'var(--bg2)', border:'1px solid var(--border)',
      borderRadius:'16px', padding:'14px 16px', marginBottom:'10px',
      display:'flex', gap:'12px', alignItems:'center',
    }},
      h('span',{style:{fontSize:'22px',lineHeight:'1.3',flexShrink:'0'}}, '🌡️'),
      h('div',{style:{flex:'1',minWidth:'0'}},
        h('div',{style:{fontSize:'13px',fontWeight:'600',color:'var(--text)',marginBottom:'2px'}}, 'Daily check-in'),
        h('div',{style:{fontSize:'12px',color:'var(--muted)'}}, 'Keeps your capacity score accurate')
      ),
      h('button',{
        style:{
          flexShrink:'0', padding:'7px 14px', borderRadius:'20px',
          border:'1px solid var(--border-mid)', background:'var(--bg3)',
          fontSize:'12px', fontWeight:'500', color:'var(--text)',
          cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
        },
        onclick:()=>openModal('libido')
      }, 'Log now')
    ));

  const relThresh = zones7.stable;
  const perThresh = Math.round(zones7.stable / 2);

  // ── Bonding nudges / kudos ──
  if (hasEnoughData) {
    if (week7Bonding >= 4)
      kudos.push(card('🩷', 'Strong '+bondingLabel().toLowerCase()+' week', week7Bonding+' '+bondingLabel().toLowerCase()+' entries this week — connection is getting real attention.', 'var(--c-affection)', 'rgba(224,133,184,0.25)', 'rgba(224,133,184,0.06)', goInsights));
    else if (week7Bonding >= 1)
      kudos.push(card('🩷', bondingLabel()+' showing up', week7Bonding+' '+bondingLabel().toLowerCase()+' entr'+(week7Bonding===1?'y':'ies')+' this week. The effort is visible in the data.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (daysSinceBonding !== null && daysSinceBonding >= 7)
      nudges.push(card('🩷', bondingLabel()+' gap — '+daysSinceBonding+' days', 'It\'s been a while since a '+bondingLabel().toLowerCase()+' entry. Even something small counts.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
  }

  // ── Intimacy nudges / kudos ──
  if (S.showPhysical && hasEnoughData) {
    if (week7Physical >= 3)
      kudos.push(card('🌹', 'Intimate week', week7Physical+' shared intimacy events this week — above your usual pace.', 'var(--c-physical)', 'rgba(224,122,74,0.25)', 'rgba(224,122,74,0.06)', goInsights));
    else if (daysSincePhysical !== null && daysSincePhysical >= 10 && recentTurndowns === 0) {
      const msg = week7Conflict >= 1
        ? daysSincePhysical+' days since last intimacy, and conflict logged this week — the two can compound each other.'
        : daysSincePhysical+' days since last intimacy. Worth being aware of.';
      nudges.push(card('🌹', daysSincePhysical+'d since last intimacy', msg, 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    }
  }

  // ── Restorative ──
  if (hasEnoughData) {
    if (week7Restore >= 2)
      kudos.push(card('🌊', 'Restoring well', week7Restore+' restorative activities this week. Your personal tank is getting attention.', 'var(--c-restore)', 'rgba(90,184,212,0.25)', 'rgba(90,184,212,0.06)', goInsights));
    else if (week7Restore === 1)
      kudos.push(card('🌊', 'Restorative activity logged', 'One this week — a step in the right direction.', 'var(--c-restore)', 'rgba(90,184,212,0.20)', 'rgba(90,184,212,0.04)', goInsights));
    else if (daysSinceRestore !== null && daysSinceRestore >= 5 && (week7Wobble > 0 || week7Burnout > 0))
      nudges.push(card('🌊', 'Restore overdue', 'Wobble or steadying logged recently, but no restorative activity in '+daysSinceRestore+' days. Your tank may need attention.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (daysSinceRestore !== null && daysSinceRestore >= 7)
      nudges.push(card('🌊', daysSinceRestore+' days since last restorative', 'A good week for something that refills you.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
  }

  // ── Conflict ──
  if (hasEnoughData) {
    if (conflictToday && week7Bonding === 0)
      nudges.push(card('⚡', 'Conflict logged today', 'No '+bondingLabel().toLowerCase()+' this week to balance it. Even a small connection moment can help.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (conflictYest && !conflictToday && !conflictYestResolved)
      nudges.push(card('💬', 'Yesterday had conflict', 'Still landing? Logging a '+bondingLabel().toLowerCase()+' or restore entry today can be a useful signal.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (week7Conflict >= 3)
      nudges.push(card('⚡', week7Conflict+' conflicts this week', 'A heavy week. If things feel stuck, that\'s worth naming — to yourself or your partner.', 'var(--c-conflict)', 'rgba(224,53,53,0.18)', 'rgba(224,53,53,0.05)', goInsights));
    else if (week7Conflict === 0 && last14.filter(e=>e.category==='conflict').length === 0 && allEntries.filter(e=>e.category==='conflict').length > 0)
      kudos.push(card('✨', 'Two weeks conflict-free', 'No conflict logged in 14 days. Worth noticing.', 'var(--c-partner)', 'rgba(77,196,120,0.25)', 'rgba(77,196,120,0.06)', goInsights));
  }

  // ── Repair ──
  if (S.showRepair && hasEnoughData && repairToday)
    kudos.push(card('🤝', 'Repair logged today', 'Working through a rupture takes effort. That shows up in the data.', 'var(--c-partner)', 'rgba(77,196,120,0.20)', 'rgba(77,196,120,0.05)', goInsights));

  // ── Overall balance ──
  if (hasEnoughData) {
    if (relBal7 >= relThresh)
      kudos.push(card('💚', 'Relational balance positive', '7-day balance at +'+relBal7+'. Deposits are outpacing withdrawals this week.', 'var(--c-partner)', 'rgba(77,196,120,0.25)', 'rgba(77,196,120,0.06)', ()=>goInsightsMode('relational')));
    else if (relBal7 < -relThresh)
      nudges.push(card('📉', 'Balance running low', '7-day relational balance at '+relBal7+'. More withdrawals than deposits recently — worth some intentional connection.', 'var(--text)', 'var(--border)', 'var(--bg2)', ()=>goInsightsMode('relational')));

    if (perBal7 >= perThresh)
      kudos.push(card('🌿', 'Personal tank healthy', 'Restore is outpacing drain this week. That matters.', 'var(--c-restore)', 'rgba(90,184,212,0.25)', 'rgba(90,184,212,0.06)', ()=>goInsightsMode('personal')));
    else if (perBal7 < -perThresh && week7Restore === 0)
      nudges.push(card('🪫', 'Personal tank depleted', 'Wobble or steadying load without restorative activity. Something needs to give.', 'var(--text)', 'var(--border)', 'var(--bg2)', ()=>goInsightsMode('personal')));
  }

  // ── Steady / wellbeing ──
  if (S.showCaretaker && hasEnoughData) {
    if (week7Burnout >= 4 && week7Restore === 0)
      nudges.push(card('🕯️', 'Heavy steadying load', week7Burnout+' steadying entries this week with no restore. Make sure your own needs aren\'t getting crowded out.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (week7Burnout >= 2 && week7Restore >= 1)
      kudos.push(card('🕯️', 'Caretaking with self-care', 'Steadying for others and restoring yourself this week. That balance matters.', 'var(--c-restore)', 'rgba(90,184,212,0.20)', 'rgba(90,184,212,0.04)', goInsights));
  }

  // ── New user ──
  if (!hasEnoughData)
    nudges.push(card('👋', 'Getting started', 'Log a few days and this page will start showing you patterns, nudges, and encouragement based on your data.'));

  const section = (items) => items.length > 0 ? h('div',{}, ...items) : null;

  // ── Quick-log chips ──
  const todayLoggedKeys = new Set(todayEs.map(e => e.category));
  const todayMoodEntry  = todayEs.find(e => e.category === 'libido');

  const quickRows = [
    [
      { icon:'🌡️', label:'Check-In',     key:'libido',    show: true },
      { icon:'🌿', label:'Notes',         key:'notes',     show: true },
      { icon:'🩷', label:bondingLabel(),  key:'affection', show: true },
    ],
    [
      { icon:'🌒', label:'Turn Down', key:'turndown', show: S.showPhysical },
      { icon:'🌹', label:'Intimacy',  key:'physical', show: S.showPhysical },
      { icon:'🌊', label:'Restore',   key:'restore',  show: true },
    ],
    [
      { icon:'🫧', label:'Wobble', key:'regulation', show: S.showRegulation },
      { icon:'🕯️', label:'Steady', key:'burnout',   show: S.showCaretaker },
      { icon:'⚡', label:'Conflict', key:'conflict', show: true },
    ],
    [
      { icon:'🤝', label:'Repair', key:'repair', show: S.showRepair },
    ],
  ].map(row => row.filter(c => c.show)).filter(row => row.length > 0);

  return h('div',{class:'insights-panel'},

    // Greeting + quick-log
    h('div',{style:{paddingTop:'8px',paddingBottom:'14px',borderBottom:'1px solid var(--border)',marginBottom:'14px'}},
      h('div',{style:{fontSize:'13px',color:'var(--muted)',marginBottom:'3px'}}, greeting),
      h('div',{style:{fontSize:'20px',fontFamily:"'Libre Baskerville',serif",fontWeight:'400',color:'var(--text)',marginBottom:'12px'}}, todayFmt),
      // Tenor greeting card
      h('div',{style:{
        background:'var(--bg2)', border:'1px solid var(--border)',
        borderRadius:'14px', padding:'14px 16px', marginBottom:'14px',
      }},
        h('div',{style:{fontSize:'10px',fontWeight:'600',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'4px'}},
          'The tenor of your life this week'),
        h('div',{style:{fontFamily:"'Libre Baskerville',serif",fontSize:'28px',fontWeight:'400',color:zoneBand7?.color ?? 'var(--muted)',lineHeight:'1',marginBottom:'6px'}},
          zoneBand7 ? zoneBand7.label : '—'),
        h('div',{style:{fontSize:'12px',color:'var(--muted)',lineHeight:'1.5'}}, zoneNote),
        forecast ? h('div',{style:{
          marginTop:'10px', paddingTop:'10px',
          borderTop:'1px solid var(--surface-2)',
        }},
          h('div',{style:{marginBottom:'8px'}},
            h('span',{style:{fontSize:'10px',fontWeight:'600',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)'}}, 'Tomorrow\'s forecast')
          ),
          h('div',{style:{display:'flex',gap:'6px'}},
            ...forecast.map(f => h('div',{style:{flex:'1',textAlign:'center'}},
              h('div',{style:{fontSize:'9px',fontWeight:'600',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'3px'}}, f.name),
              h('div',{style:{fontSize:'22px',lineHeight:'1',marginBottom:'2px'}}, f.icon),
              h('div',{style:{fontSize:'10px',color:f.color,fontWeight:'500'}}, f.label),
              f.trend ? h('div',{style:{fontSize:'10px',color:f.trend.color,marginTop:'3px',letterSpacing:'0.02em'}},
                f.trend.arrow+' '+f.trend.label
              ) : null
            ))
          )
        ) : null,
      ),
      // Debug panel — numbers behind the tenor card
      S.showDebug && hasEnoughData ? (() => {
        const fmt = n => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1));
        const row = (label, today, tomorrow) => h('div',{style:{
          display:'flex', justifyContent:'space-between', padding:'4px 0',
          borderBottom:'1px solid var(--surface-2)', fontSize:'11px',
        }},
          h('span',{style:{color:'var(--muted)'}}, label),
          h('span',{style:{display:'flex', gap:'16px'}},
            h('span',{style:{color:'var(--text-strong)', fontFamily:"'Libre Baskerville',serif", minWidth:'52px', textAlign:'right'}}, fmt(today)),
            h('span',{style:{color:'var(--muted)', minWidth:'52px', textAlign:'right'}}, fmt(tomorrow))
          )
        );
        return h('div',{style:{
          marginBottom:'14px', padding:'10px 12px', borderRadius:'10px',
          background:'var(--surface-1)', border:'1px solid var(--surface-2)',
          fontSize:'11px', fontFamily:"'DM Sans',sans-serif",
        }},
          h('div',{style:{fontWeight:'600',color:'var(--text-strong)',marginBottom:'8px',fontSize:'11px',letterSpacing:'0.06em',textTransform:'uppercase'}},
            'Tenor card · debug'),
          h('div',{style:{display:'flex', justifyContent:'space-between', fontSize:'10px', color:'var(--muted)', letterSpacing:'0.04em', marginBottom:'4px'}},
            h('span',{}, ''),
            h('span',{style:{display:'flex', gap:'16px'}},
              h('span',{style:{minWidth:'52px', textAlign:'right'}}, 'today'),
              h('span',{style:{minWidth:'52px', textAlign:'right'}}, 'tomorrow')
            )
          ),
          row('Relational', relBal7, fcRel),
          row('Personal',   perBal7, fcPer),
          row('Tenor',      tenorScore7, fcTenor),
          h('div',{style:{marginTop:'8px',paddingTop:'8px',borderTop:'1px solid var(--surface-2)',fontSize:'10px',color:'var(--muted)',lineHeight:'1.5'}},
            'Zones (7d): thriving ≥ '+zones7.thriving+' · healthy ≥ '+zones7.stable+' · progressing ≥ 0 · unsettled ≥ '+zones7.strained+' · difficult ≥ '+zones7.depleted+' · hurting < '+zones7.depleted
          ),
          (() => {
            const tenorTrend = forecast?.[2]?.trend?.label || '(no forecast)';
            const positive   = tenorScore7 != null && tenorScore7 >= 0;
            const cooling    = ['a touch cooler','cooler','much cooler'].includes(tenorTrend);
            return h('div',{style:{marginTop:'6px',paddingTop:'6px',borderTop:'1px solid var(--surface-2)',fontSize:'10px',color:'var(--muted)',lineHeight:'1.6'}},
              h('div',{}, 'Suggestion gate:'),
              h('div',{}, '  · Tenor trend: '+tenorTrend+(cooling ? ' ✓ (cooling)' : ' ✗ (not cooling)')),
              h('div',{}, '  · Today positive: '+(positive ? '✓ ('+tenorScore7+' ≥ 0)' : '✗ ('+tenorScore7+' < 0)')),
              h('div',{}, '  · Suggestion: '+(maintenanceSuggestion || '(none — gate not met)')),
            );
          })(),
        );
      })() : null,
      // Quick-log chips — each row is its own flex container so vertical spacing
      // between rows is fully controlled (gap of 6px) regardless of wrap behavior.
      h('div',{style:{display:'flex',flexDirection:'column',gap:'6px'}},
        ...quickRows.map(row => h('div',{style:{display:'flex',flexWrap:'wrap',gap:'8px'}},
          ...row.map(q => {
            const isMoodLogged = q.key === 'libido' && todayMoodEntry;
            const logged = isMoodLogged;
            return h('button',{
              style:{
                display:'flex', alignItems:'center', gap:'6px',
                padding:'8px 14px', borderRadius:'20px',
                border: logged ? '1px solid var(--border-mid)' : '1px solid var(--border)',
                background: logged ? 'var(--bg3)' : 'var(--bg2)',
                fontSize:'13px', color: logged ? 'var(--muted)' : 'var(--text)',
                cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              },
              onclick:()=>{
                if (isMoodLogged) { editEntry(todayMoodEntry); }
                else { openModal(q.key); }
              }
            },
              h('span',{}, logged ? '✓' : q.icon),
              h('span',{}, q.label)
            );
          })
        ))
      )
    ),

    // Nudges
    nudges.length > 0 ? h('div',{style:{marginBottom:'6px'}},
      h('div',{style:{fontSize:'11px',fontWeight:'600',color:'var(--muted)',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:'10px'}}, 'Today'),
      section(nudges)
    ) : null,

    // Kudos
    kudos.length > 0 ? h('div',{style:{marginBottom:'6px'}},
      h('div',{style:{fontSize:'11px',fontWeight:'600',color:'var(--muted)',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:'10px'}}, 'What\'s going well'),
      section(kudos)
    ) : null,

    // Nothing to show
    nudges.length === 0 && kudos.length === 0 ?
      h('div',{style:{textAlign:'center',padding:'32px 20px',color:'var(--muted)',fontSize:'13px',lineHeight:'1.7'}},
        'All quiet today.',h('br',{}),'Keep logging and insights will appear here.'
      ) : null,

    // Today's log
    h('div',{style:{marginTop:'20px',paddingTop:'16px',borderTop:'1px solid var(--border)'}},
      h('div',{style:{fontSize:'11px',fontWeight:'600',color:'var(--muted)',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:'10px'}}, "Today's log"),
      (() => {
        const todayEntries = S.allEntries
          .filter(e => {
            if (e.date !== S.today) return false;
            if (!S.showCaretaker  && e.category === 'burnout')     return false;
            if (!S.showRegulation && e.category === 'regulation')  return false;
            if (!S.showPhysical   && e.category === 'physical')    return false;
            if (!S.showRepair     && e.category === 'repair')      return false;
            return !S.calFilters.has(e.category);
          })
          .sort((a,b) => {
            const CAT_ORDER = ['libido','affection','physical','restore','regulation','burnout','conflict','turndown','repair','notes'];
            const ai = CAT_ORDER.indexOf(a.category), bi = CAT_ORDER.indexOf(b.category);
            return ai !== bi ? ai - bi : (a.eventType||a.category).localeCompare(b.eventType||b.category);
          });
        if (todayEntries.length === 0)
          return h('div',{style:{
            padding:'16px',textAlign:'center',background:'var(--bg2)',
            borderRadius:'14px',border:'1px solid var(--border)',
            fontSize:'13px',color:'var(--muted)',lineHeight:'1.6'
          }}, 'Nothing logged yet today.');
        return h('div',{}, ...todayEntries.map(buildCard));
      })()
    ),

  );
}

function buildInsightsPanel() {
  const winEntries = getWindowEntries();
  const prevEntries = getPrevWindowEntries();
  // In experimental mode the window selector is hidden — pin observation labels to 7 days.
  const w = S.useExperimentalScoring ? 7 : Number(S.loveBankWindow);

  // ── Frequency stats ──
  const physical  = winEntries.filter(e=>e.category==='physical'&&!e.solo);
  const solo      = winEntries.filter(e=>e.category==='physical'&&e.solo);
  const affection = winEntries.filter(e=>e.category==='affection');
  const conflict  = winEntries.filter(e=>e.category==='conflict');
  const turndown  = winEntries.filter(e=>e.category==='turndown');
  const burnout   = winEntries.filter(e=>e.category==='burnout');
  const restore   = winEntries.filter(e=>e.category==='restore');
  const regulation= winEntries.filter(e=>e.category==='regulation');

  const prevPhysical  = prevEntries.filter(e=>e.category==='physical'&&!e.solo);
  const prevAffection = prevEntries.filter(e=>e.category==='affection');
  const prevConflict  = prevEntries.filter(e=>e.category==='conflict');
  const prevBurnout   = prevEntries.filter(e=>e.category==='burnout');
  const prevRestore   = prevEntries.filter(e=>e.category==='restore');
  const prevTurndown  = prevEntries.filter(e=>e.category==='turndown');

  const totalDays = w;
  const prevDays  = w;

  // Positive trend: up = good (green), down = bad (red)
  const freqTrend = (curr, prev) => {
    if (!prevDays || prev === undefined) return null;
    const r1 = curr / totalDays * 30;
    const r2 = prev / prevDays * 30;
    return trendLabel(r1, r2);
  };

  // Negative trend: down = good (green), up = bad (red)
  const negTrend = (curr, prev) => {
    if (!prevDays || prev === undefined) return null;
    const r1 = curr / totalDays * 30;
    const r2 = prev / prevDays * 30;
    const diff = r1 - r2;
    if (Math.abs(diff) < 0.5) return {cls:'trend-flat', text:'→ Stable'};
    if (diff < 0) return {cls:'trend-up', text:'↓ Down from prior period'};   // down is good, show green
    return {cls:'trend-dn', text:'↑ Up from prior period'};                    // up is bad, show red
  };

  // Point-based load trend
  const loadTrendConflict = (currEntries, prevEntriesArr) => {
    if (!prevDays) return null;
    const r1 = currEntries.reduce((s,e)=>s+bankConfLoad(e),0) / totalDays * 30;
    const r2 = prevEntriesArr.reduce((s,e)=>s+bankConfLoad(e),0) / prevDays * 30;
    const diff = r1 - r2;
    if (Math.abs(diff) < 2) return {cls:'trend-flat', text:'→ Stable'};
    if (diff < 0) return {cls:'trend-up', text:'↓ Load down'};
    return {cls:'trend-dn', text:'↑ Load up'};
  };
  const loadTrendBurnout = (currEntries, prevEntriesArr) => {
    if (!prevDays) return null;
    const r1 = currEntries.reduce((s,e)=>s+burnoutLoadEntry(e),0) / totalDays * 30;
    const r2 = prevEntriesArr.reduce((s,e)=>s+burnoutLoadEntry(e),0) / prevDays * 30;
    const diff = r1 - r2;
    if (Math.abs(diff) < 2) return {cls:'trend-flat', text:'→ Stable'};
    if (diff < 0) return {cls:'trend-up', text:'↓ Load down'};
    return {cls:'trend-dn', text:'↑ Load up'};
  };

  const physTrend     = freqTrend(physical.length,  prevPhysical.length);
  const affTrend      = freqTrend(affection.length, prevAffection.length);
  const conflictTrend = negTrend(conflict.length,   prevConflict.length);
  const burnoutTrend  = negTrend(burnout.length,    prevBurnout.length);
  const restoreTrend  = freqTrend(restore.length,   prevRestore.length);
  const turndownTrend = negTrend(turndown.length,   prevTurndown.length);
  const conflictLoadTrend = loadTrendConflict(conflict, prevConflict);
  const burnoutLoadTrend  = loadTrendBurnout(burnout, prevBurnout);

  // ── Weekly bar data ──
  const weeks = groupByWeek(winEntries, w);

  // ── Libido line data ──
  const libiEntries = winEntries.filter(e=>e.category==='libido').sort((a,b)=>a.date.localeCompare(b.date));

  // Keep raw values for separate-scale sparklines
  const libiPoints = libiEntries.slice(-30).map(e=>({
    libi:      e.libiLevel ?? null,
    moodRaw:   e.mood   ?? null,
    energyRaw: e.energy ?? null,
  }));

  // Avg libido
  const avgLibido  = avg(libiEntries.map(e=>e.libiLevel));
  const prevLibido = avg(prevEntries.filter(e=>e.category==='libido').map(e=>e.libiLevel));
  const libiTrend  = trendLabel(avgLibido, prevLibido);

  // ── Correlations — use full history so sample sizes are meaningful ──
  const correlations = computeCorrelations(calcEntries());

  // Empty state check
  const hasData = winEntries.length > 0;

  const strengthBadge = s => {
    const cls = s==='strong'?'corr-strong':s==='moderate'?'corr-moderate':s==='weak'?'corr-weak':'corr-none';
    const label = s==='strong'?'Strong pattern':s==='moderate'?'Moderate pattern':'Weak / unclear';
    return h('span',{class:'corr-badge '+cls}, label);
  };

  return h('div',{class:'insights-panel'},
    (() => { try { return buildLoveBankPanel(); } catch(e) { console.error('Balance widget error:', e); return null; } })(),
    // ── Observations (always visible — threshold-based weekly observations) ──
    // Threshold alerts surfaced as cards, mirroring the visual style of
    // Correlations below but without strength badges (these aren't statistical).
    (() => {
      const wLabel = w===7?'Last 7 days':w===30?'Last 30 days':'Last 60 days';
      const pRef   = w===7?'this week':w===30?'this month':'in this window';
      const pRefCap= w===7?'This week':w===30?'This month':'This window';
      return h('div',{style:{marginBottom:'14px'}},
        h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Observations')),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'10px',lineHeight:'1.6'}},
          'Notable signals from this window — thresholds crossed, conditions aligned.'
        ),
        buildWindowSummary(winEntries, prevEntries, wLabel, pRef, pRefCap, S.today, 'observationCards')
      );
    })(),

    !hasData ? h('div',{class:'ins-empty',style:{marginTop:'40px'}},
      'No entries in this window yet.\nStart logging to see patterns emerge.'
    ) : h('div',{},

      /* ── Correlations (cross-event statistical patterns) ── */
      (() => {
        const physicalIcons = ['🌹','🌒'];
        const strengthRank = {strong:0, moderate:1, weak:2};
        const allCards = (S.showPhysical
          ? correlations
          : correlations.filter(c => !physicalIcons.some(icon => c.icon.includes(icon))))
          .slice().sort((a, b) => (strengthRank[a.strength] ?? 2) - (strengthRank[b.strength] ?? 2));
        const positiveIcons = ['🩷→🌹','🌹→🩷','🩷→🌹★','🌿✓→🕯️','🕯️💬→🌡️','🌊→🌡️','🌊→🕯️','🌸→🩷','🧭→🩷','🌸🧭→🌹','🩷🌹↔','🧭🩺→🩷','🌸→🌹+1','🧭🛡→🧭❤','🌸🩺→🌹','🌸🧭→🩷★'];
        const isPositive = c => positiveIcons.some(icon => c.icon.startsWith(icon));
        if (allCards.length === 0) return h('div',{style:{marginBottom:'14px'}},
          h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Correlations')),
          h('div',{class:'ins-empty'},'Not enough data yet.\nKeep logging — correlations appear once you have 3+ relevant events.')
        );
        return h('div',{style:{marginBottom:'14px'}},
          h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Correlations')),
          h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'10px',lineHeight:'1.6'}},
            'Cross-event patterns from your data. Small samples are hints, not conclusions.'
          ),
          h('div',{},
            ...allCards.map(c => {
              const pos = isPositive(c);
              const strengthDot = c.lowData ? 'var(--muted-3)'
                : c.strength==='strong' ? 'var(--c-physical)'
                : c.strength==='moderate' ? 'var(--c-burnout)'
                : 'var(--muted-3)';
              return h('div',{style:{
                background:'var(--bg2)',
                border:'1px solid '+(pos?'var(--c-partner-subtle)':'var(--border)'),
                borderRadius:'12px', padding:'10px 12px', marginBottom:'6px',
                display:'flex', gap:'10px', alignItems:'flex-start'
              }},
                h('span',{style:{fontSize:'18px',flexShrink:'0',lineHeight:'1.4'}}, c.icon),
                h('div',{style:{flex:'1',minWidth:'0'}},
                  h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'3px'}},
                    h('span',{style:{fontSize:'13px',fontFamily:"'Libre Baskerville',serif",color:'var(--text)'}}, c.title),
                    h('div',{style:{display:'flex',alignItems:'center',gap:'4px',flexShrink:'0'}},
                      h('div',{style:{width:'6px',height:'6px',borderRadius:'50%',background:strengthDot}}),
                      h('span',{style:{fontSize:'10px',color:'var(--muted)'}},
                        (c.lowData ? 'Low data' : c.strength==='strong' ? 'Strong' : c.strength==='moderate' ? 'Moderate' : 'Weak')
                        + ' · n='+c.n)
                    )
                  ),
                  h('div',{style:{fontSize:'12px',color:'var(--muted)',lineHeight:'1.5'}}, c.desc)
                )
              );
            })
          )
        );
      })(),

      /* ── Detailed metrics collapsible — collapsed by default ── */
      buildLensCollapsible({
        stateKey: 'insightsMetricsExpanded',
        title: 'All metrics',
        subtitleOpen: 'Frequency, intimacy, '+bondingLabel().toLowerCase()+', restorative, wobble, turn-downs, mood and load',
        subtitleClosed: 'Frequency, intimacy, '+bondingLabel().toLowerCase()+', restorative, wobble, turn-downs, mood and load',
        body: h('div',{},

      // ── Three high-level synthesis cards (Connection / Load / Positive Development) ──
      // Moved here from the Last 30 days collapsible so all data lives together
      (() => {
        const wLabel = w===7?'Last 7 days':w===30?'Last 30 days':'Last 60 days';
        const pRef   = w===7?'this week':w===30?'this month':'in this window';
        const pRefCap= w===7?'This week':w===30?'This month':'This window';
        return buildWindowSummary(winEntries, prevEntries, wLabel, pRef, pRefCap, S.today, 'cardsOnly');
      })(),

      /* ── Frequency ── */
      h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Frequency')),
      h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}},

        // ── Withdrawals column ──
        h('div',{style:{background:'var(--bg2)',border:'1px solid var(--c-conflict-border)',borderRadius:'14px',padding:'12px'}},
          h('div',{style:{fontSize:'10px',letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--c-warning)',marginBottom:'10px',fontWeight:'500'}},'Withdrawals'),
          // Conflict
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
            h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'⚡ Conflict'),
            h('div',{style:{textAlign:'right'}},
              h('span',{style:{fontSize:'16px',color:CAT_COLORS.conflict,fontFamily:"'Libre Baskerville',serif"}}, conflict.length),
              conflictTrend ? h('span',{style:{fontSize:'10px',marginLeft:'4px'},class:conflictTrend.cls}, conflictTrend.text.split(' ')[0]) : null
            )
          ),
          // Turn downs
          S.showPhysical ? h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
            h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'🌒 Turn downs'),
            h('div',{style:{textAlign:'right'}},
              h('span',{style:{fontSize:'16px',color:CAT_COLORS.turndown,fontFamily:"'Libre Baskerville',serif"}}, turndown.length),
              turndownTrend ? h('span',{style:{fontSize:'10px',marginLeft:'4px'},class:turndownTrend.cls}, turndownTrend.text.split(' ')[0]) : null
            )
          ) : null
        ),

        // ── Deposits column ──
        h('div',{style:{background:'var(--bg2)',border:'1px solid var(--c-partner-subtle)',borderRadius:'14px',padding:'12px'}},
          h('div',{style:{fontSize:'10px',letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--c-partner)',marginBottom:'10px',fontWeight:'500'}},'Deposits'),
          // Shared physical
          S.showPhysical ? h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
            h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'🌹 Intimacy'),
            h('div',{style:{textAlign:'right'}},
              h('span',{style:{fontSize:'16px',color:CAT_COLORS.physical,fontFamily:"'Libre Baskerville',serif"}}, physical.length),
              physTrend ? h('span',{style:{fontSize:'10px',marginLeft:'4px'},class:physTrend.cls}, physTrend.text.split(' ')[0]) : null
            )
          ) : null,
          // Bonding
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
            h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'🩷 '+bondingLabel()),
            h('div',{style:{textAlign:'right'}},
              h('span',{style:{fontSize:'16px',color:CAT_COLORS.affection,fontFamily:"'Libre Baskerville',serif"}}, affection.length),
              affTrend ? h('span',{style:{fontSize:'10px',marginLeft:'4px'},class:affTrend.cls}, affTrend.text.split(' ')[0]) : null
            )
          ),
          // Restorative
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
            h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'🌊 Restorative'),
            h('div',{style:{textAlign:'right'}},
              h('span',{style:{fontSize:'16px',color:CAT_COLORS.restore,fontFamily:"'Libre Baskerville',serif"}}, restore.length),
              restoreTrend ? h('span',{style:{fontSize:'10px',marginLeft:'4px'},class:restoreTrend.cls}, restoreTrend.text.split(' ')[0]) : null
            )
          ),
        )
      ),

      // ── Personal Load ──
      (S.showCaretaker && burnout.length > 0) || (S.showRegulation && regulation.length > 0) ? h('div',{style:{
        background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px',
        padding:'12px', marginBottom:'10px',
      }},
        h('div',{style:{fontSize:'10px',letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'10px',fontWeight:'500'}},'Personal Load'),
        S.showCaretaker && burnout.length > 0 ? h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'🕯️ Steadying'),
          h('div',{style:{textAlign:'right'}},
            h('span',{style:{fontSize:'16px',color:CAT_COLORS.burnout,fontFamily:"'Libre Baskerville',serif"}}, burnout.length),
            burnoutTrend ? h('span',{style:{fontSize:'10px',marginLeft:'4px'},class:burnoutTrend.cls}, burnoutTrend.text.split(' ')[0]) : null
          )
        ) : null,
        S.showRegulation && regulation.length > 0 ? h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
          h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'🫧 Life Wobble'),
          h('div',{style:{textAlign:'right'}},
            h('span',{style:{fontSize:'16px',color:CAT_COLORS.regulation,fontFamily:"'Libre Baskerville',serif"}}, regulation.length),
            h('div',{style:{fontSize:'10px',color:'var(--muted)',marginTop:'2px'}},
              (() => {
                const rel = regulation.filter(e=>e.regulationTrigger==='relational').length;
                const parts = [];
                if (rel > 0) parts.push(rel+' conflict-linked');
                if (regulation.length - rel > 0) parts.push((regulation.length-rel)+' personal');
                return parts.join(' · ') || null;
              })()
            )
          )
        ) : null
      ) : null,

      // Solo physical — small note below the two columns
      S.showPhysical && physical.length + solo.length > 0 ? h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'10px',paddingLeft:'2px'}},
        '🌹 Solo intimacy: '+solo.length+(physical.length > 0 ? ' · '+Math.round(solo.length/(solo.length+physical.length)*100)+'% of all' : '')
      ) : null,

      /* ── Connection quality ── */
      (physical.length > 0 || affection.length > 0) ? h('div',{},
        h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Connection quality')),
        h('div',{style:{background:'var(--bg2)',border:'1px solid rgba(77,196,120,0.15)',borderRadius:'14px',padding:'12px',marginBottom:'10px'}},

          // Bonding : physical ratio
          S.showPhysical && physical.length > 0 && affection.length > 0 ? h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
            h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'🩷 '+bondingLabel()+' : 🌹 Intimacy'),
            h('div',{style:{textAlign:'right'}},
              h('span',{style:{fontSize:'16px',color:CAT_COLORS.affection,fontFamily:"'Libre Baskerville',serif"}}, affection.length+':'+physical.length),
              h('span',{style:{fontSize:'11px',color:'var(--muted)',marginLeft:'6px'}},
                affection.length / Math.max(physical.length,1) >= 2 ? 'connection-first'
                : affection.length / Math.max(physical.length,1) >= 1 ? 'balanced'
                : 'more direct')
            )
          ) : null,

          // Avg bonding quality
          affection.length > 0 ? h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
            h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'🩷 Avg '+bondingLabel().toLowerCase()+' quality'),
            h('span',{style:{fontSize:'16px',color:CAT_COLORS.affection,fontFamily:"'Libre Baskerville',serif"}},
              (() => {
                const avgQ = avg(affection.filter(e=>e.connectionQuality).map(e=>e.connectionQuality));
                if (!avgQ) return '—';
                return avgQ >= 4.5?'Meaningful':avgQ >= 3.5?'Connected':avgQ >= 2.5?'Warm':avgQ >= 1.5?'Routine':'Missed';
              })()
            )
          ) : null,

          // Avg physical connection quality
          S.showPhysical && physical.length > 0 ? h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0'}},
            h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'🌹 Avg intimacy quality'),
            h('span',{style:{fontSize:'16px',color:CAT_COLORS.physical,fontFamily:"'Libre Baskerville',serif"}},
              (() => {
                const avgQ = avg(physical.filter(e=>e.connectionQuality).map(e=>e.connectionQuality));
                if (avgQ === null) return '—';
                const lbl = avgQ>=4.5?'Peak':avgQ>=3.5?'Meaningful':avgQ>=2.5?'Warm':avgQ>=1.5?'Routine':'Missed';
                return avgQ.toFixed(1)+' · '+lbl;
              })()
            )
          ) : null
        )
      ) : null,

      /* ── Solo vs shared ── */
      (() => {
        const allPhysical = winEntries.filter(e=>e.category==='physical'&&!e.solo);
        const allSolo     = winEntries.filter(e=>e.category==='physical'&&e.solo);
        return S.showPhysical && allPhysical.length + allSolo.length >= 3;
      })() ? h('div',{},
        h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Intimacy')),
        h('div',{class:'stat-row-3'},
          // Shared count + avg connection quality
          h('div',{class:'stat-card'},
            h('div',{class:'stat-value',style:{color:CAT_COLORS.physical,fontSize:'22px'}}, physical.length),
            h('div',{class:'stat-label'},'Shared'),
            (() => {
              const avgQ = avg(physical.filter(e=>e.connectionQuality).map(e=>e.connectionQuality));
              const lbl = avgQ===null?'No ratings yet':avgQ>=4.5?'Peak':avgQ>=3.5?'Meaningful':avgQ>=2.5?'Warm':avgQ>=1.5?'Routine':'Missed';
              return h('div',{class:'stat-sub'}, avgQ!==null ? avgQ.toFixed(1)+' · '+lbl : lbl);
            })()
          ),
          // Solo count + avg intensity
          h('div',{class:'stat-card'},
            h('div',{class:'stat-value',style:{color:CAT_COLORS.physical,fontSize:'22px',opacity:'0.6'}}, solo.length),
            h('div',{class:'stat-label'},'Solo'),
            h('div',{class:'stat-sub'}, solo.filter(e=>e.intensity).length > 0
              ? 'Avg '+avg(solo.filter(e=>e.intensity).map(e=>e.intensity)).toFixed(1)+'★'
              : 'No ratings yet')
          ),
          // Total deposit pts
          h('div',{class:'stat-card'},
            (() => {
              const totalPts = Math.round(physical.reduce((s,e)=>{
                const scored = bankScoreEntry(e, 1);
                return s + scored.score;
              }, 0));
              return h('div',{},
                h('div',{class:'stat-value',style:{color:CAT_COLORS.physical,fontSize:'22px'}}, totalPts),
                h('div',{class:'stat-label'},'Deposit pts'),
                h('div',{class:'stat-sub'}, 'Shared this window')
              );
            })()
          )
        ),

        // Deposit by type
        (() => {
          const byType = {};
          for (const e of physical) {
            if (!e.eventType || e.solo) continue;
            const cap = bankDayCap(winEntries.find(le => le.date === e.date && le.category === 'libido'));
            const score = bankScoreEntry(e, cap).score;
            if (!byType[e.eventType]) byType[e.eventType] = {pts:0, n:0};
            byType[e.eventType].pts += score;
            byType[e.eventType].n++;
          }
          const types = Object.entries(byType)
            .map(([type,d]) => ({type, pts:Math.round(d.pts*10)/10, n:d.n, avg:Math.round(d.pts/d.n*10)/10}))
            .sort((a,b) => b.pts - a.pts);
          if (types.length < 2) return null;
          const maxPts = types[0].pts;
          return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
            h('div',{class:'bar-chart-title'},'Deposit contribution by type'),
            ...types.map(t => {
              const pct = Math.round((t.pts / maxPts) * 100);
              return h('div',{style:{marginBottom:'8px'}},
                h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                  h('span',{style:{fontSize:'12px',color:'var(--text)'}}, t.type),
                  h('div',{style:{display:'flex',gap:'10px',fontSize:'11px',color:'var(--muted)'}},
                    h('span',{}, t.n+'×'),
                    h('span',{}, 'avg w:'+t.avg),
                    h('span',{style:{color:CAT_COLORS.physical}}, t.pts+' pts')
                  )
                ),
                h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                  h('div',{style:{height:'5px',width:pct+'%',background:CAT_COLORS.physical,borderRadius:'3px',transition:'width 0.3s'}})
                )
              );
            })
          );
        })(),

        // Connection quality distribution (shared only)
        physical.filter(e=>e.connectionQuality).length >= 2 ? (() => {
          const counts = {5:0,4:0,3:0,2:0,1:0};
          for (const e of physical) if (e.connectionQuality) counts[e.connectionQuality]++;
          const maxN = Math.max(...Object.values(counts));
          return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
            h('div',{class:'bar-chart-title'},'Connection quality distribution (shared)'),
            ...CONNECTION_QUALITY.slice().reverse().map(q => {
              const n   = counts[q.val]||0;
              const pct = maxN>0 ? Math.round((n/maxN)*100) : 0;
              const col = q.val>=4?'var(--c-partner)':q.val>=3?'var(--c-burnout)':'var(--c-warning)';
              return h('div',{style:{marginBottom:'7px'}},
                h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                  h('span',{style:{fontSize:'12px',color:'var(--text)'}}, q.label),
                  h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, n+'×')
                ),
                h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                  h('div',{style:{height:'5px',width:pct+'%',background:col,borderRadius:'3px',transition:'width 0.3s'}})
                )
              );
            })
          );
        })() : null

      ) : null,

      /* ── Affection ── */
      affection.length >= 1 ? h('div',{},
        h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},bondingLabel())),
        (() => {
          const avgQ     = avg(affection.filter(e=>e.connectionQuality).map(e=>e.connectionQuality));
          const avgW     = avg(affection.filter(e=>e.eventType).map(e=>{ const t=S.affectionTypes.find(x=>x.name===e.eventType); return t?Math.round(deriveActivityWeight(t)/5*100):null; }).filter(v=>v!==null));
          const qLabel   = avgQ === null ? '—'
            : avgQ >= 4.5 ? 'Peak' : avgQ >= 3.5 ? 'Meaningful'
            : avgQ >= 2.5 ? 'Warm' : avgQ >= 1.5 ? 'Routine' : 'Missed';
          const qColor   = avgQ === null ? 'var(--muted)'
            : avgQ >= 3.5 ? 'var(--c-partner)'
            : avgQ >= 2.5 ? 'var(--c-burnout)'
            : 'var(--c-warning)';

          // Initiator breakdown
          const byMe     = affection.filter(e=>e.initiatedBy==='me').length;
          const byHer    = affection.filter(e=>e.initiatedBy==='her').length;
          const mutual   = affection.filter(e=>e.initiatedBy==='mutual').length;
          const totalInit = byMe + byHer + mutual;

          return h('div',{},
            // Three stat cards
            h('div',{class:'stat-row-3'},
              h('div',{class:'stat-card'},
                h('div',{class:'stat-value',style:{color:CAT_COLORS.affection,fontSize:'22px'}}, affection.length),
                h('div',{class:'stat-label'},'Events'),
                h('div',{class:'stat-sub'}, affTrend ? affTrend.text : '')
              ),
              h('div',{class:'stat-card'},
                h('div',{class:'stat-value',style:{color:qColor,fontSize:'22px'}},
                  avgQ !== null ? avgQ.toFixed(1) : '—'),
                h('div',{class:'stat-label'},'Avg quality'),
                h('div',{class:'stat-sub'}, qLabel)
              ),
              h('div',{class:'stat-card'},
                h('div',{class:'stat-value',style:{color:CAT_COLORS.affection,fontSize:'22px'}},
                  avgW !== null ? Math.round(avgW) : '—'),
                h('div',{class:'stat-label'},'Avg weight'),
                h('div',{class:'stat-sub'},'activity score')
              )
            ),

            // Connection quality distribution
            (() => {
              const counts = {5:0, 4:0, 3:0, 2:0, 1:0};
              for (const e of affection) counts[e.connectionQuality || 3]++;
              const hasData = Object.values(counts).some(n=>n>0);
              if (!hasData) return null;
              const maxN = Math.max(...Object.values(counts));
              return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
                h('div',{class:'bar-chart-title'},'Connection quality distribution'),
                ...CONNECTION_QUALITY.slice().reverse().map(q => {
                  const n   = counts[q.val] || 0;
                  const pct = maxN > 0 ? Math.round((n / maxN) * 100) : 0;
                  const col = q.val >= 4 ? 'var(--c-partner)'
                            : q.val >= 3 ? 'var(--c-burnout)'
                            : 'var(--c-warning)';
                  return h('div',{style:{marginBottom:'7px'}},
                    h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                      h('span',{style:{fontSize:'12px',color:'var(--text)'}}, q.label),
                      h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, n+'×')
                    ),
                    h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                      h('div',{style:{height:'5px',width:pct+'%',background:col,borderRadius:'3px',transition:'width 0.3s'}})
                    )
                  );
                })
              );
            })(),

            // Activity breakdown — by type, avg quality
            (() => {
              const byType = {};
              for (const e of affection) {
                if (!e.eventType) continue;
                if (!byType[e.eventType]) byType[e.eventType] = {qs:[], n:0};
                byType[e.eventType].qs.push(e.connectionQuality || 3);
                byType[e.eventType].n++;
              }
              const types = Object.entries(byType)
                .map(([type,d]) => ({type, avg: avg(d.qs), n: d.n}))
                .sort((a,b) => b.avg - a.avg);
              if (types.length < 2) return null;
              return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
                h('div',{class:'bar-chart-title'},'Quality by activity'),
                ...types.map(t => {
                  const pct = Math.round((t.avg / 5) * 100);
                  const col = t.avg >= 3.5 ? 'var(--c-partner)'
                            : t.avg >= 2.5 ? 'var(--c-burnout)'
                            : 'var(--c-warning)';
                  return h('div',{style:{marginBottom:'8px'}},
                    h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                      h('span',{style:{fontSize:'12px',color:'var(--text)'}}, t.type),
                      h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, t.avg.toFixed(1)+' · '+t.n+'×')
                    ),
                    h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                      h('div',{style:{height:'5px',width:pct+'%',background:col,borderRadius:'3px',transition:'width 0.3s'}})
                    )
                  );
                })
              );
            })(),

            // Initiator breakdown
            totalInit > 0 ? h('div',{class:'bar-chart',style:{marginTop:'10px'}},
              h('div',{class:'bar-chart-title'},'Who initiated'),
              h('div',{style:{display:'flex',gap:'8px'}},
                ...[
                  {label:'I initiated', n:byMe,  color:CAT_COLORS.affection},
                  {label:`${P.Sub} initiated`, n:byHer, color:'var(--c-partner)'},
                  {label:'Mutual',       n:mutual, color:'var(--muted)'},
                ].filter(r=>r.n>0).map(r =>
                  h('div',{style:{
                    flex:'1', background:'var(--bg3)', borderRadius:'10px',
                    padding:'8px', textAlign:'center'
                  }},
                    h('div',{style:{fontSize:'18px',fontFamily:"'Libre Baskerville',serif",color:r.color}}, r.n),
                    h('div',{style:{fontSize:'10px',color:'var(--muted)',marginTop:'2px'}}, r.label),
                    h('div',{style:{fontSize:'10px',color:'var(--muted)'}},
                      Math.round(r.n/totalInit*100)+'%')
                  )
                )
              )
            ) : null,

            // Deposit contribution by activity type
            (() => {
              const byType = {};
              for (const e of affection) {
                if (!e.eventType) continue;
                const cap = bankDayCap(winEntries.find(le => le.date === e.date && le.category === 'libido'));
                const score = bankScoreEntry(e, cap).score;
                if (!byType[e.eventType]) byType[e.eventType] = {pts:0, n:0};
                byType[e.eventType].pts += score;
                byType[e.eventType].n++;
              }
              const types = Object.entries(byType)
                .map(([type,d]) => ({type, pts:Math.round(d.pts*10)/10, n:d.n, avg:Math.round(d.pts/d.n*10)/10}))
                .sort((a,b) => b.pts - a.pts);
              if (types.length < 2) return null;
              const maxPts = types[0].pts;
              return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
                h('div',{class:'bar-chart-title'},'Deposit contribution by activity'),
                ...types.map(t => {
                  const pct = Math.round((t.pts / maxPts) * 100);
                  return h('div',{style:{marginBottom:'8px'}},
                    h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                      h('span',{style:{fontSize:'12px',color:'var(--text)'}}, t.type),
                      h('div',{style:{display:'flex',gap:'10px',fontSize:'11px',color:'var(--muted)'}},
                        h('span',{}, t.n+'×'),
                        h('span',{}, 'avg w:'+t.avg),
                        h('span',{style:{color:'var(--c-affection)'}}, t.pts+' pts')
                      )
                    ),
                    h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                      h('div',{style:{height:'5px',width:pct+'%',background:CAT_COLORS.affection,borderRadius:'3px',transition:'width 0.3s'}})
                    )
                  );
                })
              );
            })()
          );
        })()
      ) : null,

      /* ── Restorative ── */
      restore.length >= 1 ? h('div',{},
        h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Restorative')),
        (() => {
          const activeRestore = restore.filter(e => e.eventType && e.eventType !== RESTORE_NONE_TYPE);
          return h('div',{},
            h('div',{class:'stat-row-3'},

              // Active count + trend
              h('div',{class:'stat-card'},
                h('div',{class:'stat-value',style:{color:CAT_COLORS.restore,fontSize:'22px'}}, activeRestore.length),
                h('div',{class:'stat-label'},'Events'),
                h('div',{class:'stat-sub'}, restoreTrend ? restoreTrend.text : '')
              ),

              // Total needs score
              h('div',{class:'stat-card'},
                (() => {
                  const totalScore = activeRestore.reduce((sum, e) => {
                    const typeObj = S.restoreTypes.find(t=>(typeof t==='string'?t:t.name)===e.eventType);
                    const cap = bankDayCap(S.allEntries.find(le=>le.date===e.date&&le.category==='libido'));
                    return sum + restoreScore(e, typeObj, cap);
                  }, 0);
                  const hasScores = totalScore > 0;
                  return h('div',{},
                    h('div',{class:'stat-value',style:{color: hasScores?'var(--c-restore)':'var(--muted)',fontSize:'22px'}},
                      hasScores ? Math.round(totalScore) : '—'),
                    h('div',{class:'stat-label'},'Needs score'),
                    h('div',{class:'stat-sub'}, hasScores ? 'total this window' : 'no profiles yet')
                  );
                })()
              ),

              // Best activity (by average score)
              h('div',{class:'stat-card'},
                (() => {
                  const byType = {};
                  for (const e of activeRestore) {
                    if (!e.eventType) continue;
                    const typeObj = S.restoreTypes.find(t=>(typeof t==='string'?t:t.name)===e.eventType);
                    const cap = bankDayCap(S.allEntries.find(le=>le.date===e.date&&le.category==='libido'));
                    const s = restoreScore(e, typeObj, cap);
                    if (!byType[e.eventType]) byType[e.eventType] = {total:0, n:0};
                    byType[e.eventType].total += s;
                    byType[e.eventType].n++;
                  }
                  const ranked = Object.entries(byType)
                    .map(([type,d]) => ({ type, avg: d.total/d.n, n: d.n }))
                    .sort((a,b) => b.avg - a.avg);
                  const best = ranked[0];
                  return h('div',{},
                    h('div',{class:'stat-value',style:{color:CAT_COLORS.restore,fontSize:'16px',lineHeight:'1.3',marginBottom:'4px'}},
                      best ? best.type : '—'),
                    h('div',{class:'stat-label'},'Best activity'),
                    h('div',{class:'stat-sub'}, best ? (Math.round(best.avg)+' pts avg · '+best.n+'×') : 'Log more types')
                  );
                })()
              )
            ),

            // Score by activity bar chart
            (() => {
              const byType = {};
              for (const e of activeRestore) {
                if (!e.eventType) continue;
                const typeObj = S.restoreTypes.find(t=>(typeof t==='string'?t:t.name)===e.eventType);
                const cap = bankDayCap(S.allEntries.find(le=>le.date===e.date&&le.category==='libido'));
                const s = restoreScore(e, typeObj, cap);
                if (!byType[e.eventType]) byType[e.eventType] = {total:0, n:0};
                byType[e.eventType].total += s;
                byType[e.eventType].n++;
              }
              const types = Object.entries(byType)
                .map(([type,d]) => ({ type, avg: d.total/d.n, total: d.total, n: d.n }))
                .sort((a,b) => b.avg - a.avg);
              if (types.length < 2) return null;
              const maxAvg = types[0].avg;
              return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
                h('div',{class:'bar-chart-title'},'Score by activity'),
                ...types.map(t => {
                  const pct   = Math.round((t.avg / maxAvg) * 100);
                  const color = t.avg >= 20 ? 'var(--c-partner)' : t.avg >= 8 ? 'var(--c-burnout)' : 'var(--muted)';
                  return h('div',{style:{marginBottom:'8px'}},
                    h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                      h('span',{style:{fontSize:'12px',color:'var(--text)'}}, t.type),
                      h('div',{style:{display:'flex',gap:'10px',fontSize:'11px',color:'var(--muted)'}},
                        h('span',{}, t.n+'×'),
                        h('span',{style:{color:'var(--c-restore)'}}, Math.round(t.avg)+' pts avg')
                      )
                    ),
                    h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                      h('div',{style:{height:'5px',width:pct+'%',background:color,borderRadius:'3px',transition:'width 0.3s'}})
                    )
                  );
                })
              );
            })(),

            // Low quality obstacle breakdown
            (() => {
              const lowQual = restore.filter(e => migrateRestoreQuality(e.restoreQuality, e) <= 2 && (e.restoreObstacles||[]).length > 0);
              if (lowQual.length === 0) return null;

              const counts = {};
              for (const e of lowQual) {
                for (const v of (e.restoreObstacles||[])) {
                  counts[v] = (counts[v]||0) + 1;
                }
              }
              const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
              if (entries.length === 0) return null;

              return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
                h('div',{class:'bar-chart-title'}, 'What held back quality ('+lowQual.length+' entr'+(lowQual.length===1?'y':'ies')+')'),
                ...entries.map(([val, n]) => {
                  const lbl = RESTORE_OBSTACLES.find(o=>o.val===val)?.label || val;
                  const pct = Math.round((n / lowQual.length) * 100);
                  return h('div',{style:{marginBottom:'8px'}},
                    h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                      h('span',{style:{fontSize:'12px',color:'var(--text)'}}, lbl),
                      h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, n+'× · '+pct+'%')
                    ),
                    h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                      h('div',{style:{height:'5px',width:pct+'%',background:'var(--c-turndown)',borderRadius:'3px',transition:'width 0.3s'}})
                    )
                  );
                })
              );
            })()
          );
        })()
      ) : null,

      /* ── Life Wobble ── */
      (S.showRegulation && regulation.length >= 1) ? h('div',{},
        h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Life Wobble')),
        (() => {
          const relational   = regulation.filter(e=>e.regulationTrigger==='relational');
          const nonRelational = regulation.filter(e=>e.regulationTrigger!=='relational');
          const avgIntensity = avg(regulation.map(e=>e.regulationIntensity).filter(Boolean));

          // All wobble scores against Personal only — relational trigger is context only
          const wobbleCost = regulation.reduce((sum, e) => {
            const cap = bankDayCap(winEntries.find(le=>le.date===e.date&&le.category==='libido'));
            return sum + Math.abs(wobbleRestoreScore(e, cap));
          }, 0);

          return h('div',{},
            // Stat cards
            h('div',{class:'stat-row-3'},
              h('div',{class:'stat-card'},
                h('div',{class:'stat-value',style:{color:CAT_COLORS.regulation,fontSize:'22px'}}, regulation.length),
                h('div',{class:'stat-label'},'Events'),
                h('div',{class:'stat-sub'},
                  relational.length > 0 ? relational.length+' relational' : nonRelational.length+' personal'
                )
              ),
              h('div',{class:'stat-card'},
                h('div',{class:'stat-value',style:{color: avgIntensity >= 3.5 ? 'var(--c-conflict)' : avgIntensity >= 2.5 ? 'var(--c-burnout)' : CAT_COLORS.regulation, fontSize:'22px'}},
                  avgIntensity !== null ? avgIntensity.toFixed(1) : '—'),
                h('div',{class:'stat-label'},'Avg intensity'),
                h('div',{class:'stat-sub'}, avgIntensity !== null
                  ? (avgIntensity >= 4 ? 'Heavy load' : avgIntensity >= 3 ? 'Hard going' : avgIntensity >= 2 ? 'Manageable' : 'Light')
                  : '')
              ),
              h('div',{class:'stat-card'},
                h('div',{class:'stat-value',style:{color:CAT_COLORS.regulation,fontSize:'22px'}},
                  wobbleCost > 0 ? '-'+Math.round(wobbleCost) : '—'),
                h('div',{class:'stat-label'},'Total cost'),
                h('div',{class:'stat-sub'}, wobbleCost > 0
                  ? (relational.length > 0 ? 'personal (relational context)' : 'personal only')
                  : '')
              )
            ),

            // Emotion frequency grouped by tone
            (() => {
              const allEmotions = regulation.flatMap(e => e.regulationEmotions || []);
              if (allEmotions.length === 0) return null;
              const counts = {};
              for (const em of allEmotions) counts[em] = (counts[em]||0) + 1;
              const maxN = Math.max(...Object.values(counts));

              const byTone = {};
              for (const tone of EMOTION_TONES) byTone[tone.val] = [];
              byTone['other'] = [];
              for (const tag of Object.keys(counts)) {
                const tv = (S.tagToneOverrides && S.tagToneOverrides[tag]) || TAG_TO_EMOTION_TONE[tag] || 'other';
                (byTone[tv] || byTone['other']).push(tag);
              }

              const renderBar = (emotion, n) => {
                const pct = Math.round((n / maxN) * 100);
                return h('div',{style:{marginBottom:'7px'}},
                  h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                    h('span',{style:{fontSize:'12px',color:'var(--text)'}}, emotion),
                    h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, n+'×')
                  ),
                  h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                    h('div',{style:{height:'5px',width:pct+'%',background:CAT_COLORS.regulation,borderRadius:'3px',transition:'width 0.3s'}})
                  )
                );
              };
              const toneHeader = label => h('div',{style:{display:'flex',alignItems:'center',gap:'8px',margin:'10px 0 6px'}},
                h('span',{style:{fontSize:'11px',color:'var(--muted)',whiteSpace:'nowrap'}}, label),
                h('hr',{style:{flex:'1',border:'none',borderTop:'1px solid var(--border)',margin:'0'}})
              );

              const groups = [
                ...EMOTION_TONES
                  .filter(tone => (byTone[tone.val]||[]).length > 0)
                  .flatMap(tone => [
                    toneHeader(tone.label),
                    ...byTone[tone.val].slice().sort((a,b) => (counts[b]||0)-(counts[a]||0)).map(tag => renderBar(tag, counts[tag])),
                  ]),
                ...(byTone['other'].length > 0 ? [
                  toneHeader('Other'),
                  ...byTone['other'].slice().sort((a,b) => (counts[b]||0)-(counts[a]||0)).map(tag => renderBar(tag, counts[tag])),
                ] : []),
              ];

              return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
                h('div',{class:'bar-chart-title'},'What was present'),
                ...groups
              );
            })(),

            // Polyvagal state breakdown
            (() => {
              const withEmotions = regulation.filter(e =>
                Array.isArray(e.regulationEmotions) && e.regulationEmotions.length > 0
              );
              if (withEmotions.length < 3) return null;
              const stateCounts = { activated: 0, withdrawal: 0, mixed: 0 };
              for (const e of withEmotions) stateCounts[entryPolyvagalState(e)]++;
              const total = withEmotions.length;
              const STATE_META = [
                { key:'activated',  label:'Activated',  color:'var(--c-conflict)',   hint:'fight / flight' },
                { key:'withdrawal', label:'Withdrawal', color:'var(--c-turndown)',   hint:'freeze / collapse' },
                { key:'mixed',      label:'Mixed',      color:CAT_COLORS.regulation, hint:'shifting or unclear' },
              ].filter(s => stateCounts[s.key] > 0);
              const maxN = Math.max(...STATE_META.map(s => stateCounts[s.key]));
              return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
                h('div',{class:'bar-chart-title'},'Nervous system state'),
                ...STATE_META.map(s => {
                  const n   = stateCounts[s.key];
                  const pct = Math.round((n / maxN) * 100);
                  const pctOfTotal = Math.round((n / total) * 100);
                  return h('div',{style:{marginBottom:'7px'}},
                    h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                      h('span',{style:{fontSize:'12px',color:'var(--text)'}},
                        s.label,
                        h('span',{style:{fontSize:'10px',color:'var(--muted)',marginLeft:'5px'}}, s.hint)
                      ),
                      h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, pctOfTotal+'%')
                    ),
                    h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                      h('div',{style:{height:'5px',width:pct+'%',background:s.color,borderRadius:'3px',transition:'width 0.3s'}})
                    )
                  );
                })
              );
            })(),

            // Trigger breakdown
            (() => {
              const triggerCounts = {};
              for (const e of regulation) {
                const t = e.regulationTrigger || 'unknown';
                triggerCounts[t] = (triggerCounts[t]||0) + 1;
              }
              const sorted = Object.entries(triggerCounts).sort((a,b)=>b[1]-a[1]);
              if (sorted.length < 2) return null;
              const maxN = sorted[0][1];
              return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
                h('div',{class:'bar-chart-title'},'Trigger source'),
                ...sorted.map(([val, n]) => {
                  const found = WOBBLE_TRIGGER.find(t=>t.val===val);
                  const label = found ? found.label : val;
                  const pct   = Math.round((n / maxN) * 100);
                  const color = val === 'relational' ? 'var(--c-conflict)' : CAT_COLORS.regulation;
                  return h('div',{style:{marginBottom:'7px'}},
                    h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                      h('span',{style:{fontSize:'12px',color:'var(--text)'}}, label),
                      h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, n+'×')
                    ),
                    h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                      h('div',{style:{height:'5px',width:pct+'%',background:color,borderRadius:'3px',transition:'width 0.3s'}})
                    )
                  );
                })
              );
            })(),

            // Resolution breakdown
            (() => {
              const withRes = regulation.filter(e=>e.regulationResolution);
              if (withRes.length === 0) return null;
              const counts = {};
              for (const e of withRes) counts[e.regulationResolution] = (counts[e.regulationResolution]||0)+1;
              const maxN = Math.max(...Object.values(counts));
              return h('div',{class:'bar-chart',style:{marginTop:'10px'}},
                h('div',{class:'bar-chart-title'},'Where you landed'),
                ...WOBBLE_RESOLUTION.map(r => {
                  const n = counts[r.val] || 0;
                  if (n === 0) return null;
                  const pct = Math.round((n / maxN) * 100);
                  const color = r.val === 'resolved' || r.val === 'coming-down' ? 'var(--c-partner)'
                              : r.val === 'still-on' ? 'var(--c-burnout)'
                              : 'var(--c-conflict)';
                  return h('div',{style:{marginBottom:'7px'}},
                    h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                      h('span',{style:{fontSize:'12px',color:'var(--text)'}}, r.label),
                      h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, n+'×')
                    ),
                    h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                      h('div',{style:{height:'5px',width:pct+'%',background:color,borderRadius:'3px',transition:'width 0.3s'}})
                    )
                  );
                })
              );
            })()
          );
        })()
      ) : null,


      /* ── Turn down breakdown ── */
      S.showPhysical && turndown.length >= 2 ? h('div',{},
        h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Turn downs')),
        h('div',{class:'stat-row'},
          h('div',{class:'stat-card'},
            h('div',{class:'stat-value',style:{color:CAT_COLORS.turndown,fontSize:'22px'}},
              turndown.filter(e=>e.initiatedBy==='her').length),
            h('div',{class:'stat-label'},`By ${P.obj}`),
            h('div',{class:'stat-sub'}, turndown.filter(e=>e.initiatedBy==='her').length > 0
              ? (() => {
                  const td = turndown.filter(e=>e.initiatedBy==='her');
                  const avgImpact = (() => {
                    const vals = td.map(e=>e.tdImpact).filter(Boolean);
                    if (!vals.length) return '';
                    const avg = vals.reduce((a,b)=>a+b,0) / vals.length;
                    return TURNDOWN_IMPACT.find(i=>i.val===Math.round(avg))?.label || '';
                  })();
                  const topHow = (() => { const counts={}; td.map(e=>e.turndownType).filter(Boolean).forEach(t=>counts[t]=(counts[t]||0)+1); const e=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]; return e?TURNDOWN_TYPES.find(x=>x.val===e[0])?.label||e[0]:''; })();
                  return [avgImpact, topHow].filter(Boolean).join(' · ');
                })()
              : '')
          ),
          h('div',{class:'stat-card'},
            h('div',{class:'stat-value',style:{color:CAT_COLORS.turndown,fontSize:'22px'}},
              turndown.filter(e=>e.initiatedBy==='me').length),
            h('div',{class:'stat-label'},'By me'),
            h('div',{class:'stat-sub'}, turndown.filter(e=>e.initiatedBy==='me').length > 0
              ? (() => {
                  const td = turndown.filter(e=>e.initiatedBy==='me');
                  const topReason = (() => { const counts={}; td.map(e=>e.tdMyReason).filter(Boolean).forEach(r=>counts[r]=(counts[r]||0)+1); const e=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]; return e?TD_MY_REASONS.find(x=>x.val===e[0])?.label||e[0]:''; })();
                  const topHow = (() => { const counts={}; td.map(e=>e.turndownType).filter(Boolean).forEach(t=>counts[t]=(counts[t]||0)+1); const e=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]; return e?TD_MY_HOW.find(x=>x.val===e[0])?.label||e[0]:''; })();
                  return [topReason, topHow].filter(Boolean).join(' · ');
                })()
              : '')
          ),

        ),
        // Turn down load for the window
        (() => {
          const herTD = turndown.filter(e=>e.initiatedBy==='her');
          if (herTD.length < 1) return null;
          const totalLoad = Math.round(herTD.reduce((s,e)=>s+bankTdLoad(e),0));
          return h('div',{class:'stat-card',style:{marginTop:'10px',gridColumn:'span 2'}},
            h('div',{class:'stat-value',style:{color:CAT_COLORS.turndown,fontSize:'22px'}}, totalLoad),
            h('div',{class:'stat-label'},`Turn down load (by ${P.obj})`),
            h('div',{class:'stat-sub'},'Raw significance total for this period · no decay applied')
          );
        })()
      ) : null,

      /* ── Libido ── */
      S.showPhysical ? h('div',{},
      h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Mood, Energy & Desire')),
      libiEntries.length === 0
        ? h('div',{class:'ins-empty'},'No entries in this window.')
        : h('div',{},
          h('div',{style:{background:'var(--bg2)',border:'1px solid var(--border)',borderRadius:'14px',padding:'12px',marginBottom:'10px'}},
            (() => {
              const avgMood   = avg(libiEntries.filter(e=>e.mood).map(e=>e.mood));
              const avgEnergy = avg(libiEntries.filter(e=>e.energy).map(e=>e.energy));
              const avgCap    = avgMood !== null && avgEnergy !== null
                ? (() => {
                    const norm = v => 1 + (v - 3) / 8;
                    const c = S.showPhysical && avgLibido !== null
                      ? Math.pow(norm(avgMood), 0.4) * Math.pow(norm(avgEnergy), 0.4) * Math.pow(norm(avgLibido), 0.2)
                      : Math.pow(norm(avgMood), 0.5) * Math.pow(norm(avgEnergy), 0.5);
                    return Math.round(c * 100);
                  })()
                : null;
              const rows = [
                {label:'Mood',     val: avgMood   !== null ? avgMood.toFixed(1)+'/5'   : '—', color: '#e8b87a',           trend: null},
                {label:'Energy',   val: avgEnergy !== null ? avgEnergy.toFixed(1)+'/5' : '—', color: '#7ab8e8',           trend: null},
                ...(S.showPhysical ? [{label:'Desire', val: avgLibido !== null ? avgLibido.toFixed(1)+'/5' : '—', color: CAT_COLORS.libido, trend: libiTrend}] : []),
                {label:'Capacity multiplier', val: avgCap !== null ? avgCap + '%' : '—', color: 'var(--muted)', trend: null},
              ];
              return rows.map((r, i) => h('div',{style:{
                display:'flex', justifyContent:'space-between', alignItems:'baseline',
                padding:'5px 0', borderBottom: i < rows.length-1 ? '1px solid var(--border)' : 'none'
              }},
                h('span',{style:{fontSize:'12px',color:'var(--muted)'}}, r.label),
                h('div',{style:{display:'flex',alignItems:'baseline',gap:'8px'}},
                  r.trend ? h('span',{style:{fontSize:'10px'},class:r.trend.cls}, r.trend.text.split(' ')[0]) : null,
                  h('span',{style:{fontSize:'16px',color:r.color,fontFamily:"'Libre Baskerville',serif"}}, r.val)
                )
              ));
            })()
          ),
          libiPoints.length >= 2
            ? buildLibidoChart(libiPoints)
            : h('div',{class:'ins-empty',style:{padding:'16px'}},'Log mood & energy on 2+ days to see the trend.')
        )
      ) : null,

      /* ── Load ── */
      h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Load')),
      conflict.length === 0 && burnout.length === 0
        ? h('div',{class:'ins-empty'}, S.showCaretaker ? 'No conflict or steadying entries in this window.' : 'No conflict entries in this window.')
        : h('div',{},
          buildBarChart('Load by week', weeks, [
            {
              label:'Conflict',
              color:CAT_COLORS.conflict,
              getValue:  es => Math.round(es.filter(e=>e.category==='conflict').reduce((s,e)=>s+bankConfLoad(e),0)),
              getCount:  es => es.filter(e=>e.category==='conflict').length,
            },
            {
              label:'Steadying',
              color:CAT_COLORS.burnout,
              getValue:  es => Math.round(es.filter(e=>e.category==='burnout').reduce((s,e)=>s+burnoutLoadEntry(e),0)),
              getCount:  es => es.filter(e=>e.category==='burnout').length,
            },
          ]),
          h('div',{style:{background:'var(--bg2)',border:'1px solid rgba(224,53,53,0.15)',borderRadius:'14px',padding:'12px',marginTop:'10px',marginBottom:'10px'}},
            (() => {
              const confPts  = Math.round(conflict.reduce((s,e)=>s+bankConfLoad(e),0));
              const burnPts  = Math.round(burnout.reduce((s,e)=>s+burnoutLoadEntry(e),0));
              const totalPts = confPts + burnPts;
              const peak     = Math.max(0,...weeks.map(wk=>Math.round(
                wk.entries.filter(e=>e.category==='conflict').reduce((s,e)=>s+bankConfLoad(e),0)+
                wk.entries.filter(e=>e.category==='burnout').reduce((s,e)=>s+burnoutLoadEntry(e),0)
              )));
              const totalColor = totalPts<=30?'var(--c-partner)':totalPts<=70?'var(--c-burnout)':'var(--c-warning)';
              const row = (label, color, count, pts, trend) =>
                h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
                  h('span',{style:{fontSize:'12px',color:'var(--muted)'}}, label),
                  h('div',{style:{display:'flex',alignItems:'baseline',gap:'8px'}},
                    trend ? h('span',{style:{fontSize:'10px'},class:trend.cls}, trend.text.split(' ')[0]) : null,
                    h('span',{style:{fontSize:'13px',color:'var(--muted)'}}, count+' · '),
                    h('span',{style:{fontSize:'16px',color,fontFamily:"'Libre Baskerville',serif"}}, pts+'pts')
                  )
                );
              return [
                row('⚡ Conflict',  CAT_COLORS.conflict, conflict.length, confPts, conflictLoadTrend),
                row('🕯️ Steadying', CAT_COLORS.burnout,  burnout.length,  burnPts, burnoutLoadTrend),
                h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0',borderBottom:'1px solid var(--border)'}},
                  h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'Peak week'),
                  h('span',{style:{fontSize:'16px',color:'var(--muted)',fontFamily:"'Libre Baskerville',serif"}}, peak>0?peak+'pts':'—')
                ),
                h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',padding:'5px 0'}},
                  h('span',{style:{fontSize:'12px',color:'var(--muted)'}},'Total load'),
                  h('span',{style:{fontSize:'20px',color:totalColor,fontFamily:"'Libre Baskerville',serif"}}, totalPts+'pts')
                ),
              ];
            })()
          ),
          // ── Conflict conduct & resolution breakdown ──────────────────
          conflict.length > 0 ? (() => {
            const withConduct = conflict.filter(e=>e.conduct);
            const withRes     = conflict.filter(e=>e.resolution);
            if (!withConduct.length && !withRes.length) return null;

            const distBar = (items, allItems, colorFn) => {
              const maxN = Math.max(1, ...items.map(i=>i.n));
              return items.map(i =>
                h('div',{style:{marginBottom:'6px',opacity:i.n===0?'0.35':'1'}},
                  h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'2px'}},
                    h('span',{style:{fontSize:'11px',color:'var(--text)'}}, i.label),
                    h('span',{style:{fontSize:'11px',color:'var(--muted)'}}, i.n+'×')
                  ),
                  h('div',{style:{height:'4px',background:'var(--bg3)',borderRadius:'2px'}},
                    i.n > 0 ? h('div',{style:{
                      height:'4px',
                      width:Math.round((i.n/allItems.length)*100)+'%',
                      background:colorFn(i.val),
                      borderRadius:'2px'
                    }}) : null
                  )
                )
              );
            };

            const conductCounts = withConduct.length ? CONFLICT_CONDUCT.map(c=>({
              val:c.val, label:c.label,
              n: withConduct.filter(e=>e.conduct===c.val).length
            })) : [];
            const resCounts = withRes.length ? CONFLICT_RESOLUTION.map(r=>({
              val:r.val, label:r.label,
              n: withRes.filter(e=>e.resolution===r.val).length
            })) : [];

            const conductColor = val =>
              val==='calm'?'var(--c-partner)':val==='demands'?'var(--c-restore)':
              val==='disrespect'?'var(--c-burnout)':val==='angry'?'var(--c-warning)':'var(--c-conflict)';
            const resColor = val =>
              val==='breakthrough'?'var(--c-partner)':val==='resolved'?'var(--c-restore)':
              val==='partial'?'var(--c-burnout)':val==='unresolved'?'var(--c-warning)':'var(--c-conflict)';

            return h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginTop:'10px'}},
              withConduct.length ? h('div',{class:'bar-chart'},
                h('div',{class:'bar-chart-title'},'Conduct'),
                ...distBar(conductCounts, withConduct, conductColor)
              ) : null,
              withRes.length ? h('div',{class:'bar-chart'},
                h('div',{class:'bar-chart-title'},'Resolution'),
                ...distBar(resCounts, withRes, resColor)
              ) : null
            );
          })() : null,
          burnout.length > 0 ? h('div',{class:'bar-chart',style:{marginTop:'10px'}},
            h('div',{class:'bar-chart-title'},'Steadying breakdown by type'),
            h('div',{},
              (() => {
                // Duration string → midpoint minutes (matches DURATION_OPTIONS values)
                const durMins = d => {
                  if (!d) return 0;
                  if (d==='minutes')       return 5;
                  if (d==='< 1 hour')      return 30;
                  if (d==='about an hour') return 60;
                  if (d==='couple hours')  return 120;
                  if (d==='many hours')    return 240;
                  if (d.startsWith('<')) return 20;
                  if (d.startsWith('30')) return 45;
                  if (d.startsWith('1')) return 90;
                  if (d.startsWith('2')) return 180;
                  if (d.startsWith('4')) return 300;
                  return 0;
                };

                // Group by steadying type — use new caretakerTypes array, fall back to caretakerType, then legacy burnoutTypes
                const getEntryTypes = e => {
                  if (Array.isArray(e.caretakerTypes) && e.caretakerTypes.length) return e.caretakerTypes;
                  if (e.caretakerType) return [e.caretakerType];
                  const bt = Array.isArray(e.burnoutTypes) ? e.burnoutTypes : (e.burnoutType ? [e.burnoutType] : []);
                  return bt.map(t => burnoutLabel(BURNOUT_LEGACY[t]||t).label);
                };

                const typeData = {};
                for (const e of burnout) {
                  const types = getEntryTypes(e);
                  const mins  = durMins(e.duration);
                  const load  = burnoutLoadEntry(e);
                  const minsPerType = types.length > 0 ? mins / types.length : mins;
                  const loadPerType = types.length > 0 ? load / types.length : load;

                  if (types.length === 0) {
                    const key = 'Untyped';
                    if (!typeData[key]) typeData[key] = { count:0, mins:0, load:0, label:key };
                    typeData[key].count++;
                    typeData[key].mins += mins;
                    typeData[key].load += load;
                  } else {
                    for (const t of types) {
                      if (!typeData[t]) typeData[t] = { count:0, mins:0, load:0, label:t };
                      typeData[t].count++;
                      typeData[t].mins  += minsPerType;
                      typeData[t].load  += loadPerType;
                    }
                  }
                }

                const sorted = Object.entries(typeData).sort((a,b)=>b[1].load-a[1].load);
                if (!sorted.length) return null;
                const maxLoad = sorted[0][1].load;

                const relCount = burnout.filter(e=>e.ctContext==='relationship').length;
                const extCount = burnout.filter(e=>e.ctContext==='external').length;
                const untagged = burnout.length - relCount - extCount;

                const contextPills = (relCount > 0 || extCount > 0) ? h('div',{style:{
                  display:'flex',gap:'8px',marginBottom:'10px',fontSize:'11px',flexWrap:'wrap'
                }},
                  relCount > 0 ? h('div',{style:{
                    padding:'4px 10px',borderRadius:'20px',
                    background:'var(--c-conflict-tint)',border:'1px solid var(--c-conflict-border)',
                    color:'var(--c-conflict)'
                  }}, `${relCount} with my partner`) : null,
                  extCount > 0 ? h('div',{style:{
                    padding:'4px 10px',borderRadius:'20px',
                    background:'rgba(160,127,212,0.10)',border:'1px solid rgba(160,127,212,0.25)',
                    color:'var(--c-wobble)'
                  }}, `${extCount} not my partner — personal only`) : null,
                  untagged > 0 ? h('div',{style:{
                    padding:'4px 10px',borderRadius:'20px',
                    background:'var(--surface-1)',border:'1px solid var(--border)',
                    color:'var(--muted)'
                  }}, `${untagged} untagged`) : null
                ) : null;

                const bars = sorted.map(([key, d]) => {
                  return h('div',{style:{marginBottom:'10px'}},
                    h('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:'3px'}},
                      h('span',{style:{fontSize:'12px',color:'var(--text)'}}, d.label),
                      h('div',{style:{display:'flex',gap:'12px',fontSize:'11px',color:'var(--muted)'}},
                        h('span',{}, d.count+'×'),
                        h('span',{style:{color:'var(--c-burnout)'}}, Math.round(d.load)+'pts')
                      )
                    ),
                    h('div',{style:{height:'5px',background:'var(--bg3)',borderRadius:'3px'}},
                      h('div',{style:{
                        height:'5px',
                        width:Math.round((d.load/maxLoad)*100)+'%',
                        background:'var(--c-burnout)',
                        borderRadius:'3px'
                      }})
                    )
                  );
                });

                return h('div',{}, contextPills, ...bars,
                  (() => {
                    const totalMins = burnout.reduce((s,e)=>s+durMins(e.duration),0);
                    if (totalMins === 0) return null;
                    const totalHrs = totalMins >= 60
                      ? (totalMins/60).toFixed(1)+'h total'
                      : Math.round(totalMins)+'m total';
                    return h('div',{style:{
                      fontSize:'11px',color:'var(--muted)',paddingTop:'8px',
                      borderTop:'1px solid var(--border)',marginTop:'4px'
                    }}, '🕯️ approx. '+totalHrs+' steadying in this window');
                  })()
                );
            })()
          )
          ) : null
        ),

      /* end of detailed metrics — closes the collapsible body div + buildLensCollapsible */
      )
      })
    )
  );
}





function buildWindowSummary(weekEntries, prevEntries, label, periodRef, periodRefCap, end=S.today, mode='full') {
  // mode: 'full' renders observation + all three cards (legacy/default)
  //       'observationOnly' renders just the observation block (used in the
  //         Last 30 days collapsible)
  //       'cardsOnly' renders just the Connection / Load / Positive
  //         Development cards (used at the top of the All metrics
  //         collapsible — repositioned per design)

  // Entry filters
  const physical  = weekEntries.filter(e=>e.category==='physical'&&!e.solo);
  const solo      = weekEntries.filter(e=>e.category==='physical'&&e.solo);
  const affection = weekEntries.filter(e=>e.category==='affection');
  const conflict  = weekEntries.filter(e=>e.category==='conflict');
  const burnout   = weekEntries.filter(e=>e.category==='burnout');
  const turndown  = weekEntries.filter(e=>e.category==='turndown');
  const libido    = weekEntries.filter(e=>e.category==='libido');
  const restore   = weekEntries.filter(e=>e.category==='restore');
  const prevRestore    = prevEntries.filter(e=>e.category==='restore');
  const regulation     = weekEntries.filter(e=>e.category==='regulation');
  const prevRegulation = prevEntries.filter(e=>e.category==='regulation');

  const prevPhysical  = prevEntries.filter(e=>e.category==='physical'&&!e.solo);
  const prevAffection = prevEntries.filter(e=>e.category==='affection');
  const prevConflict  = prevEntries.filter(e=>e.category==='conflict');
  const prevBurnout   = prevEntries.filter(e=>e.category==='burnout');
  const prevTurndown  = prevEntries.filter(e=>e.category==='turndown');

  const conflictLoad     = Math.round(conflict.reduce((s,e)=>s+bankConfLoad(e),0));
  const burnoutLoad      = Math.round(burnout.reduce((s,e)=>s+burnoutLoadEntry(e),0));
  const turndownLoad     = Math.round(turndown.filter(e=>e.initiatedBy==='her').reduce((s,e)=>s+bankTdLoad(e),0));
  const wobbleLoad       = Math.round(regulation.reduce((s,e)=>{ const c=bankDayCap(weekEntries.find(le=>le.date===e.date&&le.category==='libido')); return s+Math.abs(wobbleRestoreScore(e,c)); },0));
  const caretakerPersonalLoad = Math.round(burnout.reduce((s,e)=>{ const c=bankDayCap(weekEntries.find(le=>le.date===e.date&&le.category==='libido')); return s+Math.abs(caretakerPersonalScore(e,c)); },0));
  const prevConflictLoad  = Math.round(prevConflict.reduce((s,e)=>s+bankConfLoad(e),0));
  const prevBurnoutLoad   = Math.round(prevBurnout.reduce((s,e)=>s+burnoutLoadEntry(e),0));
  const prevTurndownLoad  = Math.round(prevTurndown.filter(e=>e.initiatedBy==='her').reduce((s,e)=>s+bankTdLoad(e),0));
  const prevWobbleLoad    = Math.round(prevRegulation.reduce((s,e)=>{ const c=bankDayCap(prevEntries.find(le=>le.date===e.date&&le.category==='libido')); return s+Math.abs(wobbleRestoreScore(e,c)); },0));

  // Positive score totals
  const cap = e => bankDayCap(weekEntries.find(le=>le.date===e.date&&le.category==='libido'));
  const physicalPts  = Math.round(physical.reduce((s,e)=>{ const t=S.physicalTypes.find(x=>x.name===e.eventType); const R=BANK_OUTCOME_M[e.connectionQuality||3]||0.60; return s+(t?deriveActivityWeight(t)*R*cap(e)/5*100:0); },0));
  const affectionPts = Math.round(affection.reduce((s,e)=>{ const t=S.affectionTypes.find(x=>x.name===e.eventType); const R=BANK_OUTCOME_M[e.connectionQuality||3]||0.60; return s+(t?deriveActivityWeight(t)*R*cap(e)/5*100:0); },0));
  const restorePts   = Math.round(restore.reduce((s,e)=>{ const t=S.restoreTypes.find(x=>(typeof x==='string'?x:x.name)===e.eventType); return s+restoreScore(e,t,cap(e)); },0));
  const prevPhysicalPts  = Math.round(prevPhysical.reduce((s,e)=>{ const t=S.physicalTypes.find(x=>x.name===e.eventType); const R=BANK_OUTCOME_M[e.connectionQuality||3]||0.60; const c=bankDayCap(prevEntries.find(le=>le.date===e.date&&le.category==='libido')); return s+(t?deriveActivityWeight(t)*R*c/5*100:0); },0));
  const prevAffectionPts = Math.round(prevAffection.reduce((s,e)=>{ const t=S.affectionTypes.find(x=>x.name===e.eventType); const R=BANK_OUTCOME_M[e.connectionQuality||3]||0.60; const c=bankDayCap(prevEntries.find(le=>le.date===e.date&&le.category==='libido')); return s+(t?deriveActivityWeight(t)*R*c/5*100:0); },0));
  const prevRestorePts   = Math.round(prevRestore.reduce((s,e)=>{ const t=S.restoreTypes.find(x=>(typeof x==='string'?x:x.name)===e.eventType); const c=bankDayCap(prevEntries.find(le=>le.date===e.date&&le.category==='libido')); return s+restoreScore(e,t,c); },0));
  const totalPositive    = physicalPts + affectionPts;
  const avgDesire        = avg(libido.map(e=>e.libiLevel));
  const avgAffWeight     = avg(affection.filter(e=>e.eventType).map(e=>{ const t=S.affectionTypes.find(x=>x.name===e.eventType); return t?Math.round(deriveActivityWeight(t)/5*100):null; }).filter(v=>v!==null));

  // vs label helper
  const vsLabel = (curr, prev, higherGood=true) => {
    if (prev === 0 && curr === 0) return '';
    if (prev === 0) return '';
    const diff = curr - prev;
    if (Math.abs(diff) < 0.1) return '';
    const up = diff > 0;
    const good = higherGood ? up : !up;
    const arrow = up ? '↑' : '↓';
    const color = good ? 'var(--c-partner)' : 'var(--c-warning)';
    return h('span',{class:'week-vs',style:{color}}, `${arrow}${Math.abs(diff).toFixed(diff % 1 === 0 ? 0 : 1)} vs prev period`);
  };

  // ── Weekly observation — single most important signal ──────────────────
  // Windowed relational balance — same decay method as buildScoreBar so the
  // number matches what the user sees in the score panel.
  const wDays  = Number(S.loveBankWindow) || 7;
  const zones  = getBounds(wDays);
  let weekBal;
  if (S.useExperimentalScoring) {
    // Use the experimental lifetime relational sum so observations reference
    // the same number the gauges show.
    weekBal = weekEntries.length > 0 ? Math.round(computeExperimentalScores().rel) : null;
  } else {
    const wkByDate = {};
    for (const e of weekEntries) {
      if (!wkByDate[e.date]) wkByDate[e.date] = [];
      wkByDate[e.date].push(e);
    }
    let wkRelDecayed = 0;
    for (const [date, dayEs] of Object.entries(wkByDate)) {
      const cap = bankDayCap(dayEs.find(e => e.category === 'libido'));
      const daysAgo = daysBetween(date, end);
      const dw = Math.pow(1 - S.weights.decay, daysAgo);
      let dayDelta = 0;
      for (const e of dayEs) dayDelta += bankScoreEntry(e, cap).score;
      wkRelDecayed += dayDelta * dw;
    }
    weekBal = weekEntries.length > 0 ? Math.round(wkRelDecayed * 10) / 10 : null;
  }

  // Only count her turn downs for load signal
  const herTurndownLoad = Math.round(
    turndown.filter(e=>e.initiatedBy==='her').reduce((s,e)=>s+bankTdLoad(e),0));

  // Restore quality-weighted (not raw count)
  const avgRestoreQ = avg(restore.map(e=>migrateRestoreQuality(e.restoreQuality, e)).filter(Boolean));
  const restoreGood = restore.length > 0 && avgRestoreQ !== null && avgRestoreQ >= 3;

  // Scored observations with priority — highest priority first, first match wins
  const candidates = [

    // ── Critical negatives ───────────────────────────────────────────────
    {
      icon:'📉', title:'Balance in critical range', tone:'critical',
      test: weekBal !== null && weekBal < zones.depleted,
      text: `Relational balance ended ${periodRef} at ${weekBal>=0?'+':''}${weekBal?.toFixed(0)} — in the depleted or critical range. The numbers reflect accumulated strain; restoration takes time.`
    },
    {
      icon:'⚡🌒', title:'Conflict and turn-downs', tone:'critical',
      test: S.showPhysical && conflictLoad >= 60 && herTurndownLoad >= 40,
      text: `Conflict and significant turn-downs both ${periodRef} — a double withdrawal. Worth checking if they fell on the same days.`
    },
    {
      icon:'🩺', title:'Steadying without restoration', tone:'critical',
      test: S.showCaretaker && burnoutLoad >= 120 && restore.length === 0,
      text: `Heavy steadying ${periodRef} (${burnoutLoad} pts) with no restorative activity logged — your resource tank needs attention.`
    },
    {
      icon:'🫧', title:'Wobble drain without restore', tone:'critical',
      test: S.showRegulation && wobbleLoad >= 60 && restore.length === 0,
      text: `Heavy wobble load ${periodRef} (${wobbleLoad} pts) with no restorative activity — personal tank draining without being refilled.`
    },
    {
      icon:'⚖️', title:'Restore not keeping pace', tone:'concern',
      test: S.showRegulation && wobbleLoad >= 60 && restorePts > 0 && restorePts < wobbleLoad,
      text: `Wobble drain outpaced restore ${periodRef} (${wobbleLoad} pts out vs ${restorePts} pts in) — restore activity isn't keeping up with the personal load.`
    },
    {
      icon:'🌀⚡', title:'Wobble and conflict together', tone:'concern',
      test: S.showRegulation && (() => {
        const relWobble = regulation.filter(e=>e.regulationTrigger==='relational');
        if (relWobble.length === 0 || conflict.length === 0) return false;
        const conflictDates = new Set(conflict.map(e=>e.date));
        return relWobble.some(e=>conflictDates.has(e.date));
      })(),
      text: `Relational wobble and conflict logged on the same day ${periodRef} — a double load. Worth noting if they were connected.`
    },
    {
      icon:'🌒', title:'Heavy turn-down weight', tone:'concern',
      test: S.showPhysical && herTurndownLoad >= 120,
      text: `High turn-down weight ${periodRef} (${herTurndownLoad} pts) — significant anticipated investment went unmet.`
    },
    {
      icon:'⚡', title:'Heavy conflict load', tone:'concern',
      test: conflictLoad >= 60,
      text: (() => {
        const withRes = conflict.filter(e=>e.resolution);
        const resCounts = {};
        for (const e of withRes) resCounts[e.resolution] = (resCounts[e.resolution]||0)+1;
        const resStr = Object.entries(resCounts)
          .sort((a,b)=>b[1]-a[1])
          .map(([val,n]) => {
            const r = CONFLICT_RESOLUTION.find(x=>x.val===val);
            return (r?r.label:val)+(n>1?' ×'+n:'');
          }).join(', ');
        const hasBadConduct = conflict.some(e=>e.conduct==='angry'||e.conduct==='withdrawn');
        const conductNote = hasBadConduct ? ' — angry or withdrawn conduct logged.' : '.';
        return `Heavy conflict load ${periodRef} (${conflictLoad} pts)${resStr ? ': '+resStr : ''}${resStr ? '.' : conductNote}`;
      })()
    },
    {
      icon:'🩺', title:'Heavy steadying load', tone:'concern',
      test: S.showCaretaker && burnoutLoad >= 120,
      text: `Heavy steadying ${periodRef} (${burnoutLoad} pts) — watch your own resources going into the next period.`
    },
    {
      icon:'🌡️', title:'Low desire', tone:'concern',
      test: S.showPhysical && avgDesire !== null && avgDesire <= 2,
      text: `Low desire ${periodRef} (avg ${avgDesire?.toFixed(1)}/5) — the brake is engaged. Worth noting what's driving it.`
    },
    {
      icon:'🌹', title:'Solo without shared intimacy', tone:'concern',
      test: S.showPhysical && solo.length > 0 && physical.length === 0,
      text: `Solo only ${periodRef} with no shared intimacy — desire is present but not finding a path to connection.`
    },

    // ── My turn downs ─────────────────────────────────────────────────────
    {
      icon:'🌑', title:'Turning down for relational reasons', tone:'concern',
      test: S.showPhysical && (() => {
        const myTDs = turndown.filter(e=>e.initiatedBy==='me');
        const relational = myTDs.filter(e=>e.tdMyReason==='disconnected'||e.tdMyReason==='tension');
        return relational.length >= 2;
      })(),
      text: (() => {
        const myTDs = turndown.filter(e=>e.initiatedBy==='me');
        const relational = myTDs.filter(e=>e.tdMyReason==='disconnected'||e.tdMyReason==='tension');
        const reasons = relational.map(e=>TD_MY_REASONS.find(r=>r.val===e.tdMyReason)?.label||e.tdMyReason);
        const counts = {};
        reasons.forEach(r=>counts[r]=(counts[r]||0)+1);
        const summary = Object.entries(counts).map(([r,n])=>n>1?`${r} (×${n})`:r).join(', ');
        return `You turned ${P.obj} down ${relational.length} time${relational.length!==1?'s':''} for relational reasons ${periodRef} (${summary}) — worth noting what was building.`;
      })()
    },
    {
      icon:'🪫', title:'Turn-downs from depletion', tone:'concern',
      test: S.showPhysical && (() => {
        const myTDs = turndown.filter(e=>e.initiatedBy==='me');
        return myTDs.length >= 2 && myTDs.every(e=>e.tdMyReason==='depleted');
      })(),
      text: `You turned ${P.obj} down ${turndown.filter(e=>e.initiatedBy==='me').length} times ${periodRef}, all for depletion — your resource tank needs attention.`
    },

    // ── Mixed signals ────────────────────────────────────────────────────
    {
      icon:'🩺⚡', title:'Steadying alongside conflict', tone:'mixed',
      test: S.showCaretaker && (() => {
        const relBurnout = burnout.filter(e=>e.ctContext==='relationship');
        return relBurnout.length > 0 && conflict.length > 0;
      })(),
      text: `Steadying your partner alongside conflict ${periodRef} — both logged, personal and relational tracked separately.`
    },
    {
      icon:'🩺', title:'Steadying without a conflict entry', tone:'mixed',
      test: S.showCaretaker && burnout.some(e=>e.ctContext==='relationship') && conflict.length === 0,
      text: `Steadying your partner logged ${periodRef} without a conflict entry — if it escalated into conflict, consider adding one.`
    },
    {
      icon:'🩺🌊', title:'Steadying with self-care', tone:'mixed',
      test: S.showCaretaker && burnoutLoad >= 120 && restoreGood,
      text: `Heavy steadying alongside ${restore.length} restorative event${restore.length!==1?'s':''} ${periodRef} — good instinct to protect your resources.`
    },
    {
      icon:'⚡🌒', title:'Turn-downs followed conflict', tone:'concern',
      test: S.showPhysical && (() => {
        const conflictDates = new Set(conflict.map(e=>e.date));
        return turndown.filter(e=>e.initiatedBy==='her').some(e =>
          conflictDates.has(e.date) || conflictDates.has(addDays(e.date,-1))
        );
      })(),
      text: `Turn-downs followed conflict on the same or next day ${periodRef} — the two events overlapped.`
    },
    {
      icon:'🌹', title:'Intimacy without '+bondingLabel().toLowerCase(), tone:'mixed',
      test: S.showPhysical && physical.length > 0 && affection.length === 0,
      text: `Physical intimacy without logged ${bondingLabel().toLowerCase()} ${periodRef} — unusually direct path.`
    },
    {
      icon:'🩷', title:bondingLabel()+' without intimacy', tone:'mixed',
      test: S.showPhysical && physical.length === 0 && affection.length >= 2,
      text: `${bondingLabel()} without physical intimacy ${periodRef} — connection is present but the bridge hasn't closed.`
    },

    // ── Positive signals ─────────────────────────────────────────────────
    {
      icon:'📈', title:'Balance in thriving range', tone:'positive',
      test: weekBal !== null && weekBal >= zones.thriving,
      text: `Relational balance ended ${periodRef} at +${weekBal?.toFixed(0)} — in the thriving range. The connection is tracking well.`
    },
    {
      icon:'🩷🌹', title:'A good week', tone:'positive',
      test: S.showPhysical && physical.length >= 2 && affection.length >= 2 && conflict.length === 0 && (!S.showCaretaker || burnoutLoad <= 30) && (!S.showRegulation || wobbleLoad <= 20),
      text: `A genuinely good ${'period'} — connection on both sides, no conflict, light load throughout.`
    },
    {
      icon:'✨', title:'Conditions aligned', tone:'positive',
      test: S.showPhysical && physical.length >= 1 && avgDesire !== null && avgDesire >= 3.5 && (!S.showCaretaker || burnoutLoad <= 50) && conflict.length === 0,
      text: `Conditions aligned ${periodRef} — desire up, load light, intimacy present.`
    },
    {
      icon:'🩷→🌹', title:bondingLabel()+'-to-intimacy flow', tone:'positive',
      test: S.showPhysical && affection.length >= 3 && physical.length >= 1,
      text: `Good ${bondingLabel().toLowerCase()}-to-intimacy flow ${periodRef} — the connection-first pattern working as it should.`
    },
    {
      icon:'🌡️', title:'High desire', tone:'positive',
      test: S.showPhysical && avgDesire !== null && avgDesire >= 4.5,
      text: `High desire ${periodRef} (avg ${avgDesire?.toFixed(1)}/5) — context is working in your favour.`
    },
    {
      icon:'🌊', title:'Good restoration', tone:'positive',
      test: restore.length >= 2 && burnoutLoad <= 30 && restoreGood,
      text: `Good restoration ${periodRef} — ${restore.length} restorative events with low steadying load.`
    },
    {
      icon:'🌤️', title:'No wobble', tone:'positive',
      test: S.showRegulation && wobbleLoad === 0 && prevWobbleLoad > 0,
      text: `No wobble logged ${periodRef}, down from last week. A steadier personal stretch.`
    },
    {
      icon:'⚖️', title:'Restore matched drain', tone:'positive',
      test: S.showRegulation && wobbleLoad > 0 && restorePts > 0 && restorePts >= wobbleLoad,
      text: `Restore kept pace with wobble drain ${periodRef} (+${restorePts} vs -${wobbleLoad} pts) — good resource management.`
    },
    {
      icon:'🌤️', title:'No steadying', tone:'positive',
      test: S.showCaretaker && burnoutLoad === 0 && prevBurnoutLoad > 0,
      text: `No steadying moments ${periodRef}, down from last period. A lighter week.`
    },
  ];

  const matched = candidates.filter(c => c.test).slice(0, 3);
  const observationEl = matched.length > 0
    ? matched.map(c => h('p',{style:{margin:'0 0 6px 0'}}, c.text))
    : [h('p',{style:{margin:'0'}}, weekEntries.length === 0
        ? 'Nothing logged this week yet.'
        : `A quiet ${'period'} — no notable patterns to flag.`)];

  // Card-format render for the new always-visible Observations section.
  // Mirrors the visual structure of the Correlations cards (icon + title +
  // body + colored border) but without the strength badge or sample size,
  // since these are threshold alerts rather than statistical patterns.
  const observationCardsEl = (() => {
    if (matched.length === 0) {
      return h('div',{style:{
        background:'var(--bg2)',border:'1px solid var(--border)',
        borderRadius:'12px', padding:'12px 14px',
        fontSize:'12px',color:'var(--muted)',fontStyle:'italic',lineHeight:'1.6',
      }}, weekEntries.length === 0
        ? 'Nothing logged this week yet.'
        : `A quiet ${periodRef} — no notable patterns to flag.`);
    }
    const borderForTone = (tone) => {
      if (tone === 'positive') return 'var(--c-partner-subtle)';
      if (tone === 'critical') return 'var(--c-conflict-border)';
      return 'var(--border)';  // concern + mixed = neutral border
    };
    return h('div',{},
      ...matched.map(c => h('div',{style:{
        background:'var(--bg2)',
        border:'1px solid '+borderForTone(c.tone),
        borderRadius:'12px', padding:'10px 12px', marginBottom:'6px',
        display:'flex', gap:'10px', alignItems:'flex-start',
      }},
        h('span',{style:{fontSize:'18px',flexShrink:'0',lineHeight:'1.4'}}, c.icon || '·'),
        h('div',{style:{flex:'1',minWidth:'0'}},
          h('div',{style:{
            fontSize:'13px',fontFamily:"'Libre Baskerville',serif",color:'var(--text)',marginBottom:'3px',
          }}, c.title || 'Observation'),
          h('div',{style:{fontSize:'12px',color:'var(--muted)',lineHeight:'1.5'}}, c.text)
        )
      ))
    );
  })();

  const turndownByWho = {
    me:  turndown.filter(e=>e.initiatedBy==='me').length,
    her: turndown.filter(e=>e.initiatedBy==='her').length,
  };

  const hasData = weekEntries.length > 0;
  const totalLoad = conflictLoad + burnoutLoad + turndownLoad + wobbleLoad + caretakerPersonalLoad;
  const prevTotalLoad = prevConflictLoad + prevBurnoutLoad + prevTurndownLoad + prevWobbleLoad;

  const soloIntensity   = avg(solo.filter(e=>e.intensity).map(e=>e.intensity));

  const fmtLoad = (count, load, prevLoad, ptsColor) => {
    if (count === 0) return h('span',{class:'week-row-value',style:{color:'var(--muted)'}},'—');
    const vsText = prevLoad > 0 && load !== prevLoad
      ? h('span',{style:{color: load < prevLoad ? 'var(--c-partner)':'var(--c-warning)',fontSize:'11px',marginLeft:'6px'}},
          `${load < prevLoad ? '↓':'↑'} from ${prevLoad}`)
      : null;
    const loadColor = ptsColor || (load <= 25 ? 'var(--c-partner)' : load <= 60 ? 'var(--c-burnout)' : 'var(--c-warning)');
    return h('span',{class:'week-row-value'},
      h('span',{style:{color:'var(--text)'}},' '+count),
      h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ` events · `),
      h('span',{style:{color:loadColor}}, load+' pts'),
      vsText
    );
  };

  return h('div',{},
    // observationCards mode: skip the week-nav header and just return the cards
    // for use in the always-visible Observations section on the Insights tab
    (mode === 'observationCards') ? observationCardsEl :
    h('div',{class:'week-nav'},
      h('div',{class:'week-nav-title'}, label)
    ),

    !hasData
      ? h('div',{class:'ins-empty',style:{marginTop:'40px'}}, 'Nothing logged in this window.')
      : (mode === 'observationCards') ? null : h('div',{},

        // Observation
        (mode === 'full' || mode === 'observationOnly') ? h('div',{class:'week-observation'},
          h('div',{class:'week-observation-label'}, label),
          h('div',{class:'week-observation-text'},...observationEl)
        ) : null,

        // Connection
        (mode === 'full' || mode === 'cardsOnly') ? h('div',{class:'week-summary-card'},
          h('div',{class:'week-summary-title'},'Connection'),
          S.showPhysical ? h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🌹 Shared intimacy'),
            h('span',{class:'week-row-value',style:{color:CAT_COLORS.physical}},
              physical.length,
              (() => {
                const avgQ = avg(physical.filter(e=>e.connectionQuality).map(e=>e.connectionQuality));
                if (!avgQ) return null;
                const lbl = avgQ>=4.5?'Peak':avgQ>=3.5?'Meaningful':avgQ>=2.5?'Warm':avgQ>=1.5?'Routine':'Missed';
                return h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ` · avg ${lbl}`);
              })(),
              vsLabel(physical.length, prevPhysical.length))
          ) : null,
          S.showPhysical && solo.length > 0 ? h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🌹 Solo'),
            h('span',{class:'week-row-value',style:{color:CAT_COLORS.physical,opacity:'0.7'}},
              solo.length,
              soloIntensity !== null ? h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ` · avg ${soloIntensity.toFixed(1)}★`) : null
            )
          ) : null,
          h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🩷 '+bondingLabel()),
            h('span',{class:'week-row-value',style:{color:CAT_COLORS.affection}},
              affection.length,
              (() => {
                const avgQ = avg(affection.filter(e=>e.connectionQuality).map(e=>e.connectionQuality));
                if (!avgQ) return null;
                const lbl = avgQ >= 4.5 ? 'Peak' : avgQ >= 3.5 ? 'Meaningful' : avgQ >= 2.5 ? 'Warm' : avgQ >= 1.5 ? 'Routine' : 'Missed';
                return h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ` · avg ${lbl}`);
              })(),
              (() => {
                const winLibido = weekEntries.filter(e=>e.category==='libido');
                const totalPts = Math.round(affection.reduce((s,e)=>{
                  const cap = bankDayCap(winLibido.find(le=>le.date===e.date));
                  return s + bankScoreEntry(e,cap).score;
                },0)*10)/10;
                const top = affection.length > 0
                  ? affection.reduce((best,e)=>{
                      const cap = bankDayCap(winLibido.find(le=>le.date===e.date));
                      const capB = bankDayCap(winLibido.find(le=>le.date===best.date));
                      return bankScoreEntry(e,cap).score > bankScoreEntry(best,capB).score ? e : best;
                    })
                  : null;
                return h('span',{style:{color:'var(--muted)',fontSize:'12px'}},
                  ` · ${totalPts} pts` + (top&&top.eventType ? ` · top: ${top.eventType}` : ''));
              })(),
              vsLabel(affection.length, prevAffection.length))
          ),
          S.showPhysical && turndown.length > 0 ? h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🌒 Turn downs'),
            h('span',{class:'week-row-value',style:{color:CAT_COLORS.turndown}},
              turndown.length,
              h('span',{class:'week-vs'},
                [
                  turndownByWho.her > 0 ? `${turndownByWho.her} by ${P.obj}` : null,
                  turndownByWho.me  > 0 ? `${turndownByWho.me} by me`  : null,
                ].filter(Boolean).join(', ')
              ),
              turndownLoad > 0 ? h('span',{style:{color:'var(--muted)',fontSize:'12px',marginLeft:'4px'}}, ` · ${turndownLoad} pts (her)`) : null
            )
          ) : null,
          S.showPhysical && avgDesire !== null ? h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🌡️ Avg desire'),
            h('span',{class:'week-row-value',style:{color:CAT_COLORS.libido}},
              avgDesire.toFixed(1)+'/5')
          ) : null,
        ) : null,

        // Load
        (mode === 'full' || mode === 'cardsOnly') ? h('div',{class:'week-summary-card'},
          h('div',{class:'week-summary-title'},'Load'),
          h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'⚡ Conflicts'),
            conflict.length === 0
              ? h('span',{class:'week-row-value',style:{color:'var(--muted)'}},'—')
              : h('span',{class:'week-row-value'},
                  h('span',{style:{color:'var(--c-conflict)'}},' '+conflict.length),
                  h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ' events'),
                  vsLabel(conflict.length, prevConflict.length, false)
                )
          ),
          conflict.length > 0 ? h('div',{class:'week-row',style:{paddingTop:'4px'}},
            h('span',{class:'week-row-label',style:{fontSize:'11px'}},'Harm'),
            h('span',{style:{fontSize:'11px',color:'var(--muted)',textAlign:'right',flex:'1'}},
              (() => {
                const withHarm = conflict.filter(e=>e.harm);
                if (!withHarm.length) return 'No harm logged';
                const avgHarm = withHarm.reduce((s,e)=>s+e.harm,0) / withHarm.length;
                const label = CONFLICT_HARM.find(h2=>h2.val===Math.round(avgHarm))?.label || '';
                return `avg ${avgHarm.toFixed(1)} — ${label}`;
              })()
            )
          ) : null,
          conflict.length > 0 ? h('div',{class:'week-row',style:{paddingTop:'4px'}},
            h('span',{class:'week-row-label',style:{fontSize:'11px'}},'Conduct'),
            h('span',{style:{fontSize:'11px',color:'var(--muted)',textAlign:'right',flex:'1'}},
              (() => {
                const withConduct = conflict.filter(e=>e.conduct);
                if (!withConduct.length) return 'No conduct logged';
                const counts = {};
                for (const e of withConduct) counts[e.conduct] = (counts[e.conduct]||0)+1;
                return Object.entries(counts)
                  .sort((a,b)=>b[1]-a[1])
                  .map(([val,n]) => {
                    const c = CONFLICT_CONDUCT.find(x=>x.val===val);
                    return (c?c.label:val)+(n>1?' ×'+n:'');
                  }).join(', ');
              })()
            )
          ) : null,
          conflict.length > 0 ? h('div',{class:'week-row',style:{paddingTop:'4px'}},
            h('span',{class:'week-row-label',style:{fontSize:'11px'}},'Resolution'),
            h('span',{style:{fontSize:'11px',color:'var(--muted)',textAlign:'right',flex:'1'}},
              (() => {
                const withRes = conflict.filter(e=>e.resolution);
                if (!withRes.length) return 'No resolution logged';
                const counts = {};
                for (const e of withRes) counts[e.resolution] = (counts[e.resolution]||0)+1;
                return Object.entries(counts)
                  .sort((a,b)=>b[1]-a[1])
                  .map(([val,n]) => {
                    const r = CONFLICT_RESOLUTION.find(x=>x.val===val);
                    return (r?r.label:val)+(n>1?' ×'+n:'');
                  }).join(', ');
              })()
            )
          ) : null,
          S.showCaretaker ? h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🕯️ Steadying'),
            burnout.length === 0
              ? h('span',{class:'week-row-value',style:{color:'var(--muted)'}},'—')
              : h('span',{class:'week-row-value'},
                  h('span',{style:{color:'var(--c-burnout)'}},' '+burnout.length),
                  h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ' events'),
                  vsLabel(burnout.length, prevBurnout.length, false)
                )
          ) : null,
          S.showCaretaker && burnout.length > 0 ? h('div',{class:'week-row',style:{paddingTop:'4px'}},
            h('span',{class:'week-row-label',style:{fontSize:'11px'}},'Types'),
            h('span',{style:{fontSize:'11px',color:'var(--muted)',textAlign:'right',flex:'1'}},
              (() => {
                const typeCounts = {};
                for (const e of burnout) {
                  const types = Array.isArray(e.caretakerTypes) && e.caretakerTypes.length ? e.caretakerTypes
                    : e.caretakerType ? [e.caretakerType]
                    : (Array.isArray(e.burnoutTypes) ? e.burnoutTypes : (e.burnoutType ? [e.burnoutType] : [])).map(t=>burnoutLabel(BURNOUT_LEGACY[t]||t).label);
                  if (types.length === 0) {
                    typeCounts['Untyped'] = (typeCounts['Untyped']||0) + 1;
                  } else {
                    for (const t of types) typeCounts[t] = (typeCounts[t]||0) + 1;
                  }
                }
                const hasRelationship = burnout.some(e => e.ctContext === 'relationship');
                const typeStr = Object.entries(typeCounts)
                  .sort((a,b)=>b[1]-a[1])
                  .map(([label, count]) => label + (count > 1 ? ' ×'+count : ''))
                  .join(', ');
                return typeStr + (hasRelationship ? ' · ⚠ My partner' : '');
              })()
            )
          ) : null,
          // Life Wobble
          S.showRegulation && regulation.length > 0 ? h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🫧 Life Wobble'),
            h('span',{class:'week-row-value'},
              h('span',{style:{color:CAT_COLORS.regulation}},' '+regulation.length),
              h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ' events'),
              (() => {
                const total = Math.round(regulation.reduce((s,e)=>{
                  const c = bankDayCap(weekEntries.find(le=>le.date===e.date&&le.category==='libido'));
                  return s+Math.abs(wobbleRestoreScore(e,c));
                },0));
                return total > 0 ? h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ' · -'+total+' pts') : null;
              })(),
              vsLabel(regulation.length, prevRegulation.length, false)
            )
          ) : null,
          S.showRegulation && regulation.length > 0 ? h('div',{class:'week-row',style:{paddingTop:'2px'}},
            h('span',{class:'week-row-label',style:{fontSize:'11px'}},'What / trigger'),
            h('span',{style:{fontSize:'11px',color:'var(--muted)',textAlign:'right',flex:'1'}},
              (() => {
                // Top emotions
                const allEmotions = regulation.flatMap(e=>e.regulationEmotions||[]);
                const emotionCounts = {};
                for (const em of allEmotions) emotionCounts[em] = (emotionCounts[em]||0)+1;
                const topEmotions = Object.entries(emotionCounts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([em])=>em);
                // Trigger split — merge legacy 'internal' into 'external' (personal)
                const rel = regulation.filter(e=>e.regulationTrigger==='relational').length;
                const personal = regulation.filter(e=>e.regulationTrigger==='external'||e.regulationTrigger==='internal').length;
                const triggerParts = [];
                if (rel > 0) triggerParts.push(rel+' relational');
                if (personal > 0) triggerParts.push(personal+' personal');
                const parts = [];
                if (topEmotions.length > 0) parts.push(topEmotions.join(', '));
                if (triggerParts.length > 0) parts.push(triggerParts.join(', '));
                return parts.join(' · ') || '—';
              })()
            )
          ) : null,
        ) : null,

        // Positive development
        (mode === 'full' || mode === 'cardsOnly') && ((S.showPhysical && physical.length > 0) || affection.length > 0 || restore.length > 0) ? h('div',{class:'week-summary-card',style:{borderColor:'var(--c-partner-faint)'}},
          h('div',{class:'week-summary-title',style:{color:'var(--c-partner)'}},'Positive development'),

          // Physical
          S.showPhysical ? h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🌹 Intimacy'),
            physical.length === 0
              ? h('span',{class:'week-row-value',style:{color:'var(--muted)'}},'—')
              : h('span',{class:'week-row-value'},
                  h('span',{style:{color:'var(--c-physical)'}},' '+physical.length),
                  h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ' events'),
                  vsLabel(physical.length, prevPhysical.length)
                )
          ) : null,

          // Bonding
          h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🩷 '+bondingLabel()),
            affection.length === 0
              ? h('span',{class:'week-row-value',style:{color:'var(--muted)'}},'—')
              : h('span',{class:'week-row-value'},
                  h('span',{style:{color:'var(--c-affection)'}},' '+affection.length),
                  h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ' events'),
                  vsLabel(affection.length, prevAffection.length)
                )
          ),

          // Affection detail — avg connection
          affection.length > 0 ? h('div',{class:'week-row',style:{paddingTop:'2px'}},
            h('span',{class:'week-row-label',style:{fontSize:'11px'}},'Avg connection'),
            h('span',{style:{fontSize:'11px',color:'var(--muted)',textAlign:'right',flex:'1'}},
              (() => {
                const withQ = affection.filter(e=>e.connectionQuality);
                if (!withQ.length) return '—';
                const avgQ = withQ.reduce((s,e)=>s+e.connectionQuality,0) / withQ.length;
                const lbl = CONNECTION_QUALITY.find(q=>q.val===Math.round(avgQ));
                return avgQ.toFixed(1)+' — '+(lbl?lbl.label:'');
              })()
            )
          ) : null,

          // Restorative
          h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🌊 Restorative'),
            restore.length === 0
              ? h('span',{class:'week-row-value',style:{color:'var(--muted)'}},'—')
              : h('span',{class:'week-row-value'},
                  h('span',{style:{color:'var(--c-restore)'}},' '+restore.length),
                  h('span',{style:{color:'var(--muted)',fontSize:'12px'}}, ' events'),
                  vsLabel(restore.length, prevRestore.length)
                )
          ),

          // Restore detail
          restore.length > 0 ? h('div',{class:'week-row',style:{paddingTop:'2px'}},
            h('span',{class:'week-row-label',style:{fontSize:'11px'}},'Immersion · Quality'),
            h('span',{style:{fontSize:'11px',color:'var(--muted)',textAlign:'right',flex:'1'}},
              (() => {
                const avgI = avg(restore.map(e=>e.restoreImmersion||3));
                const avgQ = avg(restore.map(e=>migrateRestoreQuality(e.restoreQuality,e)).filter(Boolean));
                const iLbl = avgI===null?null:avgI>=4.5?'Full immersion':avgI>=3.5?'Deep':avgI>=2.5?'Engaged':avgI>=1.5?'Light':'Dipped in';
                const qLbl = avgQ===null?null:avgQ>=4.5?'Fully':avgQ>=3.5?'Well':avgQ>=2.5?'Somewhat':avgQ>=1.5?'A little':'Not at all';
                return [iLbl,qLbl].filter(Boolean).join(' · ') || '—';
              })()
            )
          ) : null,

          // Personal drain vs restore net (wobble + caretaker)
          (S.showRegulation || S.showCaretaker) && (restore.length > 0 || regulation.length > 0 || burnout.length > 0) ? h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'Personal drain'),
            (() => {
              const wobbleCost = regulation.reduce((s,e)=>{
                const c = bankDayCap(weekEntries.find(le=>le.date===e.date&&le.category==='libido'));
                return s+Math.abs(wobbleRestoreScore(e,c));
              },0);
              const caretakerCost = burnout.reduce((s,e)=>{
                const c = bankDayCap(weekEntries.find(le=>le.date===e.date&&le.category==='libido'));
                return s+Math.abs(caretakerPersonalScore(e,c));
              },0);
              const totalDrain = Math.round(wobbleCost + caretakerCost);
              const net = restorePts - totalDrain;
              if (totalDrain === 0) return h('span',{class:'week-row-value',style:{color:'var(--muted)'}},'—');
              const parts = [];
              if (wobbleCost > 0) parts.push(Math.round(wobbleCost)+' wobble');
              if (caretakerCost > 0) parts.push(Math.round(caretakerCost)+' steadying');
              return h('span',{class:'week-row-value'},
                h('span',{style:{color:'var(--c-wobble)'}}, '-'+totalDrain+' pts'),
                h('span',{style:{color:'var(--muted)',fontSize:'11px'}}, ' ('+parts.join(' + ')+')'),
                restorePts > 0 ? h('span',{style:{color:'var(--muted)',fontSize:'12px'}},
                  ' · net '+(net>=0?'+':'')+net) : null
              );
            })()
          ) : null,

          // Avg MED
          S.showPhysical ? (() => {
            const libiEntries = weekEntries.filter(e=>e.category==='libido'&&e.mood&&e.energy&&e.libiLevel);
            if (!libiEntries.length) return null;
            const avgMood   = libiEntries.reduce((s,e)=>s+e.mood,0)   / libiEntries.length;
            const avgEnergy = libiEntries.reduce((s,e)=>s+e.energy,0) / libiEntries.length;
            const avgDesireW= libiEntries.reduce((s,e)=>s+e.libiLevel,0) / libiEntries.length;
            return h('div',{class:'week-row',style:{borderTop:'1px solid var(--border)',marginTop:'4px',paddingTop:'10px'}},
              h('span',{class:'week-row-label'},'🌡️ Avg MED'),
              h('span',{class:'week-row-value'},
                h('span',{style:{fontSize:'12px',color:'#e8b87a'}}, 'M '+avgMood.toFixed(1)),
                h('span',{style:{fontSize:'12px',color:'#7ab8e8',marginLeft:'8px'}}, 'E '+avgEnergy.toFixed(1)),
                h('span',{style:{fontSize:'12px',color:'var(--c-libido)',marginLeft:'8px'}}, 'D '+avgDesireW.toFixed(1))
              )
            );
          })() : null

        ) : null
      )
  );
}

