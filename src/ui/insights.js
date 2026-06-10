'use strict';


/* ── INSIGHTS ENGINE ────────────────────────────────── */
// Last 7 days, today-inclusive — used by observation cards.
function getWindowEntries() {
  const cutoff = addDays(S.today, -6);
  return calcEntries().filter(e => e.date >= cutoff && e.date <= S.today);
}

// The 7 days before that, for "vs prev period" deltas.
function getPrevWindowEntries() {
  const end   = addDays(S.today, -7);
  const start = addDays(S.today, -14);
  return calcEntries().filter(e => e.date >= start && e.date < end);
}

function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }

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
      mood:                (es.find(e=>e.category==='libido')||{}).mood ?? null,
      energy:              (es.find(e=>e.category==='libido')||{}).energy ?? null,
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
        icon:'⛈️→❄️', title:'Conflict & turn downs',
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
        icon:'⛈️⛈️→❄️', title:'Conflict severity & turn downs',
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
        icon:'⛈️→🌡️', title:'Conflict & next-day desire',
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
        icon:'💨→🌡️', title:'Steadying & next-day desire',
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
        icon:'⛈️❄️→🌡️', title:'Relational friction & same-day desire',
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
        icon:'💨→🌡️🔍', title:'Steadying type & next-day desire',
        desc:`Next-day desire averages lowest after ${typeLabel(worst.type)} (${worst.avg.toFixed(1)}/5) `+
             `and highest after ${typeLabel(best.type)} (${best.avg.toFixed(1)}/5).`,
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
        icon:'💨💨→🌡️', title:'Consecutive steadying & desire',
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
        icon:'❄️→🌹', title:`How ${P.sub} turns you down & recovery time`,
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
        icon:'❄️→🌹', title:'Post-turndown coping',
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
          + (lowerOnTD ? ' Turn-down days have a noticeably lower average balance than other days.' : '')
        : 'Not enough data yet.';
      results.push({
        icon:'❄️↩', title:'Your turn downs & relational balance',
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
        icon:'🌊→💨', title:'Restorative activity & next-day steadying',
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
        icon:'❄️↩→💨', title:`Why you turn ${P.obj} down & next-day steadying`,
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
        icon:'❄️↩', title:'Your turn down reasons',
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
             (asymmetry >= 35 ? ' You\'re initiating the larger share.' : asymmetry <= -10 ? ` ${P.Sub} is initiating the larger share.` : ' Initiation is broadly balanced.'),
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
        icon:'🌪️→🌡️', title:'Wobble & next-day desire',
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
        icon:'🌪️→🌊', title:'Wobble days & restore activity',
        desc:`On wobble days, you logged restorative activity ${Math.round(rWith*100)}% of the time`+
             (rWithout!=null&&nonWobbleDays.length>=minSamples ? ` vs ${Math.round(rWithout*100)}% on other days.` : '.') +
             (rWith < 0.25 ? ' Wobble rarely triggers restoration.' : rWith >= 0.5 ? ' Good instinct — restoration is following wobble.' : ''),
        strength: lift>=2.0?'strong':lift>=1.3?'moderate':'weak',
        lowData: wobbleDays.length < 3,
        n: wobbleDays.length,
      });
    }
  }

  // 20b. Mood / energy decline trend — flags when this week's daily check-in
  // averages slip ≥1 point vs the prior week. A leading-edge signal that
  // often precedes drops in desire / rises in load.
  {
    const _meDays = 7;
    const _meCur  = addDays(S.today, -(_meDays - 1));
    const _mePrv  = addDays(S.today, -(_meDays * 2 - 1));
    const _libi   = e => e.category === 'libido';
    const curLib  = calcEntries().filter(e => _libi(e) && e.date >= _meCur && e.date <= S.today);
    const prvLib  = calcEntries().filter(e => _libi(e) && e.date >= _mePrv && e.date < _meCur);
    if (curLib.length >= 3 && prvLib.length >= 3) {
      const meanOf = (arr, k) => { const v = arr.map(e=>e[k]).filter(x=>x!=null); return v.length ? v.reduce((s,x)=>s+x,0)/v.length : null; };
      const cM = meanOf(curLib, 'mood'),   pM = meanOf(prvLib, 'mood');
      const cE = meanOf(curLib, 'energy'), pE = meanOf(prvLib, 'energy');
      const dM = (cM != null && pM != null) ? cM - pM : 0;
      const dE = (cE != null && pE != null) ? cE - pE : 0;
      const moodDrop   = dM <= -1.0;
      const energyDrop = dE <= -1.0;
      if (moodDrop || energyDrop) {
        const parts = [];
        if (moodDrop)   parts.push(`mood ${cM.toFixed(1)} vs ${pM.toFixed(1)}`);
        if (energyDrop) parts.push(`energy ${cE.toFixed(1)} vs ${pE.toFixed(1)}`);
        const both = moodDrop && energyDrop;
        const worst = Math.min(moodDrop ? dM : 0, energyDrop ? dE : 0);
        results.push({
          icon:'🌡️📉', title: both ? 'Mood and energy slipping' : moodDrop ? 'Mood slipping' : 'Energy slipping',
          desc: `Daily check-ins this week show ${parts.join(' and ')} (out of 5) vs the prior week. A leading-edge dip — often shows up before desire or load shifts.`,
          strength: both || worst <= -1.5 ? 'strong' : 'moderate',
          n: curLib.length,
        });
      }
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
          activated:  'Most leaned activating — energy mobilising more than collapsing.',
          withdrawal: 'Most leaned toward shutdown — energy collapsing more than mobilising.',
          mixed:      'A mix of activating and shutdown — no single direction dominated.',
        };

        const topToneCount = sortedTones[0][1];
        results.push({
          icon:'🌪️', title:'Tones in your wobbles',
          desc: `${toneIntro} ${leanText[topState]}`,
          strength: Math.round(topToneCount/total*100) >= 50 ? 'moderate' : 'weak',
          lowData: wobbleWithEmotions.length < 8,
          n: wobbleWithEmotions.length,
        });
      }
    }
  }

  // 21b. Body-family wobbles dominant — flags when physical/circumstantial
  // states (poor sleep, illness, pain, hormonal) are driving most of the
  // recent wobbles. The lever there is usually physical, not emotional.
  if (S.showRegulation) {
    const wobblesWithTone = winEntries.filter(e =>
      e.category === 'regulation' && Array.isArray(e.regulationEmotions) && e.regulationEmotions.length > 0
    );
    if (wobblesWithTone.length >= 5) {
      let bodyCount = 0;
      for (const e of wobblesWithTone) {
        if (entryDominantTone(e) === 'body') bodyCount++;
      }
      const bodyPct = bodyCount / wobblesWithTone.length;
      if (bodyCount >= 3 && bodyPct >= 0.4) {
        const pctRound = Math.round(bodyPct * 100);
        results.push({
          icon:'🛌🌪️', title:'Body load is driving wobbles',
          desc: `${pctRound}% of recent wobbles trace to Body tones (sleep, illness, pain, hormonal). When the body is depleted, the most useful lever tends to be physical — rest, food, recovery — rather than emotional regulation.`,
          strength: bodyPct >= 0.6 ? 'strong' : bodyPct >= 0.5 ? 'moderate' : 'weak',
          n: bodyCount,
        });
      }
    }
  }

  // 22. Tone shift across periods — compares current 7 days vs prior 7.
  //     Fixed 7-day frame: this is a recency-comparison signal, not a scoring window.
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
          const withdrawalTones = new Set(['sadness','shame','shutdown','body']);
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
            icon:'🌪️↕', title:'Tone shift across periods',
            desc: `The dominant tone in your wobbles has shifted from ${pLabel} to ${cLabel} this period. ${meaning}`,
            strength: shift >= 35 ? 'moderate' : 'weak',
            lowData: currWobble.length < 5,
            n: currWobble.length,
          });
        }
      }
    }
  }

  // 22b. Same tone dominating across multiple periods — flags a chronic
  // pattern where one family has been top for 3+ consecutive weeks.
  // Distinct from C22 (one-period snapshot) and C23 (week-vs-prior shift).
  if (S.showRegulation) {
    const PERIOD_DAYS = 7;
    const LOOKBACK_PERIODS = 4; // current + 3 prior
    const isToneWobble = e => e.category === 'regulation'
      && Array.isArray(e.regulationEmotions) && e.regulationEmotions.length > 0;
    const periodTops = [];
    for (let i = 0; i < LOOKBACK_PERIODS; i++) {
      const pEnd   = addDays(S.today, -(PERIOD_DAYS * i));
      const pStart = addDays(pEnd, -(PERIOD_DAYS - 1));
      const wobs = calcEntries().filter(e => isToneWobble(e) && e.date >= pStart && e.date <= pEnd);
      if (wobs.length < 2) { periodTops.push(null); continue; }
      const counts = {};
      for (const e of wobs) { const tv = entryDominantTone(e); if (tv) counts[tv] = (counts[tv]||0) + 1; }
      const top = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
      periodTops.push(top ? top[0] : null);
    }
    const currentTop = periodTops[0];
    let streak = 0;
    if (currentTop) {
      for (let i = 0; i < periodTops.length; i++) {
        if (periodTops[i] === currentTop) streak++;
        else break;
      }
    }
    if (streak >= 3) {
      const tone = EMOTION_TONES.find(t => t.val === currentTop);
      const label = tone ? tone.label : currentTop;
      results.push({
        icon:'🌪️🔁', title:'Same tone keeps showing up',
        desc: `${label} has been the top wobble tone for ${streak} weeks running. When one tone persists this long, the driver is usually recurring — worth looking at what keeps surfacing it.`,
        strength: streak >= 4 ? 'strong' : 'moderate',
        n: streak,
      });
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
            icon:'⛈️🌪️', title:'Tone after conflict',
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
          icon:'🌪️🌊', title:'What helps which tone',
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
        icon:'🌪️⏱', title:'How tones settle',
        desc: lines.join(' ') + ' Some tones move through quickly. Some need more time.',
        strength: toneAvgs.length >= 3 ? 'moderate' : 'weak',
        lowData: toneAvgs.every(t => t.n < 8),
        n: toneAvgs.reduce((s,t)=>s+t.n,0),
      });
    }
  }

  // 25b. Wobble resolution trend — comparing how readily wobbles settled
  // this week vs the prior week. Uses a binary good/not-good split
  // (resolved or coming-down vs the rest) so the wording is concrete.
  if (S.showRegulation) {
    const _rDays   = 7;
    const _rCurFrom = addDays(S.today, -(_rDays - 1));
    const _rPrvFrom = addDays(S.today, -(_rDays * 2 - 1));
    const _hasRes   = e => e.category === 'regulation' && e.regulationResolution;
    const _goodSet  = new Set(['resolved','coming-down']);
    const curStat = calcEntries().filter(e => _hasRes(e) && e.date >= _rCurFrom && e.date <= S.today)
                                  .map(e => e.regulationResolution);
    const prvStat = calcEntries().filter(e => _hasRes(e) && e.date >= _rPrvFrom && e.date < _rCurFrom)
                                  .map(e => e.regulationResolution);
    if (curStat.length >= 3 && prvStat.length >= 3) {
      const goodPct = arr => arr.filter(s => _goodSet.has(s)).length / arr.length;
      const cPct = goodPct(curStat);
      const pPct = goodPct(prvStat);
      const diff = cPct - pPct;
      if (Math.abs(diff) >= 0.20) {
        const better = diff > 0;
        const cR = Math.round(cPct * 100);
        const pR = Math.round(pPct * 100);
        results.push({
          icon: better ? '🌪️↘' : '🌪️↗',
          title: better ? 'Wobbles settling more' : 'Wobbles settling less',
          desc: better
            ? `${cR}% of recent wobbles reached "at peace" or "better" — up from ${pR}% the prior week. They're landing softer.`
            : `${cR}% of recent wobbles reached "at peace" or "better" — down from ${pR}% the prior week. They're staying heavier than the prior period.`,
          strength: Math.abs(diff) >= 0.35 ? 'strong' : 'moderate',
          n: curStat.length,
        });
      }
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
          icon:'🌪️🪫', title:'Capacity-tone correlation',
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

  // 27b. Horseman escalation — fires when a horseman appeared in more
  // conflicts this 7-day window than the prior 7-day window. Turns C28's
  // static horseman list into a trend signal so escalating patterns get
  // flagged.
  {
    const _hsDays   = 7;
    const _hsCurFrom = addDays(S.today, -(_hsDays - 1));
    const _hsPrvFrom = addDays(S.today, -(_hsDays * 2 - 1));
    const _isConf   = e => e.category === 'conflict';
    const _hasHM    = e => _isConf(e) && Array.isArray(e.horsemen) && e.horsemen.length > 0;
    const _curConf  = calcEntries().filter(e => _isConf(e) && e.date >= _hsCurFrom && e.date <= S.today);
    const _prvConf  = calcEntries().filter(e => _isConf(e) && e.date >= _hsPrvFrom && e.date < _hsCurFrom);
    const _curHm    = _curConf.filter(_hasHM);
    const _prvHm    = _prvConf.filter(_hasHM);
    // Require at least 3 horseman-tagged conflicts this period and at least
    // 2 conflicts last period, so the comparison reflects similar territory.
    if (_curHm.length >= 3 && _prvConf.length >= 2) {
      const curCounts = {}, prvCounts = {};
      for (const e of _curHm) for (const h of e.horsemen) curCounts[h] = (curCounts[h]||0) + 1;
      for (const e of _prvHm) for (const h of e.horsemen) prvCounts[h] = (prvCounts[h]||0) + 1;
      for (const [val, cur] of Object.entries(curCounts)) {
        const prv = prvCounts[val] || 0;
        const diff = cur - prv;
        if (cur >= 3 && diff >= 2) {
          const label = CONFLICT_HORSEMEN.find(h => h.val === val)?.label || val;
          const newPattern = prv === 0;
          results.push({
            icon:'🔄📈', title: newPattern ? `New pattern: ${label}` : `${label} showing up more`,
            desc: newPattern
              ? `${label} appeared in ${cur} conflicts this week — wasn't in your conflict log the prior week.`
              : `${label} appeared in ${cur} conflicts this week, up from ${prv} the prior week.`,
            strength: diff >= 3 ? 'strong' : 'moderate',
            n: cur,
          });
        }
      }
    }
  }

  // 28. Mood / energy as predictor — does a low check-in day forecast tomorrow's load?
  //     Days where (mood ≤ 2 OR energy ≤ 2) are flagged "low"; we look at the rate of
  //     conflict / turn-down / wobble on the *next* day vs days where both were ≥ 3.
  {
    const lowDays  = [];
    const highDays = [];
    for (const d of dates) {
      const s = signals[d];
      if (s.mood == null && s.energy == null) continue;
      const next = addDays(d, 1);
      if (!signals[next]) continue; // need a next-day record to compare
      const isLow  = (s.mood != null && s.mood <= 2) || (s.energy != null && s.energy <= 2);
      const isHigh = (s.mood == null || s.mood >= 3) && (s.energy == null || s.energy >= 3);
      if (isLow)  lowDays.push(next);
      else if (isHigh) highDays.push(next);
    }
    if (lowDays.length >= minSamples && highDays.length >= minSamples) {
      const rate = (arr, pred) => arr.filter(d => pred(signals[d])).length / arr.length;
      const stressorLow  = rate(lowDays,  s => s.hasConflict || s.hasTurndownByHer || s.hasWobble);
      const stressorHigh = rate(highDays, s => s.hasConflict || s.hasTurndownByHer || s.hasWobble);
      const diff = stressorLow - stressorHigh;
      if (diff >= 0.20) {
        const pctLow  = Math.round(stressorLow  * 100);
        const pctHigh = Math.round(stressorHigh * 100);
        results.push({
          icon:'🌡️→⛈️', title:'Low check-in days forecast harder next days',
          desc: `On days following a low mood/energy check-in (≤ 2/5), conflict/turn-down/wobble landed ${pctLow}% of the time — vs ${pctHigh}% after a steady check-in. The daily reading is doing predictive work.`,
          strength: diff >= 0.40 ? 'strong' : diff >= 0.30 ? 'moderate' : 'weak',
          n: lowDays.length,
        });
      }
    }
  }

  // 29. Time since last bonding → conflict / turn-down rate
  //     Compares friction rate on days that are far from the most recent bonding entry
  //     against days that are close to one.
  {
    let lastBondDate = null;
    const farDays = [], nearDays = [];
    for (const d of dates) {
      if (lastBondDate != null) {
        const gap = daysBetween(lastBondDate, d);
        if (gap >= 6) farDays.push(d);
        else if (gap <= 2) nearDays.push(d);
      }
      if (signals[d].hasAffection) lastBondDate = d;
    }
    if (farDays.length >= minSamples && nearDays.length >= minSamples) {
      const rate = (arr) => arr.filter(d => signals[d].hasConflict || signals[d].hasTurndownByHer).length / arr.length;
      const farRate  = rate(farDays);
      const nearRate = rate(nearDays);
      const diff = farRate - nearRate;
      if (diff >= 0.15) {
        const pctFar  = Math.round(farRate  * 100);
        const pctNear = Math.round(nearRate * 100);
        results.push({
          icon:'🩷⏳→⛈️', title:'Bonding gaps coincide with friction',
          desc: `Days that came 6+ days after a ${bondingLabel().toLowerCase()} entry saw conflict or turn-down ${pctFar}% of the time — vs ${pctNear}% on days that came within 2 days. Cadence appears to matter.`,
          strength: diff >= 0.30 ? 'strong' : diff >= 0.22 ? 'moderate' : 'weak',
          n: farDays.length,
        });
      }
    }
  }

  return results;
}

/* ── Forecast details modal ───────────────────────────────────────────────────────────────
 * Opened from the today card's "details" link per row. Shows the full breakdown of the
 * forecast for Relational / Personal / Tenor — zones, active storms, recent shock
 * contributions, methodology. Data is stashed on S._forecastDetailsData during the home
 * page render so this builder just reads from it. */
function buildForecastDetailsModal() {
  const data = S._forecastDetailsData;
  if (!data) {
    return overlay(h('div',{style:{padding:'20px',color:'var(--muted)'}},
      'Forecast details not available. Open the home page first.'));
  }
  const fmt = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + Math.round(n);
  const fmtPct = (p) => Math.round((p || 0) * 100) + '%';
  const zoneLabel = (key) => {
    const map = { thriving:'Thriving', healthy:'Healthy', progressing:'Progressing',
                  unsettled:'Unsettled', difficult:'Difficult', hurting:'Hurting' };
    return map[key] || key;
  };
  const sectionTitle = (txt) => h('div',{style:{
    fontSize:'10px', fontWeight:'600', letterSpacing:'0.07em', textTransform:'uppercase',
    color:'var(--muted)', marginTop:'16px', marginBottom:'6px',
  }}, txt);
  return overlay(h('div',{},
    h('div',{style:{
      fontSize:'18px', fontFamily:"'Libre Baskerville',serif",
      color:'var(--text-strong)', marginBottom:'4px',
    }}, "Today's forecast details"),
    h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'10px',fontStyle:'italic'}},
      'For today (' + data.todayDow + ')'),
    h('div',{style:{
      fontSize:'11px', color:'var(--muted)',
      borderLeft:'2px solid var(--c-warning)',
      paddingLeft:'10px', paddingTop:'2px', paddingBottom:'2px',
      marginBottom:'14px', lineHeight:'1.55', fontStyle:'italic',
    }},
      'Drawn from your recent patterns, not a prediction — the day ahead is yours to shape.'),
    // Per-balance summary — all three rows at once.
    sectionTitle('Balances'),
    h('div',{style:{
      display:'grid', gridTemplateColumns:'auto repeat(4, minmax(0,1fr))',
      gap:'4px 8px', fontSize:'11px', alignItems:'center',
    }},
      // Header row
      h('span',{}, ''),
      h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontSize:'9px',textTransform:'uppercase',letterSpacing:'0.05em'}}, 'Now'),
      h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontSize:'9px',textTransform:'uppercase',letterSpacing:'0.05em'}}, 'Morning'),
      h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontSize:'9px',textTransform:'uppercase',letterSpacing:'0.05em'}}, 'Forecast'),
      h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontSize:'9px',textTransform:'uppercase',letterSpacing:'0.05em'}}, 'Logged'),
      // Data rows
      ...data.values.flatMap(v => {
        const hi = Math.max(v.morning, v.lockedAfternoon);
        const lo = Math.min(v.morning, v.lockedAfternoon);
        const loggedStr = (v.loggedAmount > 0 ? '+' : '') +
          (Math.abs(v.loggedAmount) < 0.1 ? '0' : (Math.round(v.loggedAmount * 10) / 10));
        const valStyle = {textAlign:'right',fontFamily:"'Libre Baskerville', serif",color:'var(--text-strong)'};
        return [
          h('span',{style:{color:'var(--text)',fontSize:'11px'}},
            v.name + (v.zone ? ' · ' + zoneLabel(v.zone) : '')),
          h('span',{style:valStyle}, fmt(v.now)),
          h('span',{style:valStyle}, fmt(v.morning)),
          h('span',{style:valStyle}, fmt(lo) + ' / ' + fmt(hi)),
          h('span',{style:valStyle}, loggedStr),
        ];
      }),
    ),
    // Chart predictions — per-series probability for today's column (after shock/cap).
    data.chartPredictions && data.chartPredictions.length > 0 ? sectionTitle('Chart predictions') : null,
    data.chartPredictions && data.chartPredictions.length > 0 ? h('div',{},
      ...data.chartPredictions.map(p => {
        const subnote = p.cat === 'cloudcover' ? 'any negative event type'
                      : p.cat === 'precipitation' ? '2+ different event types same day'
                      : null;
        return h('div',{style:{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'6px 0', borderBottom:'1px solid var(--surface-2)', fontSize:'12px',
          gap:'8px',
        }},
          h('div',{style:{display:'flex', alignItems:'center', gap:'8px', flex:'1', minWidth:'0'}},
            h('div',{style:{width:'12px',height:'3px',background:p.fillColor,borderRadius:'1px',flexShrink:'0'}}),
            h('span',{style:{color:'var(--text)', whiteSpace:'nowrap'}}, p.label),
            subnote ? h('span',{style:{color:'var(--muted)', fontSize:'10px', fontStyle:'italic'}},
              '— ' + subnote) : null,
          ),
          h('span',{style:{color:'var(--text-strong)', fontFamily:"'Libre Baskerville', serif"}},
            fmtPct(p.todayProb)),
        );
      }),
    ) : null,
    // Possible Adverse Events — each combo's icon reflects its OWN balance's current zone.
    sectionTitle('Possible adverse events'),
    h('div',{},
      ...(data.combos || []).map(c => {
        const totalProb = Math.max(0, Math.min(1, (c.prob || 0) + (c.shock || 0)));
        const isActive = totalProb > 0;
        return h('div',{style:{
          display:'flex', alignItems:'center', gap:'10px',
          padding:'8px 0', borderBottom:'1px solid var(--surface-2)',
          opacity: isActive ? '1' : '0.55',
        }},
          h('span',{style:{fontSize:'24px', minWidth:'34px', textAlign:'center'}}, c.icon || '·'),
          h('div',{style:{flex:'1'}},
            h('div',{style:{
              fontSize:'12px', color:'var(--text-strong)',
              textTransform:'capitalize',
            }}, c.combo + ' · ' + c.label),
          ),
          h('div',{style:{textAlign:'right'}},
            h('div',{style:{fontSize:'12px', color:'var(--text-strong)', fontFamily:"'Libre Baskerville',serif"}},
              fmtPct(totalProb)),
          ),
        );
      })
    ),
    h('button',{
      style:{
        marginTop:'18px', width:'100%', padding:'10px',
        background:'var(--bg3)', border:'1px solid var(--border)',
        borderRadius:'10px', color:'var(--text)', fontSize:'13px',
        fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
      },
      onclick:()=>{ closeModal(); },
    }, 'Close'),
  ));
}

// ── Storm metaphor constants (file-scope so home and past-weather charts share them) ──
const STORM_MATRIX = {
  conflict: {
    thriving:    { icon: '⛈️',   label: 'Light storm' },
    healthy:     { icon: '⛈️',   label: 'Storm' },
    progressing: { icon: '⛈️',   label: 'Heavy storm' },
    unsettled:   { icon: '⛈️',   label: 'Thunderstorm' },
    difficult:   { icon: '⛈️',   label: 'Severe thunderstorm' },
    hurting:     { icon: '⛈️⚠️', label: 'Severe thunderstorm warning' },
  },
  wobble: {
    thriving:    { icon: '🌪️',   label: 'Slight whirl' },
    healthy:     { icon: '🌪️',   label: 'Whirling wind' },
    progressing: { icon: '🌪️',   label: 'Whirlwind' },
    unsettled:   { icon: '🌪️',   label: 'Strong whirlwind' },
    difficult:   { icon: '🌪️',   label: 'Tornado' },
    hurting:     { icon: '🌪️⚠️', label: 'Tornado warning' },
  },
  steadying: {
    thriving:    { icon: '💨',    label: 'Breezy' },
    healthy:     { icon: '💨',    label: 'Gusty' },
    progressing: { icon: '💨',    label: 'Wind advisory' },
    unsettled:   { icon: '💨',    label: 'Strong winds' },
    difficult:   { icon: '💨',    label: 'Gale warning' },
    hurting:     { icon: '💨⚠️',  label: 'High wind warning' },
  },
  turndown: {
    thriving:    { icon: '❄️',   label: 'Chilly' },
    healthy:     { icon: '❄️',   label: 'Cold' },
    progressing: { icon: '❄️',   label: 'Frost advisory' },
    unsettled:   { icon: '❄️',   label: 'Frost warning' },
    difficult:   { icon: '❄️',   label: 'Freezing rain' },
    hurting:     { icon: '❄️⚠️', label: 'Ice storm warning' },
  },
  friction: {
    thriving:    { icon: '🌧️',   label: 'Drizzle' },
    healthy:     { icon: '🌧️',   label: 'Light rain' },
    progressing: { icon: '🌧️',   label: 'Rain' },
    unsettled:   { icon: '🌧️',   label: 'Heavy rain' },
    difficult:   { icon: '🌧️',   label: 'Downpour' },
    hurting:     { icon: '🌧️⚠️', label: 'Flood warning' },
  },
};
const STORM_COMBO_META = {
  conflict:  { balance: 'rel', cat: 'conflict' },
  turndown:  { balance: 'rel', cat: 'turndown' },
  wobble:    { balance: 'per', cat: 'regulation' },
  steadying: { balance: 'per', cat: 'burnout' },
  friction:  { balance: 'rel', cat: 'friction' }, // Social negative — uses the rel slot in Individual mode
};
const STORM_PRIORITY = { conflict: 0, wobble: 1, steadying: 2, turndown: 3, friction: 4 };

// Registry of historical-chart scroll containers (Climate + Weather). When one
// scrolls, the others sync to the same fractional position so both charts move
// together. Stale entries (chart re-rendered) get cleaned up lazily on broadcast.
const _historicalScrollWraps = new Set();

// Text-width measurement cache — uses Canvas measureText for accurate pixel-perfect
// sizing of popup labels (per-char estimates miss real character widths).
const _textWidthCanvas = (() => {
  try { return document.createElement('canvas').getContext('2d'); } catch(_) { return null; }
})();
function measureTextWidth(text, fontSizePx, fontFamily) {
  if (!_textWidthCanvas) return (text || '').length * 7; // safe fallback
  _textWidthCanvas.font = fontSizePx + 'px ' + (fontFamily || "'DM Sans', sans-serif");
  return _textWidthCanvas.measureText(text || '').width;
}

// Per-zone storm-icon size multiplier. Bigger zones = bigger icons, so severity
// reads visually even for combos whose icon glyph doesn't change across tiers
// (wobble / turndown / steadying). Multipliers stay tight (±20%) so the icon
// row doesn't visually jump too much from day to day.
const STORM_ZONE_SIZE = {
  thriving:    0.70,
  healthy:     0.80,
  progressing: 0.90,
  unsettled:   1.00,
  difficult:   1.12,
  hurting:     1.24,
};

// Zone helpers — both need zones7 passed in (caller computes via getBounds()).
function _zoneIconFor(v, zones7) {
  if (v >= zones7.thriving)   return { icon:'☀️',  label:'Thriving',    color:'var(--c-partner)' };
  if (v >= zones7.stable)     return { icon:'🌤️', label:'Healthy',     color:'rgba(77,196,120,0.85)' };
  if (v >= 0)                 return { icon:'⛅',  label:'Progressing', color:'#a8b870' };
  if (v >= zones7.strained)   return { icon:'☁️',  label:'Unsettled',   color:'rgba(210,130,50,1)' };
  if (v >= zones7.depleted)   return { icon:'🌧️', label:'Difficult',   color:'var(--c-warning)' };
  return                              { icon:'⛈️', label:'Hurting',     color:'var(--c-conflict)' };
}
function _stormZoneKeyFor(v, zones7) {
  if (v >= zones7.thriving)   return 'thriving';
  if (v >= zones7.stable)     return 'healthy';
  if (v >= 0)                 return 'progressing';
  if (v >= zones7.strained)   return 'unsettled';
  if (v >= zones7.depleted)   return 'difficult';
  return                              'hurting';
}

// Daily-velocity zones — the same scale the Log page calendar uses for one-day deltas.
// Thresholds (calStable, calThriving) are smaller than the lifetime tenor zones since a
// day's contribution is bounded compared with the lifetime sum it feeds.
function _dailyZoneBounds() {
  const stable   = S.weights.calStable   || 11;
  const thriving = S.weights.calThriving || 25;
  return { thriving, stable, neutral:0, strained:-stable, depleted:-thriving };
}
function _dailyZoneIconFor(v, dz) {
  if (v >= dz.thriving)   return { icon:'☀️',  label:'Strong gain',  color:'var(--c-partner)' };
  if (v >= dz.stable)     return { icon:'🌤️', label:'Gain',         color:'rgba(77,196,120,0.85)' };
  if (v >= 0)             return { icon:'⛅',  label:'Slight gain',  color:'#a8b870' };
  if (v >= dz.strained)   return { icon:'☁️',  label:'Slight loss',  color:'rgba(210,130,50,1)' };
  if (v >= dz.depleted)   return { icon:'🌧️', label:'Loss',         color:'var(--c-warning)' };
  return                         { icon:'⛈️', label:'Heavy loss',   color:'var(--c-conflict)' };
}
function _dailyStormZoneKeyFor(v, dz) {
  if (v >= dz.thriving)   return 'thriving';
  if (v >= dz.stable)     return 'healthy';
  if (v >= 0)             return 'progressing';
  if (v >= dz.strained)   return 'unsettled';
  if (v >= dz.depleted)   return 'difficult';
  return                          'hurting';
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

  // Relational/Social & personal balance — lifetime sum via the active scoring model.
  // In Individual mode, the Social axis takes the slot Relational normally occupies;
  // we shadow relBal7 with the social value so downstream display code "just works."
  const expNow = computeExperimentalScores(S.today);
  const isIndHome = S.relationshipMode === 'individual';
  const relBal7 = Math.round(isIndHome ? (expNow.soc || 0) : expNow.rel);
  const perBal7 = Math.round(expNow.per);
  const socBal7 = Math.round(expNow.soc || 0);

  const hasEnoughData = allEntries.length >= 3;
  const loggedMoodToday = todayEs.some(e => e.category === 'libido');

  // Tenor zone for greeting card
  const zones7 = getBounds();
  // In Individual mode atmosphere = (soc + per) / 2; otherwise (rel + per) / 2.
  const tenorScore7 = hasEnoughData ? Math.round(((isIndHome ? (expNow.soc || 0) : expNow.rel) + expNow.per) / 2) : null;
  const zoneBand7 = tenorScore7 === null ? null
    : tenorScore7 >= zones7.thriving ? { label:'Thriving',  color:'var(--c-partner)' }
    : tenorScore7 >= zones7.stable   ? { label:'Healthy',   color:'rgba(77,196,120,0.85)' }
    : tenorScore7 >= 0               ? { label:'Progressing',   color:'#a8b870' }
    : tenorScore7 >= zones7.strained ? { label:'Unsettled', color:'rgba(210,130,50,1)' }
    : tenorScore7 >= zones7.depleted ? { label:'Difficult', color:'var(--c-warning)' }
    :                                  { label:'Hurting',   color:'var(--c-conflict)' };
  const daySeed = (function() { const [y,m,d]=S.today.split('-').map(Number); const s=new Date(y,m-1,d); return Math.floor((s-new Date(y,0,0))/(1000*60*60*24)); })();
  const pick = (arr) => arr[daySeed % arr.length];
  const zoneLines = {
    none: ['Log a few more days and your atmosphere will appear here.'],
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

  // Maps a score to a weather icon + label based on the active zones.
  const _zoneIcon = v =>
      v >= zones7.thriving  ? { icon:'☀️',  label:'Thriving',    color:'var(--c-partner)' }
    : v >= zones7.stable    ? { icon:'🌤️', label:'Healthy',     color:'rgba(77,196,120,0.85)' }
    : v >= 0                ? { icon:'⛅',  label:'Progressing', color:'#a8b870' }
    : v >= zones7.strained  ? { icon:'☁️',  label:'Unsettled',   color:'rgba(210,130,50,1)' }
    : v >= zones7.depleted  ? { icon:'🌧️', label:'Difficult',   color:'var(--c-warning)' }
    :                         { icon:'⛈️', label:'Hurting',     color:'var(--c-conflict)' };
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // ── Percent-chart prep (hoisted from the chart IIFE so the storm reading can use the same
  // window + DOW probability the chart shows). Computes:
  //   PCT_WINDOW         — shared lookback (min of big-event lifespan, days since first scored
  //                         entry, days since calcStartDate)
  //   computeDowPct(set) — per-day-of-week probability that a date is in `set`, over the window
  //   datesWithCatScored(cat) — set of dates where a scored (non-zero-point) entry of `cat`
  //                              exists, used to build per-series probability inputs
  const DOW_WINDOW = Math.max(7, Math.round(expLifespan(100)));
  const _dayCapByDate = {};
  for (const e of allEntries) {
    if (e.category === 'libido' && _dayCapByDate[e.date] === undefined) {
      _dayCapByDate[e.date] = bankDayCap(e);
    }
  }
  const _capFor = (date) => _dayCapByDate[date] ?? bankDayCap(null);
  const _hasPoints = (e) => {
    const { rel, per, soc } = expEntryScores(e, _capFor(e.date));
    return rel !== 0 || per !== 0 || (soc || 0) !== 0;
  };
  const datesWithCatScored = (cat) => {
    const s = new Set();
    for (const e of allEntries) {
      if (e.category === cat && _hasPoints(e)) s.add(e.date);
    }
    return s;
  };
  // Resolution → "recurrence weight" mapping. A well-resolved event contributes little to the
  // probability of another event of the same type happening in the future; a poorly-resolved
  // event contributes its full weight. Turndown is intentionally absent — it has no clean
  // "did this heal" axis, so turndown stays binary (any turndown = full weight).
  // Conflict and wobble share the same recurrence weights so equivalent tiers produce identical
  // outputs. Steadying is excluded — it's externally driven (caretaker load), so resolution
  // quality doesn't predict recurrence the way it does for relational or regulatory events.
  // Steadying events always carry full weight in the DOW pattern. Turndown also has no
  // resolution concept and stays at full weight.
  const RESOLUTION_RECURRENCE = {
    conflict: {
      breakthrough: 0.0,
      resolved:     0.2,
      partial:      0.5,
      unresolved:   0.8,
      worsened:     1.0,
    },
    regulation: { // wobble — aligned with conflict's scale
      'resolved':    0.0,
      'coming-down': 0.2,
      'still-on':    0.5,
      'no-better':   0.8,
      'heavier':     1.0,
    },
  };
  const _resolutionRecurrence = (e) => {
    const map = RESOLUTION_RECURRENCE[e.category];
    if (!map) return 1; // no resolution concept for this category — full weight
    const key = e.category === 'conflict'   ? e.resolution
              : e.category === 'regulation' ? e.regulationResolution
              : e.category === 'burnout'    ? e.caretakerOutcome
              : null;
    if (key == null) return 1; // missing resolution data on the entry — default to full weight
    return map[key] ?? 1;
  };
  // Returns a Map of date → max recurrence weight (across all scored events of `cat` on that
  // date). Replaces datesWithCatScored for categories where resolution should influence the
  // forecast — a worse resolution drags more predictive force into the future.
  const datesWithCatRecurrence = (cat) => {
    const m = new Map();
    for (const e of allEntries) {
      if (e.category !== cat) continue;
      if (!_hasPoints(e)) continue;
      const w = _resolutionRecurrence(e);
      const existing = m.get(e.date) ?? 0;
      if (w > existing) m.set(e.date, w);
    }
    return m;
  };
  let _firstScored = null;
  for (const e of allEntries) {
    if (e.date > S.today) continue;
    if (!_hasPoints(e)) continue;
    if (_firstScored === null || e.date < _firstScored) _firstScored = e.date;
  }
  const _daysSinceFirstScored = _firstScored ? Math.max(1, daysBetween(_firstScored, S.today)) : 0;
  const _daysSinceCalcStart   = S.calcStartDate ? Math.max(1, daysBetween(S.calcStartDate, S.today)) : Infinity;
  const PCT_WINDOW = _firstScored
    ? Math.min(DOW_WINDOW, _daysSinceFirstScored, _daysSinceCalcStart)
    : 0;
  // Recency-weighted DOW probability. Each day in the window is weighted by an exponential
  // half-life decay (default 14 days) — recent days dominate the average, older days fade but
  // still count. The weight is purely time-based (independent of event magnitude), so small
  // events still contribute to long-term weekly pattern visibility instead of dying with the
  // event's own decay. Probability = sum(weighted hits) / sum(weighted slots) per DOW.
  const DOW_HALFLIFE = S.weights.dowHalfLife ?? 14;
  const _dowRecencyK = Math.log(2) / Math.max(1, DOW_HALFLIFE);
  const computeDowPct = (datesOrMap) => {
    const out = {}; for (let d = 0; d < 7; d++) out[d] = 0;
    if (PCT_WINDOW === 0) return out;
    const stat = {}; for (let d = 0; d < 7; d++) stat[d] = { totalW: 0, hitW: 0 };
    const isMap = datesOrMap instanceof Map;
    for (let i = 1; i <= PCT_WINDOW; i++) {
      const dt  = addDays(S.today, -i);
      const dow = new Date(dt + 'T00:00:00').getDay();
      const w   = Math.exp(-_dowRecencyK * i);
      stat[dow].totalW += w;
      // hit ∈ [0,1] — binary for Sets, resolution-weighted for Maps.
      const hit = isMap ? (datesOrMap.get(dt) ?? 0) : (datesOrMap.has(dt) ? 1 : 0);
      stat[dow].hitW += w * hit;
    }
    for (let d = 0; d < 7; d++) out[d] = stat[d].totalW > 0 ? stat[d].hitW / stat[d].totalW : 0;
    return out;
  };

  // Storm metaphor constants live at file scope (STORM_MATRIX, STORM_COMBO_META, STORM_PRIORITY).
  // ZONE_BANDS stays local since only the home page's storm matrix debug uses it.
  const ZONE_BANDS = [
    { key: 'thriving',    label: 'Thriving',    icon: '☀️' },
    { key: 'healthy',     label: 'Healthy',     icon: '🌤️' },
    { key: 'progressing', label: 'Progressing', icon: '⛅' },
    { key: 'unsettled',   label: 'Unsettled',   icon: '☁️' },
    { key: 'difficult',   label: 'Difficult',   icon: '🌧️' },
    { key: 'hurting',     label: 'Hurting',     icon: '⛈️' },
  ];
  const _stormZoneKey = (v) => {
    if (v >= zones7.thriving)   return 'thriving';
    if (v >= zones7.stable)     return 'healthy';
    if (v >= 0)                 return 'progressing';
    if (v >= zones7.strained)   return 'unsettled';
    if (v >= zones7.depleted)   return 'difficult';
    return 'hurting';
  };
  const _todayDow = new Date(S.today + 'T00:00:00').getDay();
  // Storm zone scores = live current values (include today's logging). Option-C reactive:
  // logging today shifts the storm zone immediately, matching how real weather updates as
  // observations come in.
  // In Individual mode, the "rel" balance slot is filled by Social entries.
  // Storm icons gated on the rel zone need to read the social score so
  // friction icons size correctly against the user's actual Social balance.
  const _stormRelScore = ((S.relationshipMode === 'individual') ? (expNow.soc ?? 0) : (expNow.rel ?? 0));
  const _stormPerScore = (expNow.per ?? 0);
  // Per-combo state (probability today's DOW, zone for that balance excluding today's logging).
  // windowCount = total occurrences within PCT_WINDOW (used as first tiebreaker when two
  // combos have equal DOW probabilities for the same day).
  const _stormCombos = {};
  for (const combo of Object.keys(STORM_MATRIX)) {
    const meta = STORM_COMBO_META[combo];
    // Categories with a resolution field use the recurrence-weighted Map; others stay binary.
    const dates = RESOLUTION_RECURRENCE[meta.cat]
      ? datesWithCatRecurrence(meta.cat)
      : datesWithCatScored(meta.cat);
    const dowPct = computeDowPct(dates);
    let windowCount = 0;
    const iter = dates instanceof Map ? dates.keys() : dates;
    for (const dt of iter) {
      const d = daysBetween(dt, S.today);
      if (d >= 1 && d <= PCT_WINDOW) windowCount++;
    }
    const balVal = meta.balance === 'rel' ? _stormRelScore : _stormPerScore;
    const zoneKey = _stormZoneKey(balVal);
    _stormCombos[combo] = {
      dates, dowPct, windowCount,
      todayProb: dowPct[_todayDow] || 0,
      balance: meta.balance,
      balVal,
      zoneKey,
      reading: STORM_MATRIX[combo][zoneKey],
    };
  }
  // Tie-break order — uses file-scope STORM_PRIORITY.
  // Compare two combos for a given DOW; returns negative if a wins, positive if b wins.
  // Order: DOW prob desc → window count desc → STORM_PRIORITY asc.
  const _stormCompareForDow = (dow) => (a, b) => {
    const pa = _stormCombos[a].dowPct[dow] || 0;
    const pb = _stormCombos[b].dowPct[dow] || 0;
    if (pb !== pa) return pb - pa;
    const ca = _stormCombos[a].windowCount;
    const cb = _stormCombos[b].windowCount;
    if (cb !== ca) return cb - ca;
    return (STORM_PRIORITY[a] ?? 99) - (STORM_PRIORITY[b] ?? 99);
  };
  // ── 10-day forecast strip data (−2 ··· today ··· +7) ──────────────────
  // For each day d:
  //   morning   = "decay-only" value — what the score would be at end of d if nothing logged that day
  //   d_gain    = day's logging contribution (rel + per)
  //               · past:   actual sum of entries dated d
  //               · today:  DOW projection (LOCKED — logging today does not move the forecast line;
  //                         the "now" card shows actual. The line updates only when the day rolls
  //                         over and today becomes a past day.)
  //               · future: DOW average, ignoring zero-contribution days
  //   afternoon = morning + d_gain
  // Sub-daily shape: morning (low) → afternoon (peak) → evening (= afternoon for now).
  // Between days the line drops from afternoon_d to morning_(d+1), showing the
  // overnight decay naturally.
  const wxData = (() => {
    const allE = allEntries;
    const byDate = {};
    for (const e of allE) { (byDate[e.date] ||= []).push(e); }

    // Day's contribution = sum of expRemaining(score, 0) per series for entries dated d.
    // Returns null for an empty day so dow averaging can skip it.
    // In Individual mode, the "rel" slot is fed by Social — the rest of the
    // forecast pipeline uses .rel as its positive non-personal axis and just
    // works when we substitute soc here.
    const contributionOnDate = (date) => {
      const dayEs = byDate[date] || [];
      if (dayEs.length === 0) return null;
      const cap = bankDayCap(dayEs.find(le => le.category === 'libido'));
      let r = 0, p = 0;
      for (const e of dayEs) {
        const { rel, per, soc } = expEntryScores(e, cap);
        const primary = isIndHome ? (soc || 0) : rel;
        if (primary !== 0) r += expRemaining(primary, 0);
        if (per !== 0) p += expRemaining(per, 0);
      }
      if (r === 0 && p === 0) return null;
      return { rel: r, per: p };
    };

    // Per-day-of-week averages over the shared lookback (PCT_WINDOW), ignoring
    // zero-contribution days. PCT_WINDOW = min(max-event lifespan ≈63d, days
    // since first scored entry, days since calcStartDate) — so the window grows
    // with data up to the config-derived lifespan cap.
    const dowVals = {}; for (let d = 0; d < 7; d++) dowVals[d] = [];
    for (let i = 1; i <= PCT_WINDOW; i++) {
      const dt  = addDays(S.today, -i);
      const dow = new Date(dt + 'T00:00:00').getDay();
      const c   = contributionOnDate(dt);
      if (c) dowVals[dow].push(c);
    }
    const dowAvgs = {};
    for (let d = 0; d < 7; d++) {
      const vs = dowVals[d];
      dowAvgs[d] = {
        rel: vs.length ? vs.reduce((s, v) => s + v.rel, 0) / vs.length : 0,
        per: vs.length ? vs.reduce((s, v) => s + v.per, 0) / vs.length : 0,
      };
    }


    // Build each day's morning + d_gain + afternoon.
    const START_OFFSET = -2, END_OFFSET = 7;
    const out = [];
    for (let off = START_OFFSET; off <= END_OFFSET; off++) {
      const date = addDays(S.today, off);
      const dow  = new Date(date + 'T00:00:00').getDay();

      // Morning = lifetime sum at end of d *without* d's own contribution.
      // Past/today: computeExperimentalScores(d) − d's_actual_contribution.
      // Future: decay-only at d + expected logging from days strictly between today and d.
      const decayOnly = computeExperimentalScores(date);
      // In Individual mode the positive-non-personal axis is Social, not Relational.
      const decayPrim = isIndHome ? (decayOnly.soc || 0) : decayOnly.rel;
      let mornRel, mornPer;
      let gainRel, gainPer;

      if (off < 0) {
        // Past day — morning is decay-only (without that day's logging), afternoon is actual.
        const dayContrib = contributionOnDate(date) || { rel: 0, per: 0 };
        gainRel = dayContrib.rel;
        gainPer = dayContrib.per;
        mornRel = decayPrim - gainRel;
        mornPer = decayOnly.per - gainPer;
      } else if (off === 0) {
        // Today — REACTIVE. Morning still represents the pre-today state; the afternoon uses
        // today's actual logged contribution if any (so the line flexes with what you've done),
        // and falls back to the DOW projection when nothing has been logged yet today.
        const todayContrib = contributionOnDate(date) || { rel: 0, per: 0 };
        mornRel = decayPrim - todayContrib.rel;
        mornPer = decayOnly.per - todayContrib.per;
        gainRel = Math.abs(todayContrib.rel) >= 1 ? todayContrib.rel : dowAvgs[dow].rel;
        gainPer = Math.abs(todayContrib.per) >= 1 ? todayContrib.per : dowAvgs[dow].per;
      } else {
        // Future day — REACTIVE. Today's logged events propagate forward through decayOnly
        // normally (they're real history relative to future days), so the future morning is
        // simply decayOnly plus the expected contributions from intermediate days.
        let intermediateRel = 0, intermediatePer = 0;
        for (let f = 1; f < off; f++) {
          const futureDate = addDays(S.today, f);
          const fDow = new Date(futureDate + 'T00:00:00').getDay();
          const fRel = dowAvgs[fDow].rel;
          const fPer = dowAvgs[fDow].per;
          const ageAtTarget = off - f;
          if (Math.abs(fRel) >= 1) intermediateRel += expRemaining(fRel, ageAtTarget);
          if (Math.abs(fPer) >= 1) intermediatePer += expRemaining(fPer, ageAtTarget);
        }
        mornRel = decayPrim + intermediateRel;
        mornPer = decayOnly.per + intermediatePer;
        gainRel = dowAvgs[dow].rel;
        gainPer = dowAvgs[dow].per;
      }

      const aftRel = mornRel + gainRel;
      const aftPer = mornPer + gainPer;
      // Locked afternoon = the start-of-day DOW projection, regardless of what was logged.
      // Used by the today card's Low/High columns so they stay anchored to the forecast.
      // For past/future days it's the same as afternoon (no live/locked distinction needed).
      const lockedAftRel = off === 0 ? mornRel + dowAvgs[dow].rel : aftRel;
      const lockedAftPer = off === 0 ? mornPer + dowAvgs[dow].per : aftPer;

      out.push({
        date, offset: off, dow,
        isPast:  off < 0,
        isToday: off === 0,
        morning:         { rel: mornRel,      per: mornPer,      tenor: (mornRel + mornPer) / 2 },
        afternoon:       { rel: aftRel,       per: aftPer,       tenor: (aftRel  + aftPer)  / 2 },
        lockedAfternoon: { rel: lockedAftRel, per: lockedAftPer, tenor: (lockedAftRel + lockedAftPer) / 2 },
        gain:            { rel: gainRel,      per: gainPer },
      });
    }
    // Extra morning value for the day immediately after END_OFFSET — used by the score chart
    // line so it can extend to the morning of the day after the last visible column instead of
    // stopping at the last day's afternoon midpoint.
    const _extraOff = END_OFFSET + 1;
    const _extraDate = addDays(S.today, _extraOff);
    const _extraDecay = computeExperimentalScores(_extraDate);
    const _extraDecayPrim = isIndHome ? (_extraDecay.soc || 0) : _extraDecay.rel;
    let _extraInterRel = 0, _extraInterPer = 0;
    for (let f = 1; f < _extraOff; f++) {
      const fDate = addDays(S.today, f);
      const fDow  = new Date(fDate + 'T00:00:00').getDay();
      const ageAtTarget = _extraOff - f;
      if (Math.abs(dowAvgs[fDow].rel) >= 1) _extraInterRel += expRemaining(dowAvgs[fDow].rel, ageAtTarget);
      if (Math.abs(dowAvgs[fDow].per) >= 1) _extraInterPer += expRemaining(dowAvgs[fDow].per, ageAtTarget);
    }
    const extraMorning = {
      rel: _extraDecayPrim + _extraInterRel,
      per: _extraDecay.per + _extraInterPer,
    };
    return { days: out, dowAvgs, extraMorning };
  })();
  const wxDays    = wxData.days;
  const wxDowAvgs = wxData.dowAvgs;
  const wxExtraMorning = wxData.extraMorning;

  // ── Shock layer — recent conflict/wobble events boost the following days' probability ─
  // Each resolution tier has its own fade window: better resolutions die off faster.
  //   tier 1 (breakthrough/resolved-wobble, recurrence 0.0): no shock
  //   tier 2 (recurrence 0.2): active days 1–2 → zero by day 3
  //   tier 3 (recurrence 0.5): active days 1–3 → zero by day 4
  //   tier 4 (recurrence 0.8): active days 1–4 → zero by day 5
  //   tier 5 (recurrence 1.0): active days 1–5 → zero by day 6
  // Max day-1 boost is SHOCK_MAX × recurrence (33% × 1.0 = 33%). Linear fade within window.
  // Steadying is excluded (externally driven). Turndown also excluded.
  const SHOCK_MAX = 0.33;
  const _shockFadeWindow = (recurrence) => {
    if (recurrence >= 1.0) return 5;
    if (recurrence >= 0.8) return 4;
    if (recurrence >= 0.5) return 3;
    if (recurrence >= 0.2) return 2;
    return 0;
  };
  // Pre-extract candidate events once for combos that participate in shocks.
  const SHOCK_COMBOS = ['conflict', 'wobble'];
  const _shockEventsByCombo = { conflict: [], wobble: [] };
  for (const e of allEntries) {
    const meta = Object.entries(STORM_COMBO_META).find(([k]) =>
      SHOCK_COMBOS.includes(k) && STORM_COMBO_META[k].cat === e.category
    );
    if (!meta) continue;
    if (!_hasPoints(e)) continue;
    const age = daysBetween(e.date, S.today);
    if (age < 0) continue; // skip future-dated entries (shouldn't exist, defensive)
    // Cap at the longest possible reach. Today's events (age 0) flow into tomorrow's shock;
    // they get skipped per chart day when ageFromChartDay falls outside the tier window.
    if (age > 7) continue;
    _shockEventsByCombo[meta[0]].push({ age, recurrence: _resolutionRecurrence(e) });
  }
  const _shockForChartDay = (combo, offset) => {
    const events = _shockEventsByCombo[combo];
    if (!events || events.length === 0) return 0;
    let maxShock = 0;
    for (const ev of events) {
      const ageFromChartDay = offset + ev.age;
      if (ageFromChartDay < 1) continue;
      const win = _shockFadeWindow(ev.recurrence);
      if (win === 0 || ageFromChartDay > win) continue;
      const fade = (win - ageFromChartDay + 1) / win;
      const shock = SHOCK_MAX * ev.recurrence * fade;
      if (shock > maxShock) maxShock = shock;
    }
    return maxShock;
  };
  // Per-combo shock arrays — one entry per chart day in wxDays (indexed by position).
  // Steadying and turndown contribute zero; they don't drive shocks.
  const _shocksByCombo = { conflict: [], wobble: [], steadying: [], turndown: [] };
  for (const combo of Object.keys(_shocksByCombo)) {
    _shocksByCombo[combo] = wxDays.map(d =>
      SHOCK_COMBOS.includes(combo) ? _shockForChartDay(combo, d.offset) : 0
    );
  }
  // Aggregate shock for the Clouds (any 1 negative event) series — max across shock combos.
  const _aggregateShockByDay = wxDays.map((_, i) => Math.max(
    _shocksByCombo.conflict[i],
    _shocksByCombo.wobble[i],
  ));
  // Precipitation shock requires 2+ different event types with recent shock contributions.
  // (Precip = chance of 2+ negatives same day, so a single recent conflict shouldn't bump it.)
  // When the criterion is met, use the SECOND-highest shock — i.e. the limiting contribution
  // from the joining type, since both are required for the "2+" outcome.
  const _precipShockFor = (combos) => {
    const ss = combos.filter(s => s > 0);
    if (ss.length < 2) return 0;
    ss.sort((a, b) => b - a);
    return ss[1];
  };
  const _precipShockByDay = wxDays.map((_, i) => _precipShockFor(SHOCK_COMBOS.map(c => _shocksByCombo[c][i] || 0)));
  // Phantom-edge shocks (for buildPctLine's x=-0.5 and x=n+0.5 samples) so the chart line
  // doesn't snap flat at the edges.
  const _aggregateShockBefore = Math.max(
    _shockForChartDay('conflict', (wxDays[0]?.offset ?? 0) - 1),
    _shockForChartDay('wobble',   (wxDays[0]?.offset ?? 0) - 1),
  );
  const _aggregateShockAfter = Math.max(
    _shockForChartDay('conflict', (wxDays[wxDays.length - 1]?.offset ?? 0) + 1),
    _shockForChartDay('wobble',   (wxDays[wxDays.length - 1]?.offset ?? 0) + 1),
  );
  const _precipShockBefore = _precipShockFor(SHOCK_COMBOS.map(c =>
    _shockForChartDay(c, (wxDays[0]?.offset ?? 0) - 1)));
  const _precipShockAfter  = _precipShockFor(SHOCK_COMBOS.map(c =>
    _shockForChartDay(c, (wxDays[wxDays.length - 1]?.offset ?? 0) + 1)));

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
    nudges.push(card('🌡️', 'Daily check-in', 'Keeps your capacity score accurate.', 'var(--text)', 'var(--border)', 'var(--bg2)', ()=>openModal('libido')));

  const relThresh = zones7.stable;
  const perThresh = Math.round(zones7.stable / 2);

  // ── Bonding nudges / kudos ──
  if (hasEnoughData) {
    if (week7Bonding >= 4)
      kudos.push(card('🩷', 'Strong '+bondingLabel().toLowerCase()+' week', week7Bonding+' '+bondingLabel().toLowerCase()+' entries this week.', 'var(--c-affection)', 'rgba(224,133,184,0.25)', 'rgba(224,133,184,0.06)', goInsights));
    else if (week7Bonding >= 1)
      kudos.push(card('🩷', bondingLabel()+' showing up', week7Bonding+' '+bondingLabel().toLowerCase()+' entr'+(week7Bonding===1?'y':'ies')+' this week.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (daysSinceBonding !== null && daysSinceBonding >= 7)
      nudges.push(card('🩷', bondingLabel()+' gap — '+daysSinceBonding+' days', 'It\'s been a while since a '+bondingLabel().toLowerCase()+' entry.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
  }

  // ── Intimacy nudges / kudos ──
  if (S.showPhysical && hasEnoughData) {
    if (week7Physical >= 3)
      kudos.push(card('🌹', 'Intimate week', week7Physical+' shared intimacy events this week.', 'var(--c-physical)', 'rgba(224,122,74,0.25)', 'rgba(224,122,74,0.06)', goInsights));
    else if (daysSincePhysical !== null && daysSincePhysical >= 10 && recentTurndowns === 0) {
      const msg = week7Conflict >= 1
        ? daysSincePhysical+' days since last intimacy, and conflict logged this week.'
        : daysSincePhysical+' days since last intimacy.';
      nudges.push(card('🌹', daysSincePhysical+'d since last intimacy', msg, 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    }
  }

  // ── Restorative ──
  if (hasEnoughData) {
    if (week7Restore >= 2)
      kudos.push(card('🌊', 'Restoring well', week7Restore+' restorative activities this week.', 'var(--c-restore)', 'rgba(90,184,212,0.25)', 'rgba(90,184,212,0.06)', goInsights));
    else if (week7Restore === 1)
      kudos.push(card('🌊', 'Restorative activity logged', 'One restorative activity this week.', 'var(--c-restore)', 'rgba(90,184,212,0.20)', 'rgba(90,184,212,0.04)', goInsights));
    else if (daysSinceRestore !== null && daysSinceRestore >= 5 && (week7Wobble > 0 || week7Burnout > 0))
      nudges.push(card('🌊', 'Restore overdue', 'Wobble or steadying logged recently, with no restorative activity in '+daysSinceRestore+' days.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (daysSinceRestore !== null && daysSinceRestore >= 7)
      nudges.push(card('🌊', daysSinceRestore+' days since last restorative', 'No restorative activity logged this week.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
  }

  // ── Conflict ──
  if (hasEnoughData) {
    if (conflictToday && week7Bonding === 0)
      nudges.push(card('⛈️', 'Conflict logged today', 'No '+bondingLabel().toLowerCase()+' entries this week to balance it.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (conflictYest && !conflictToday && !conflictYestResolved)
      nudges.push(card('💬', 'Yesterday had conflict', 'Yesterday\'s conflict isn\'t marked resolved — the loop is still open.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (week7Conflict >= 3)
      nudges.push(card('⛈️', week7Conflict+' conflicts this week', 'A heavy week for conflict.', 'var(--c-conflict)', 'rgba(224,53,53,0.18)', 'rgba(224,53,53,0.05)', goInsights));
    else if (week7Conflict === 0 && last14.filter(e=>e.category==='conflict').length === 0 && allEntries.filter(e=>e.category==='conflict').length > 0)
      kudos.push(card('✨', 'Two weeks conflict-free', 'No conflict logged in 14 days.', 'var(--c-partner)', 'rgba(77,196,120,0.25)', 'rgba(77,196,120,0.06)', goInsights));
  }

  // ── Repair ──
  if (S.showRepair && hasEnoughData && repairToday)
    kudos.push(card('🤝', 'Repair logged today', 'Reconnection work tracked.', 'var(--c-partner)', 'rgba(77,196,120,0.20)', 'rgba(77,196,120,0.05)', goInsights));

  // ── Overall balance ──
  if (hasEnoughData) {
    if (relBal7 >= relThresh)
      kudos.push(card('💚', (isIndHome ? 'Social' : 'Relational')+' balance positive', 'Balance at +'+relBal7+'. Deposits are outpacing withdrawals.', 'var(--c-partner)', 'rgba(77,196,120,0.25)', 'rgba(77,196,120,0.06)', ()=>goInsightsMode('relational')));
    else if (relBal7 < -relThresh)
      nudges.push(card('📉', 'Balance running low', (isIndHome ? 'Social' : 'Relational')+' balance at '+relBal7+'. More withdrawals than deposits recently.', 'var(--text)', 'var(--border)', 'var(--bg2)', ()=>goInsightsMode('relational')));

    if (perBal7 >= perThresh)
      kudos.push(card('🌿', 'Personal tank healthy', 'Restore is outpacing drain this week.', 'var(--c-restore)', 'rgba(90,184,212,0.25)', 'rgba(90,184,212,0.06)', ()=>goInsightsMode('personal')));
    else if (perBal7 < -perThresh && week7Restore === 0)
      nudges.push(card('🪫', 'Personal tank depleted', 'Wobble or steadying load without restorative activity this week.', 'var(--text)', 'var(--border)', 'var(--bg2)', ()=>goInsightsMode('personal')));
  }

  // ── Steady / wellbeing ──
  if (S.showCaretaker && hasEnoughData) {
    if (week7Burnout >= 4 && week7Restore === 0)
      nudges.push(card('💨', 'Heavy steadying load', week7Burnout+' steadying entries this week with no restorative activity logged.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (week7Burnout >= 2 && week7Restore >= 1)
      kudos.push(card('💨', 'Caretaking with self-care', 'Steadying for others and restoring yourself this week.', 'var(--c-restore)', 'rgba(90,184,212,0.20)', 'rgba(90,184,212,0.04)', goInsights));
  }

  // ── New user ──
  if (!hasEnoughData)
    nudges.push(card('👋', 'Getting started', 'Log a few days and this page will start showing you patterns, nudges, and observations based on your data.'));

  const section = (items) => items.length > 0 ? h('div',{}, ...items) : null;

  // ── Quick-log chips ──
  const todayMoodEntry  = todayEs.find(e => e.category === 'libido');

  const quickRows = [
    [
      { icon:'🌡️', label:'Check-In',     key:'libido',    show: true },
      { icon:'🌿', label:'Notes',         key:'notes',     show: true },
      { icon:'🩷', label:bondingLabel(),  key:'affection', show: S.showBonding },
      { icon:'🫂', label:'Social',         key:'social',    show: S.relationshipMode === 'individual' },
      { icon:'🌧️', label:'Friction',       key:'friction',  show: S.relationshipMode === 'individual' },
    ],
    [
      { icon:'❄️', label:'Turn Down', key:'turndown', show: S.showPhysical },
      { icon:'🌹', label:'Intimacy',  key:'physical', show: S.showPhysical },
      { icon:'🌊', label:'Restore',   key:'restore',  show: true },
    ],
    [
      { icon:'🌪️', label:'Wobble', key:'regulation', show: S.showRegulation },
      { icon:'💨', label:'Steady', key:'burnout',   show: S.showCaretaker },
      { icon:'⛈️', label:'Conflict', key:'conflict', show: S.showConflict },
    ],
    [
      { icon:'🤝', label:'Repair',   key:'repair',   show: S.showRepair },
      { icon:'🔀', label:'Combined', key:'combined', show: S.showBonding },
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
          'Your Atmosphere is currently'),
        h('div',{style:{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}},
          tenorScore7 !== null ? h('span',{style:{fontSize:'30px',lineHeight:'1'}}, _zoneIcon(tenorScore7).icon) : null,
          h('span',{style:{fontFamily:"'Libre Baskerville',serif",fontSize:'28px',fontWeight:'400',color:zoneBand7?.color ?? 'var(--muted)',lineHeight:'1'}},
            zoneBand7 ? zoneBand7.label : '—'),
        ),
        h('div',{style:{fontSize:'12px',color:'var(--muted)',lineHeight:'1.5'}}, zoneNote),

        // Today's HIGH / LOW forecast per series, with actual when logged.
        // Low  = morning value (decay-only, what would be without today's logging)
        // High = afternoon value (morning + dow-average projection — LOCKED, ignores actual)
        // Actual = today's current lifetime sum (= computeExperimentalScores(today))
        // hasLogged is determined from real today entries, not by comparing rounded values
        // (rounding can make tenor flip 75 vs 74 even when nothing was logged).
        hasEnoughData && wxDays.length > 0 ? (() => {
          const todayDay = wxDays.find(d => d.isToday);
          if (!todayDay) return null;
          const fmt = (n) => (n >= 0 ? '+' : '') + Math.round(n);

          // Compute today's actual contribution per series from entries dated today.
          const todayEs = allEntries.filter(e => e.date === S.today);
          const todayCap = bankDayCap(todayEs.find(le => le.category === 'libido'));
          let todayLogRel = 0, todayLogPer = 0;
          for (const e of todayEs) {
            const { rel, per, soc } = expEntryScores(e, todayCap);
            // In Individual mode, social entries fill the "rel" slot.
            const primary = isIndHome ? (soc || 0) : rel;
            if (primary !== 0) todayLogRel += expRemaining(primary, 0);
            if (per !== 0) todayLogPer += expRemaining(per, 0);
          }
          const hasLoggedRel   = Math.abs(todayLogRel) >= 1;
          const hasLoggedPer   = Math.abs(todayLogPer) >= 1;
          const hasLoggedTenor = hasLoggedRel || hasLoggedPer;

          // Low/High = the two end-of-day bounds anchored on the LOCKED start-of-day projection
          // (not the live afternoon). Today's logging shifts the NOW value and the chart, but the
          // Low/High columns stay put so you can read "expected vs actual" without the forecast
          // moving toward your actual.
          const rng = (a, b) => ({ low: Math.min(a, b), high: Math.max(a, b) });
          const rRel = rng(todayDay.morning.rel,   todayDay.lockedAfternoon.rel);
          const rPer = rng(todayDay.morning.per,   todayDay.lockedAfternoon.per);
          const rTen = rng(todayDay.morning.tenor, todayDay.lockedAfternoon.tenor);
          const rows = [
            { name:'Atmosphere',                         key:'tenor', low:rTen.low, high:rTen.high, actual:tenorScore7, hasLogged:hasLoggedTenor },
            { name: isIndHome ? 'Social' : 'Relational', key:'rel',   low:rRel.low, high:rRel.high, actual:relBal7,     hasLogged:hasLoggedRel   },
            { name:'Personal',                           key:'per',   low:rPer.low, high:rPer.high, actual:perBal7,     hasLogged:hasLoggedPer   },
          ];
          // Stash data the Details modal will consume (today's chart day index, per-row breakdowns).
          const _todayChartIdx = wxDays.findIndex(d => d.isToday);
          // Unified forecast details. Each storm combo uses ITS OWN balance's zone (conflict
          // and turndown use the user's relational level; wobble and steadying use personal).
          const _relZoneKey = _stormZoneKey(_stormRelScore);
          const _perZoneKey = _stormZoneKey(_stormPerScore);
          const _comboInfo = (c) => {
            const meta = STORM_COMBO_META[c] || {};
            const ownZoneKey = meta.balance === 'rel' ? _relZoneKey : _perZoneKey;
            const reading = (STORM_MATRIX[c] && STORM_MATRIX[c][ownZoneKey]) || { icon:'', label:'' };
            return {
              combo: c,
              balance: meta.balance || '',
              prob: _stormCombos[c]?.todayProb || 0,
              label: reading.label,
              icon: reading.icon,
              shock: (_shocksByCombo[c] && _todayChartIdx >= 0) ? (_shocksByCombo[c][_todayChartIdx] || 0) : 0,
              zoneKey: ownZoneKey,
              windowCount: _stormCombos[c]?.windowCount || 0,
            };
          };
          S._forecastDetailsData = {
            todayDow: DAY_NAMES[_todayDow] || '',
            pctWindow: PCT_WINDOW,
            dowHalfLife: DOW_HALFLIFE,
            // Three balance summaries — one per row of the today card.
            values: [
              { name:'Atmosphere', balance:'tenor',
                now: tenorScore7, morning: todayDay.morning.tenor,
                lockedAfternoon: todayDay.lockedAfternoon.tenor,
                zone: null, hasLogged: hasLoggedTenor,
                loggedAmount: (todayLogRel + todayLogPer) / 2 },
              { name: isIndHome ? 'Social' : 'Relational', balance:'rel',
                now: relBal7, morning: todayDay.morning.rel,
                lockedAfternoon: todayDay.lockedAfternoon.rel,
                zone: _relZoneKey, hasLogged: hasLoggedRel, loggedAmount: todayLogRel },
              { name:'Personal',   balance:'per',
                now: perBal7, morning: todayDay.morning.per,
                lockedAfternoon: todayDay.lockedAfternoon.per,
                zone: _perZoneKey, hasLogged: hasLoggedPer, loggedAmount: todayLogPer },
            ],
            combos: ['conflict', 'turndown', 'wobble', 'steadying'].map(_comboInfo),
          };
          const headerCell = (txt, align = 'right') => h('div',{style:{
            fontSize:'9px', fontWeight:'600', letterSpacing:'0.07em', textTransform:'uppercase',
            color:'var(--muted)', textAlign: align, padding:'0 8px 6px',
          }}, txt);
          const valCell = (txt, opts = {}) => h('div',{style:{
            fontFamily:"'Libre Baskerville', serif",
            fontSize: opts.size || '15px',
            color: opts.color || 'var(--text-strong)',
            textAlign:'right', padding:'6px 8px',
            letterSpacing:'0.01em',
          }}, txt);
          // (Today card no longer renders a compound storm subtitle — the chart per-day icons
          // and the storm debug panel are the surfaces that consume the storm data now.)
          return h('div',{style:{
            marginTop:'12px', paddingTop:'10px',
            borderTop:'1px solid var(--surface-2)',
          }},
            // Card title (+ optional storm reading as subtitle)
            h('div',{style:{
              display:'flex', alignItems:'baseline', gap:'10px',
              marginBottom:'8px',
            }},
              h('span',{style:{
                fontSize:'10px', fontWeight:'600', letterSpacing:'0.07em', textTransform:'uppercase',
                color:'var(--muted)',
              }}, "Today's forecast"),
              h('button',{
                style:{
                  background:'none', border:'none', cursor:'pointer',
                  color:'var(--muted)', fontSize:'10px', fontStyle:'italic',
                  fontFamily:"'DM Sans', sans-serif",
                  textDecoration:'underline', padding:'0',
                },
                onclick:()=>{
                  S.modal = 'forecast-details';
                  render();
                },
              }, 'details'),
            ),
            h('div',{style:{
              display:'grid', gridTemplateColumns:'auto 1fr auto auto auto auto', alignItems:'center',
              columnGap:'4px',
            }},
            // Header row — Low / High over forecast bounds; Now spans the value + icon cols.
            h('div',{}),
            h('div',{}),
            headerCell('Low'),
            headerCell('High'),
            h('div',{style:{
              fontSize:'9px', fontWeight:'600', letterSpacing:'0.07em', textTransform:'uppercase',
              color:'var(--muted)', textAlign:'center', padding:'0 8px 6px',
              gridColumn:'span 2',
            }}, 'Now'),
            // One row per series
            ...rows.flatMap(r => {
              // Now always shows the current actual value with weather icon for that score.
              const zi = _zoneIcon(r.actual);
              // Column 2 holds the row's current zone label (Thriving / Healthy / etc.)
              // in the zone's color, so the user can read each balance's state at a glance.
              const statusCell = h('div', {style:{
                fontFamily:"'Libre Baskerville', serif", fontSize:'12px',
                fontStyle:'italic', color: zi.color, padding:'6px 6px 6px 4px',
              }}, zi.label);
              const nowValCell = h('div',{style:{
                fontFamily:"'Libre Baskerville', serif", fontSize:'18px',
                color:'var(--text-strong)', letterSpacing:'0.01em',
                textAlign:'right', padding:'6px 0 6px 8px',
              }}, fmt(r.actual));
              const nowIconCell = h('div',{style:{
                fontSize:'30px', lineHeight:'1', padding:'6px 8px 6px 4px',
              }}, zi.icon);
              return [
                h('div',{style:{
                  fontSize:'10px', fontWeight:'600', letterSpacing:'0.07em', textTransform:'uppercase',
                  color:'var(--muted)', padding:'6px 0',
                }}, r.name),
                statusCell,
                valCell(fmt(r.low),  { size:'13px', color:'var(--muted-2)' }),
                valCell(fmt(r.high), { size:'13px', color:'var(--muted-2)' }),
                nowValCell,
                nowIconCell,
              ];
            })
            )
          );
        })() : null,

        // ── 10-day weather strip — scrollable, 4 days at a time ────────────
        hasEnoughData ? (() => {
          // Two samples per day:
          //   morning low   at i + 0.0  (column boundary = transition between days)
          //   afternoon high at i + 0.5 (column midpoint)
          // Each column's left half = climb, right half = descent to next morning low.
          // Peaks center on day columns, valleys land on day boundaries.
          const samplesFor = (key) => {
            const pts = [];
            for (let i = 0; i < wxDays.length; i++) {
              pts.push({ x: i + 0.0, y: wxDays[i].morning[key] });
              pts.push({ x: i + 0.5, y: wxDays[i].afternoon[key] });
            }
            // Morning of the day after the last visible column — closes off the line so it runs
            // all the way to the chart's right edge instead of stopping at the last midpoint.
            pts.push({ x: wxDays.length, y: wxExtraMorning[key] });
            return pts;
          };
          const relPts = samplesFor('rel');
          const perPts = samplesFor('per');

          // Shared Y scale across Rel and Per.
          const scaleFor = (pts) => {
            const ys = pts.map(p => p.y);
            const lo = Math.min(...ys);
            const hi = Math.max(...ys);
            const range = Math.max(hi - lo, 8);
            const pad = range * 0.20;
            return { yMin: lo - pad, yMax: hi + pad };
          };
          const sharedScale = scaleFor([...relPts, ...perPts]);
          const relScale = sharedScale;
          const perScale = sharedScale;

          // Nice tick generator — picks ~targetCount ticks at multiples of 1/2/5/10 etc.
          const niceTicks = (lo, hi, targetCount = 3) => {
            const span = hi - lo;
            const rawStep = span / (targetCount + 1);
            const mag = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
            const normalised = rawStep / mag;
            const step = (normalised < 1.5 ? 1 : normalised < 3 ? 2 : normalised < 7 ? 5 : 10) * mag;
            const start = Math.ceil(lo / step) * step;
            const ticks = [];
            for (let t = start; t <= hi + 0.01; t += step) ticks.push(Math.round(t * 10) / 10);
            return ticks;
          };
          const sharedTicks = niceTicks(sharedScale.yMin, sharedScale.yMax, 3);
          const relTicks = sharedTicks;
          const perTicks = sharedTicks;

          // Layout
          const DAY_W = 92;
          const ROW1_H = 96;   // day label + date + icon (32px) + tenor high/low
          const ROW2_H = 140;  // main Rel/Per line chart
          const ROW3_H = ROW2_H; // percentage line chart (0-100%) — match score chart height
          const SVG1_H  = ROW1_H + ROW2_H;   // first SVG height (rows 1+2)
          const SVG2_H  = ROW3_H;             // second SVG height (row 3)
          const TOTAL_W = wxDays.length * DAY_W;
          const chartTop = ROW1_H + 8;
          const chartBot = ROW1_H + ROW2_H;   // flush to SVG bottom — no empty space before the legend
          const chartH   = chartBot - chartTop;
          // Row 3 coordinates relative to SVG2 (its own coordinate space)
          const r3Top    = 8;
          const r3Bot    = SVG2_H;            // flush to SVG bottom — no empty space before the legend
          const r3H      = r3Bot - r3Top;
          const yOfPct   = (v) => r3Top + (1 - Math.max(0, Math.min(1, v))) * r3H;

          // Per-category date sets and per-DOW probabilities are computed at the home-page level
          // (see the percent-chart-prep block above the wxData IIFE) so the storm identifier can
          // share the same window/methodology. We just consume the hoisted helpers here.
          // All negative-scoring categories collapse into a weather metaphor:
          //   Cloudcover    = chance of ANY negative event on a day
          //   Precipitation = chance of 2+ distinct negative events on the same day
          // Each date is weighted by the MAX resolution-recurrence weight across its negative
          // events — a fully-resolved day contributes 0 (won't predict recurrence), a heavier
          // day contributes 1. Turndown has no resolution, so any turndown contributes 1.
          const NEG_CATS = new Set(['conflict', 'turndown', 'regulation', 'burnout', 'friction']);
          const negCatsByDate = new Map();
          const negWeightByDate = new Map();
          for (const e of allEntries) {
            if (!NEG_CATS.has(e.category)) continue;
            if (!_hasPoints(e)) continue;
            if (!negCatsByDate.has(e.date)) negCatsByDate.set(e.date, new Set());
            negCatsByDate.get(e.date).add(e.category);
            const w = _resolutionRecurrence(e);
            const existing = negWeightByDate.get(e.date) ?? 0;
            if (w > existing) negWeightByDate.set(e.date, w);
          }
          const cloudDates = negWeightByDate; // Map of date → max recurrence weight
          const precipDates = new Map();
          for (const [date, cats] of negCatsByDate) {
            if (cats.size >= 2) precipDates.set(date, negWeightByDate.get(date) ?? 1);
          }
          // Snow triggers only when TODAY's rel or per is predicted to fall to 0 or lower —
          // either its morning (decay-only state) or afternoon (locked DOW projection). Future
          // days' cumulative projections aren't enough; only the today reading switches us cold.
          // Line stays blue (cold precipitation is still water); fill switches to purply-pink.
          const _todayWxDay = wxDays.find(d => d.isToday);
          const _isFreezing = !!_todayWxDay && (
            _todayWxDay.morning.rel <= 0 || _todayWxDay.afternoon.rel <= 0 ||
            _todayWxDay.morning.per <= 0 || _todayWxDay.afternoon.per <= 0
          );
          const precipLabel  = _isFreezing ? 'Snow' : 'Rain';
          const precipColor  = '#3b7dd8';                                 // line color — always blue
          const precipFillC  = _isFreezing ? '#a440b8' : '#3b7dd8';        // fill color — deeper purply-pink when freezing
          // Positive lines stay individual; negative load is summarized by Cloudcover/Precipitation (filled).
          const PCT_SERIES = [
            { cat: 'affection',  color: CAT_COLORS.affection,  label: bondingLabel(),  show: S.showBonding,
              dateSet: datesWithCatScored('affection') },
            { cat: 'social',     color: CAT_COLORS.social,     label: 'Social',        show: S.relationshipMode === 'individual',
              dateSet: datesWithCatScored('social') },
            { cat: 'physical',   color: CAT_COLORS.physical,   label: 'Intimacy',      show: S.showPhysical,
              dateSet: datesWithCatScored('physical') },
            { cat: 'restore',    color: CAT_COLORS.restore,    label: 'Restore',       show: true,
              dateSet: datesWithCatScored('restore') },
            { cat: 'cloudcover',    color: '#9aa5ad', label: 'Clouds',    show: true, fill: true,
              dateSet: cloudDates },
            { cat: 'precipitation', color: precipColor, fillColor: precipFillC, label: precipLabel, show: true, fill: true,
              dateSet: precipDates },
          ].filter(s => s.show);
          for (const s of PCT_SERIES) {
            s.dowPct = computeDowPct(s.dateSet);
            // Attach the relevant shock arrays so buildPctLine can lift each day's probability
            // above its DOW baseline when recent negative events still cast a shadow forward.
            if (s.cat === 'cloudcover') {
              // Clouds = any one negative event → take the max shock across combos.
              s.shockByDay  = _aggregateShockByDay;
              s.shockBefore = _aggregateShockBefore;
              s.shockAfter  = _aggregateShockAfter;
            } else if (s.cat === 'precipitation') {
              // Precipitation = 2+ different events same day → requires 2+ combos with recent
              // contributions; uses the second-highest shock as the limiting factor.
              s.shockByDay  = _precipShockByDay;
              s.shockBefore = _precipShockBefore;
              s.shockAfter  = _precipShockAfter;
            } else {
              // Positive series — no shock layer.
              s.shockByDay  = wxDays.map(() => 0);
              s.shockBefore = 0;
              s.shockAfter  = 0;
            }
          }
          const yOfRel = (v) => chartTop + (relScale.yMax - v) / (relScale.yMax - relScale.yMin) * chartH;
          const yOfPer = (v) => chartTop + (perScale.yMax - v) / (perScale.yMax - perScale.yMin) * chartH;
          // Logical x units → pixels: logical x = i is the LEFT boundary of column i,
          // x = i + 0.5 is the MIDPOINT, x = i + 1 is the right boundary.
          const xOf = (dayX) => dayX * DAY_W;

          const mk = (tag, attrs, txt) => {
            const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
            Object.entries(attrs).forEach(([k,v]) => el.setAttribute(k,v));
            if (txt != null) el.textContent = txt;
            return el;
          };

          // ── Main scrollable SVG #1 (rows 1+2: header + score line chart) ──
          const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgEl.setAttribute('viewBox', `0 0 ${TOTAL_W} ${SVG1_H}`);
          svgEl.setAttribute('preserveAspectRatio', 'none');
          svgEl.style.cssText = `display:block;width:${TOTAL_W}px;height:${SVG1_H}px;`;
          // Tapping the chart background closes any open storm popup (consistent with svgEl2).
          svgEl.addEventListener('click', () => {
            if (S._stormPopup) { S._stormPopup = null; render(); }
          });

          // Horizontal gridlines from Per ticks (rendered subtly)
          for (const t of perTicks) {
            const y = yOfPer(t);
            if (y < chartTop || y > chartBot) continue;
            svgEl.appendChild(mk('line', {
              x1:'0', y1: y.toFixed(1), x2: String(TOTAL_W), y2: y.toFixed(1),
              stroke:'var(--surface-2)', 'stroke-width':'0.5',
            }));
          }
          // Top and bottom chart borders
          for (const y of [chartTop, chartBot]) {
            svgEl.appendChild(mk('line', {
              x1:'0', y1: y.toFixed(1), x2: String(TOTAL_W), y2: y.toFixed(1),
              stroke:'var(--muted-3)', 'stroke-width':'0.8',
            }));
          }
          // Zero line for Per (if visible)
          if (perScale.yMin < 0 && perScale.yMax > 0) {
            const y0 = yOfPer(0);
            svgEl.appendChild(mk('line', {
              x1:'0', y1: y0.toFixed(1), x2: String(TOTAL_W), y2: y0.toFixed(1),
              stroke:'var(--muted-3)', 'stroke-width':'0.8', 'stroke-dasharray':'2,3',
            }));
          }
          // Vertical column dividers (within SVG1)
          for (let i = 1; i < wxDays.length; i++) {
            const x = i * DAY_W;
            svgEl.appendChild(mk('line', {
              x1: x.toFixed(1), y1: '0', x2: x.toFixed(1), y2: String(SVG1_H),
              stroke: 'var(--surface-2)', 'stroke-width': '0.5',
            }));
          }
          // Today vertical accent (within SVG1)
          const todayIdx = wxDays.findIndex(d => d.isToday);
          if (todayIdx >= 0) {
            // Bracket today's column with two dashed lines so it's visually clear that today
            // runs from morning (left edge) to night (right edge).
            for (const tx of [todayIdx * DAY_W, (todayIdx + 1) * DAY_W]) {
              svgEl.appendChild(mk('line', {
                x1: tx.toFixed(1), y1: '0', x2: tx.toFixed(1), y2: String(SVG1_H),
                stroke: 'var(--text-strong)', 'stroke-width': '1.2', 'stroke-dasharray':'1,3', opacity:'0.5',
              }));
            }
          }

          // Row 1: day label + date + weather icon + high/low
          for (let i = 0; i < wxDays.length; i++) {
            const d  = wxDays[i];
            const cx = i * DAY_W + DAY_W / 2;
            const zi = _zoneIcon(d.afternoon.tenor);
            const lblText = d.isToday ? 'Today' : DAY_NAMES[d.dow];
            const dateObj = new Date(d.date + 'T00:00:00');
            const dateStr = dateObj.toLocaleDateString('en-US', { month:'short', day:'numeric' });
            const hi = Math.round(Math.max(d.morning.tenor, d.afternoon.tenor));
            const lo = Math.round(Math.min(d.morning.tenor, d.afternoon.tenor));
            // Day label — past and future render identically; only today gets the bold accent.
            svgEl.appendChild(mk('text', {
              x: cx.toFixed(1), y: '14', 'text-anchor':'middle',
              'font-size':'10', 'font-family':"'DM Sans', sans-serif",
              fill: d.isToday ? 'var(--text-strong)' : 'var(--muted)',
              'font-weight': d.isToday ? '700' : '500',
              'letter-spacing': '0.04em',
            }, lblText.toUpperCase()));
            // Date (e.g., "Mar 4")
            svgEl.appendChild(mk('text', {
              x: cx.toFixed(1), y: '28', 'text-anchor':'middle',
              'font-size':'10', 'font-family':"'DM Sans', sans-serif",
              fill: 'var(--muted-2)',
            }, dateStr));
            // Weather icon — slightly larger than the climate chart's icons since this is the
            // primary daily glance. Centered via dominant-baseline.
            svgEl.appendChild(mk('text', {
              x: cx.toFixed(1), y: '54', 'text-anchor':'middle',
              'dominant-baseline':'central',
              'font-size':'32',
            }, zi.icon));
            // Tenor high / low (afternoon peak / morning low) — single combined line
            const hiStr = (hi >= 0 ? '+' : '') + hi;
            const loStr = (lo >= 0 ? '+' : '') + lo;
            svgEl.appendChild(mk('text', {
              x: cx.toFixed(1), y: '85', 'text-anchor':'middle',
              'font-size':'12', 'font-family':"'Libre Baskerville', serif",
              fill: 'var(--text-strong)',
            }, loStr + ' / ' + hiStr));
          }

          // Row 2 line chart — Rel (right axis) + Per (left axis), each on its own scale.
          const splitAtX = todayIdx + 1.0;
          const splitPath = (pts, isPastPart) => {
            const out = [];
            for (let i = 0; i < pts.length; i++) {
              const p = pts[i];
              if (isPastPart) { if (p.x <= splitAtX) out.push(p); else break; }
              else            { if (p.x >= splitAtX) out.push(p); }
            }
            return out;
          };
          // Monotonic cubic Hermite spline (Fritsch–Carlson). Smooth like Catmull-Rom but provably
          // never overshoots: at local extrema the tangent is zeroed so peaks/valleys stay anchored
          // to the data points and the curve can't swing above 100% or below 0%.
          const pathWith = (pts, yOf) => {
            const n = pts.length;
            if (n === 0) return '';
            const px = pts.map(p => xOf(p.x));
            const py = pts.map(p => yOf(p.y));
            if (n === 1) return 'M' + px[0].toFixed(1) + ',' + py[0].toFixed(1);
            // Secant slopes between consecutive points (in pixel space).
            const dx = [], m = [];
            for (let i = 0; i < n - 1; i++) {
              dx[i] = px[i + 1] - px[i];
              m[i]  = (py[i + 1] - py[i]) / (dx[i] || 1);
            }
            // Per-point tangents — 0 at local extrema, weighted harmonic mean otherwise.
            const t = new Array(n);
            t[0]     = m[0];
            t[n - 1] = m[n - 2];
            for (let i = 1; i < n - 1; i++) {
              if (m[i - 1] * m[i] <= 0) {
                t[i] = 0;
              } else {
                const w1 = 2 * dx[i] + dx[i - 1];
                const w2 = dx[i] + 2 * dx[i - 1];
                t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
              }
            }
            let d = 'M' + px[0].toFixed(1) + ',' + py[0].toFixed(1);
            for (let i = 0; i < n - 1; i++) {
              const h   = dx[i] / 3;
              const c1x = px[i] + h,     c1y = py[i]     + t[i]     * h;
              const c2x = px[i + 1] - h, c2y = py[i + 1] - t[i + 1] * h;
              d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1)
                 + ' '  + c2x.toFixed(1) + ',' + c2y.toFixed(1)
                 + ' '  + px[i + 1].toFixed(1) + ',' + py[i + 1].toFixed(1);
            }
            return d;
          };
          const drawSeries = (pts, yOf, color, width) => {
            if (pts.length < 2) return;
            svgEl.appendChild(mk('path', {
              d: pathWith(pts, yOf), fill:'none', stroke: color,
              'stroke-width': String(width), 'stroke-linecap':'round', 'stroke-linejoin':'round',
            }));
          };
          // Tenor reference line — visual midpoint between rel and per at each
          // sample point. Rel/per use different axes, so we average their PIXEL
          // positions (not their raw values) to read as the literal midline.
          // Dashed muted so it stays a reference, not a primary series.
          if (relPts.length === perPts.length && relPts.length >= 2) {
            const tenorPxPts = relPts.map((r, i) => ({
              x: r.x,
              yPx: (yOfRel(r.y) + yOfPer(perPts[i].y)) / 2,
            }));
            // Build the same monotonic Hermite path but using pre-computed yPx.
            const tenorPath = (() => {
              const n = tenorPxPts.length;
              const px = tenorPxPts.map(p => xOf(p.x));
              const py = tenorPxPts.map(p => p.yPx);
              if (n === 1) return 'M' + px[0].toFixed(1) + ',' + py[0].toFixed(1);
              const dx = [], m = [];
              for (let i = 0; i < n - 1; i++) {
                dx[i] = px[i + 1] - px[i];
                m[i]  = (py[i + 1] - py[i]) / (dx[i] || 1);
              }
              const tt = new Array(n);
              tt[0]     = m[0];
              tt[n - 1] = m[n - 2];
              for (let i = 1; i < n - 1; i++) {
                if (m[i - 1] * m[i] <= 0) { tt[i] = 0; continue; }
                const w1 = 2 * dx[i] + dx[i - 1];
                const w2 = dx[i] + 2 * dx[i - 1];
                tt[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
              }
              let d = 'M' + px[0].toFixed(1) + ',' + py[0].toFixed(1);
              for (let i = 0; i < n - 1; i++) {
                const hh  = dx[i] / 3;
                const c1x = px[i] + hh,     c1y = py[i]     + tt[i]     * hh;
                const c2x = px[i + 1] - hh, c2y = py[i + 1] - tt[i + 1] * hh;
                d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1)
                   + ' '  + c2x.toFixed(1) + ',' + c2y.toFixed(1)
                   + ' '  + px[i + 1].toFixed(1) + ',' + py[i + 1].toFixed(1);
              }
              return d;
            })();
            svgEl.appendChild(mk('path', {
              d: tenorPath, fill:'none', stroke:'var(--muted)',
              'stroke-width':'1.2', 'stroke-dasharray':'3,3',
              'stroke-linecap':'round', opacity:'0.7',
            }));
          }
          drawSeries(perPts, yOfPer, 'var(--c-restore)', 1.9);
          // In Individual mode, wxDays' .rel slot is populated with Social
          // values upstream — recolor the line so it reads as Social.
          drawSeries(relPts, yOfRel, isIndHome ? 'var(--c-social)' : 'var(--c-affection)', 1.9);

          // Past-day storm icons — for any prior day where a storm-class event was logged,
          // render ONE icon per balance line (max two icons per day). When multiple combos
          // hit the same line (e.g. conflict + turndown both on rel), pick the combo whose
          // summed impact on that balance is the most negative. Icon glyph reflects THAT
          // DAY'S rel or per zone. Tap-to-popup matches the prediction chart's behavior.
          (() => {
            const _stormCatToCombo = {};
            for (const [combo, meta] of Object.entries(STORM_COMBO_META)) {
              _stormCatToCombo[meta.cat] = combo;
            }
            // Collect signed impact per (date, balance, combo) by summing scored entries.
            const _stormImpactByDate = {}; // date -> { rel:{combo:impact,...}, per:{...} }
            for (const e of allEntries) {
              const combo = _stormCatToCombo[e.category];
              if (!combo) continue;
              if (!_hasPoints(e)) continue;
              const scores = expEntryScores(e, _capFor(e.date));
              const meta = STORM_COMBO_META[combo];
              // In Individual mode the "rel" slot is fed by social entries
              // (so friction's score actually lives on scores.soc, not scores.rel).
              const impact = meta.balance === 'rel'
                ? (S.relationshipMode === 'individual' ? (scores.soc || 0) : scores.rel)
                : scores.per;
              const day = (_stormImpactByDate[e.date] ||= { rel:{}, per:{} });
              day[meta.balance][combo] = (day[meta.balance][combo] || 0) + impact;
            }
            const buildFcstIconNode = (iconStr, x, y, popupKey, popupText, size) => {
              const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
              group.style.cursor = 'pointer';
              group.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
              group.addEventListener('click', (ev) => {
                ev.stopPropagation();
                S._stormPopup = (S._stormPopup === popupKey) ? null : popupKey;
                render();
              });
              const baseSize = size || 22;
              const hasShield = iconStr.indexOf('⚠️') >= 0;
              if (hasShield) {
                const baseIcon = iconStr.replace('⚠️', '').trim();
                group.appendChild(mk('text', {
                  x: x.toFixed(1), y: y.toFixed(1),
                  'text-anchor':'middle', 'dominant-baseline':'central',
                  'font-size': String(baseSize),
                }, baseIcon));
                const overlaySize = Math.round(baseSize * 0.5);
                group.appendChild(mk('text', {
                  x: (x + baseSize * 0.32).toFixed(1),
                  y: (y - baseSize * 0.32).toFixed(1),
                  'text-anchor':'middle', 'dominant-baseline':'central',
                  'font-size': String(overlaySize),
                }, '⚠️'));
              } else {
                group.appendChild(mk('text', {
                  x: x.toFixed(1), y: y.toFixed(1),
                  'text-anchor': 'middle',
                  'dominant-baseline': 'central',
                  'font-size': String(baseSize),
                }, iconStr));
              }
              if (S._stormPopup === popupKey) {
                const measuredW = measureTextWidth(popupText, 12, "'DM Sans', sans-serif");
                const popupW = Math.min(Math.max(measuredW + 20, 100), Math.min(320, TOTAL_W - 10));
                const popupH = 26;
                const aboveY = y - 18 - popupH;
                const belowY = y + 18;
                const py = (aboveY >= 2) ? aboveY : belowY;
                const px = Math.max(2, Math.min(x - popupW / 2, TOTAL_W - popupW - 2));
                group.appendChild(mk('rect', {
                  x: px.toFixed(1), y: py.toFixed(1),
                  width: popupW.toFixed(1), height: String(popupH),
                  rx: '6', ry: '6',
                  fill: 'var(--bg2)', stroke: 'var(--border-mid)', 'stroke-width': '1',
                }));
                group.appendChild(mk('text', {
                  x: (px + popupW / 2).toFixed(1),
                  y: (py + popupH / 2 + 1).toFixed(1),
                  'text-anchor': 'middle',
                  'dominant-baseline': 'central',
                  'font-size': '12',
                  'font-family': "'DM Sans', sans-serif",
                  fill: 'var(--text-strong)',
                }, popupText));
              }
              svgEl.appendChild(group);
            };
            // Pick the combo with the most negative summed impact. Ties break by
            // STORM_PRIORITY — so on rel, conflict (0) beats turndown (3); on per,
            // wobble (1) beats steadying (2).
            const pickMostNegative = (combosMap) => {
              let best = null;
              for (const [combo, impact] of Object.entries(combosMap)) {
                if (best === null) { best = { combo, impact }; continue; }
                if (impact < best.impact) { best = { combo, impact }; continue; }
                if (impact === best.impact &&
                    (STORM_PRIORITY[combo] ?? 99) < (STORM_PRIORITY[best.combo] ?? 99)) {
                  best = { combo, impact };
                }
              }
              return best;
            };
            // Point-tier sizing (matches Climate / Weather / Storm matrix):
            // ≤10pt = tier 1, ≤20 = 2, ≤30 = 3, ≤40 = 4, ≤50 = 5, >50 = 6.
            const POINT_TIER_SIZES = [0.5, 0.7, 0.9, 1.1, 1.4, 1.7];
            const pointTierFor = (absImpact) => {
              if (absImpact > 50) return 6;
              if (absImpact > 40) return 5;
              if (absImpact > 30) return 4;
              if (absImpact > 20) return 3;
              if (absImpact > 10) return 2;
              return 1;
            };
            for (let i = 0; i < wxDays.length; i++) {
              const d = wxDays[i];
              if (d.offset >= 0) continue; // past days only
              const day = _stormImpactByDate[d.date];
              if (!day) continue;
              for (const balance of ['rel', 'per']) {
                const pick = pickMostNegative(day[balance]);
                if (!pick) continue;
                const balVal = balance === 'rel' ? d.afternoon.rel : d.afternoon.per;
                const zoneKey = _stormZoneKey(balVal);
                const cell = STORM_MATRIX[pick.combo] && STORM_MATRIX[pick.combo][zoneKey];
                if (!cell || !cell.icon) continue;
                // Size by the day's summed |impact| for that combo — matches
                // the rule used on Climate / Weather / Storm matrix charts.
                const iconSize = Math.round(22 * POINT_TIER_SIZES[pointTierFor(Math.abs(pick.impact)) - 1]);
                const cx = i * DAY_W + DAY_W / 2;
                const cy = (balance === 'rel' ? yOfRel(balVal) : yOfPer(balVal)) - Math.round(iconSize * 0.6);
                buildFcstIconNode(cell.icon, cx, cy,
                  'fcst' + i + '_' + pick.combo, cell.label + ' · ' + pick.combo + ' logged', iconSize);
              }
            }
          })();

          // Today's locked forecast — dotted overlay from today's morning to its locked
          // afternoon (the DOW projection, before any of today's logging). Shown only when the
          // live afternoon has diverged from the locked one, so the user can see the gap.
          const _todayWx = wxDays.find(d => d.isToday);
          if (_todayWx && todayIdx >= 0) {
            const todayMornX = xOf(todayIdx + 0.0);
            const todayAftX  = xOf(todayIdx + 0.5);
            const drawLockedSegment = (mornY, lockedY, liveY, color) => {
              // Skip when locked == live (no divergence to indicate).
              if (Math.abs(lockedY - liveY) < 0.5) return;
              svgEl.appendChild(mk('line', {
                x1: todayMornX.toFixed(1), y1: mornY.toFixed(1),
                x2: todayAftX.toFixed(1),  y2: lockedY.toFixed(1),
                stroke: color, 'stroke-width': '1.4', 'stroke-linecap': 'round',
                'stroke-dasharray': '2,3', opacity: '0.65',
              }));
            };
            drawLockedSegment(
              yOfPer(_todayWx.morning.per),
              yOfPer(_todayWx.lockedAfternoon.per),
              yOfPer(_todayWx.afternoon.per),
              'var(--c-restore)'
            );
            drawLockedSegment(
              yOfRel(_todayWx.morning.rel),
              yOfRel(_todayWx.lockedAfternoon.rel),
              yOfRel(_todayWx.afternoon.rel),
              'var(--c-affection)'
            );
          }

          // ── Scrollable SVG #2 (row 3: percentage line chart) ──
          const svgEl2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgEl2.setAttribute('viewBox', `0 0 ${TOTAL_W} ${SVG2_H}`);
          svgEl2.setAttribute('preserveAspectRatio', 'none');
          svgEl2.style.cssText = `display:block;width:${TOTAL_W}px;height:${SVG2_H}px;`;
          // Tapping the chart background (outside any icon group) closes any open popup.
          svgEl2.addEventListener('click', () => {
            if (S._stormPopup) { S._stormPopup = null; render(); }
          });

          // Horizontal gridlines at 0%, 50%, 100%
          for (const tick of [0, 0.5, 1]) {
            const y = yOfPct(tick);
            svgEl2.appendChild(mk('line', {
              x1:'0', y1: y.toFixed(1), x2: String(TOTAL_W), y2: y.toFixed(1),
              stroke:'var(--surface-2)', 'stroke-width':'0.5',
            }));
          }
          // Top and bottom chart borders
          for (const y of [r3Top, r3Bot]) {
            svgEl2.appendChild(mk('line', {
              x1:'0', y1: y.toFixed(1), x2: String(TOTAL_W), y2: y.toFixed(1),
              stroke:'var(--muted-3)', 'stroke-width':'0.8',
            }));
          }
          // Vertical column dividers in SVG2
          for (let i = 1; i < wxDays.length; i++) {
            const x = i * DAY_W;
            svgEl2.appendChild(mk('line', {
              x1: x.toFixed(1), y1: '0', x2: x.toFixed(1), y2: String(SVG2_H),
              stroke: 'var(--surface-2)', 'stroke-width': '0.5',
            }));
          }
          // Today brackets in SVG2 — same morning/night dashed lines as on the score chart
          if (todayIdx >= 0) {
            for (const tx of [todayIdx * DAY_W, (todayIdx + 1) * DAY_W]) {
              svgEl2.appendChild(mk('line', {
                x1: tx.toFixed(1), y1: '0', x2: tx.toFixed(1), y2: String(SVG2_H),
                stroke: 'var(--text-strong)', 'stroke-width': '1.2', 'stroke-dasharray':'1,3', opacity:'0.5',
              }));
            }
          }
          // One point per day at the column midpoint. Every day uses the per-DOW probability
          // — the chart shows the projected chance of an event for that day-of-week, never the
          // binary "did it happen today" fact. Today's logging does NOT move the line (the DOW
          // window excludes today). Logging entries on past days updates the line everywhere
          // because past entries shift the per-DOW averages.
          // Two extra phantom samples sit just outside the visible range — one for the day before
          // the leftmost column (x=-0.5) and one for the day after the rightmost (x=n+0.5). They
          // use the real DOW probabilities for those adjacent days so the spline can interpolate
          // through x=0 and x=n with real neighboring values instead of leaving the outer half-day
          // gaps blank. The SVG scroll container clips the off-screen portion of the curve.
          const buildPctLine = (dateSet, dowPct, shockByDay, shockBefore, shockAfter) => {
            const pts = [];
            if (wxDays.length === 0) return pts;
            const beforeDow = (wxDays[0].dow + 6) % 7;
            const afterDow  = (wxDays[wxDays.length - 1].dow + 1) % 7;
            const cap = (v) => Math.max(0, Math.min(1, v));
            pts.push({ x: -0.5, y: cap((dowPct[beforeDow] || 0) + (shockBefore || 0)) });
            for (let i = 0; i < wxDays.length; i++) {
              const d = wxDays[i];
              const s = shockByDay ? (shockByDay[i] || 0) : 0;
              pts.push({ x: i + 0.5, y: cap((dowPct[d.dow] || 0) + s) });
            }
            pts.push({ x: wxDays.length + 0.5, y: cap((dowPct[afterDow] || 0) + (shockAfter || 0)) });
            return pts;
          };
          const drawPctSeries = (pts, color, fill, fillColor) => {
            if (pts.length < 2) return;
            const linePath = pathWith(pts, yOfPct);
            if (fill) {
              const zeroY = yOfPct(0);
              const fillPath = linePath
                + ' L' + xOf(pts[pts.length-1].x).toFixed(1) + ',' + zeroY.toFixed(1)
                + ' L' + xOf(pts[0].x).toFixed(1)            + ',' + zeroY.toFixed(1)
                + ' Z';
              svgEl2.appendChild(mk('path', {
                d: fillPath, fill: fillColor || color, 'fill-opacity':'0.18',
                stroke: 'none',
              }));
            }
            svgEl2.appendChild(mk('path', {
              d: linePath, fill:'none', stroke: color,
              'stroke-width':'1.6', 'stroke-linecap':'round', 'stroke-linejoin':'round',
            }));
          };
          // Pre-compute samples and drop any series whose values are all 0 in the visible window.
          for (const s of PCT_SERIES) {
            s.samples = buildPctLine(s.dateSet, s.dowPct, s.shockByDay, s.shockBefore, s.shockAfter);
            s.hasData = s.samples.some(p => p.y > 0);
          }
          const activeSeries = PCT_SERIES.filter(s => s.hasData);
          // Stash today's per-series chart predictions for the details modal — same numbers
          // the chart draws on today's column (baseline DOW probability + shock, clamped).
          if (S._forecastDetailsData) {
            const _tdIdx = wxDays.findIndex(d => d.isToday);
            const _tdDow = _tdIdx >= 0 ? wxDays[_tdIdx].dow : null;
            S._forecastDetailsData.chartPredictions = PCT_SERIES.map(s => {
              const baseline = (_tdDow != null) ? (s.dowPct[_tdDow] || 0) : 0;
              const shock = (s.shockByDay && _tdIdx >= 0) ? (s.shockByDay[_tdIdx] || 0) : 0;
              return {
                cat: s.cat,
                label: s.label,
                color: s.color,
                fillColor: s.fillColor || s.color,
                todayProb: Math.max(0, Math.min(1, baseline + shock)),
              };
            });
          }
          // Draw filled series first so unfilled lines stay readable on top
          for (const s of activeSeries.filter(s => s.fill)) {
            drawPctSeries(s.samples, s.color, true, s.fillColor);
          }
          for (const s of activeSeries.filter(s => !s.fill)) {
            drawPctSeries(s.samples, s.color, false);
          }

          // Per-day weather icons — DOMINANT active event type centered in the Clouds-only band
          // (between cloud-shade top and rain-shade top). On days that also have precipitation
          // (2+ negatives possible), a SECOND icon for the next-most-common event type renders
          // in the precipitation band (between rain-shade top and the 0% baseline).
          // Icons reflect each combo's current-zone storm reading.
          // Probabilities below ICON_MIN_PROB don't bother showing an icon — too faint to matter.
          const ICON_MIN_PROB = 0.10;
          const _cloudsSeries = PCT_SERIES.find(s => s.cat === 'cloudcover');
          const _precipSeries = PCT_SERIES.find(s => s.cat === 'precipitation');
          const _cloudsDowPct = _cloudsSeries ? _cloudsSeries.dowPct : {};
          const _precipDowPct = _precipSeries ? _precipSeries.dowPct : {};
          const _bottomY = yOfPct(0);
          const _capProb = (v) => Math.max(0, Math.min(1, v));
          for (let i = 0; i < wxDays.length; i++) {
            const dow = wxDays[i].dow;
            // Past days surface their actual logged storm icons on the forecast chart
            // above — skip them here so the prediction chart stays focused on what's
            // ahead (today + next 7).
            if (wxDays[i].offset < 0) continue;
            // Cloud/precip heights include the shock layer so the icon-band geometry matches
            // the fill area drawn above.
            const cloudProb  = _capProb((_cloudsDowPct[dow] || 0) + _aggregateShockByDay[i]);
            // Precip requires 2+ different event types; uses the more restrictive shock so a
            // single recent conflict doesn't fake a "two-event-day" prediction.
            const precipProb = _capProb((_precipDowPct[dow] || 0) + _precipShockByDay[i]);
            // Skip drawing icons entirely if the day is too clear — clouds below the threshold.
            if (cloudProb < ICON_MIN_PROB) continue;
            // Per-combo probability for THIS chart day, after shock — used to pick dominant /
            // second-most-common event icons. Ties broken by window count then fixed priority.
            const dayProb = (combo) => _capProb(
              (_stormCombos[combo].dowPct[dow] || 0) + (_shocksByCombo[combo] ? _shocksByCombo[combo][i] : 0)
            );
            const ordered = Object.keys(STORM_MATRIX)
              .filter(c => dayProb(c) >= ICON_MIN_PROB)
              .sort((a, b) => {
                const pa = dayProb(a);
                const pb = dayProb(b);
                if (pb !== pa) return pb - pa;
                const ca = _stormCombos[a].windowCount;
                const cb = _stormCombos[b].windowCount;
                if (cb !== ca) return cb - ca;
                return (STORM_PRIORITY[a] ?? 99) - (STORM_PRIORITY[b] ?? 99);
              });
            if (ordered.length === 0) continue;
            const cx = i * DAY_W + DAY_W / 2;
            const cloudTopY  = yOfPct(cloudProb);
            const precipTopY = yOfPct(precipProb);
            // Build a tap-target group around each icon so tapping reveals a small popup
            // explaining what the icon means. Tap again to close. Tapping another icon
            // swaps the popup to that one.
            const buildIconNode = (iconStr, x, y, combo, popupKey, size) => {
              const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
              group.style.cursor = 'pointer';
              // Stop pointerdown from reaching the scroll container so its drag-to-scroll
              // doesn't capture the pointer and swallow our click event.
              group.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
              group.addEventListener('click', (ev) => {
                ev.stopPropagation();
                S._stormPopup = (S._stormPopup === popupKey) ? null : popupKey;
                render();
              });
              const baseSize = size || 30;
              const hasShield = iconStr.indexOf('⚠️') >= 0;
              if (hasShield) {
                const baseIcon = iconStr.replace('⚠️', '').trim();
                group.appendChild(mk('text', {
                  x: x.toFixed(1), y: y.toFixed(1),
                  'text-anchor':'middle', 'dominant-baseline':'central',
                  'font-size': String(baseSize),
                }, baseIcon));
                const overlaySize = Math.round(baseSize * 0.5);
                group.appendChild(mk('text', {
                  x: (x + baseSize * 0.32).toFixed(1),
                  y: (y - baseSize * 0.32).toFixed(1),
                  'text-anchor':'middle', 'dominant-baseline':'central',
                  'font-size': String(overlaySize),
                }, '⚠️'));
              } else {
                group.appendChild(mk('text', {
                  x: x.toFixed(1), y: y.toFixed(1),
                  'text-anchor': 'middle',
                  'dominant-baseline': 'central',
                  'font-size': String(baseSize),
                }, iconStr));
              }
              if (S._stormPopup === popupKey) {
                const probPct = Math.round(dayProb(combo) * 100);
                const label = _stormCombos[combo].reading.label;
                const txt = label + ' · ' + probPct + '% ' + combo;
                const measuredW = measureTextWidth(txt, 12, "'DM Sans', sans-serif");
                const popupW = Math.min(Math.max(measuredW + 20, 100), Math.min(320, TOTAL_W - 10));
                const popupH = 26;
                // Place above icon if room; otherwise below.
                const aboveY = y - 26 - popupH;
                const belowY = y + 22;
                const py = (aboveY >= 2) ? aboveY : belowY;
                const px = Math.max(2, Math.min(x - popupW / 2, TOTAL_W - popupW - 2));
                group.appendChild(mk('rect', {
                  x: px.toFixed(1), y: py.toFixed(1),
                  width: popupW.toFixed(1), height: String(popupH),
                  rx: '6', ry: '6',
                  fill: 'var(--bg2)', stroke: 'var(--border-mid)', 'stroke-width': '1',
                }));
                group.appendChild(mk('text', {
                  x: (px + popupW / 2).toFixed(1),
                  y: (py + popupH / 2 + 1).toFixed(1),
                  'text-anchor': 'middle',
                  'dominant-baseline': 'central',
                  'font-size': '12',
                  'font-family': "'DM Sans', sans-serif",
                  fill: 'var(--text-strong)',
                }, txt));
              }
              svgEl2.appendChild(group);
            };
            // Top icon — dominant event, in the clouds-only band. Size scales
            // with severity (zoneKey) so all combos communicate intensity visually.
            const topY = precipProb >= ICON_MIN_PROB ? (cloudTopY + precipTopY) / 2 : (cloudTopY + _bottomY) / 2;
            const topSize = Math.round(30 * (STORM_ZONE_SIZE[_stormCombos[ordered[0]].zoneKey] || 1));
            buildIconNode(
              _stormCombos[ordered[0]].reading.icon,
              cx, topY, ordered[0], 'day' + i + '_top', topSize
            );
            // Second icon — next-most-common event, centered in the precipitation band.
            if (precipProb >= ICON_MIN_PROB && ordered.length >= 2) {
              const bottomY = (precipTopY + _bottomY) / 2;
              const bottomSize = Math.round(30 * (STORM_ZONE_SIZE[_stormCombos[ordered[1]].zoneKey] || 1));
              buildIconNode(
                _stormCombos[ordered[1]].reading.icon,
                cx, bottomY, ordered[1], 'day' + i + '_bottom', bottomSize
              );
            }
          }

          // ── Y-axis SVGs — fixed outside the scroll containers ──
          const AXIS_W = 38;
          // Score axis for SVG1 (rows 1+2). Tick labels are score values.
          const buildScoreAxis = (ticks, yOf, side) => {
            const ax = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            ax.setAttribute('viewBox', `0 0 ${AXIS_W} ${SVG1_H}`);
            ax.setAttribute('preserveAspectRatio', 'none');
            ax.style.cssText = `display:block;width:${AXIS_W}px;height:${SVG1_H}px;flex-shrink:0;`;
            const lineX = side === 'left' ? (AXIS_W - 0.5) : 0.5;
            ax.appendChild(mk('line', {
              x1: lineX, y1: String(chartTop), x2: lineX, y2: String(chartBot),
              stroke:'var(--surface-2)', 'stroke-width':'0.8',
            }));
            for (const t of ticks) {
              const y = yOf(t);
              if (y < chartTop - 1 || y > chartBot + 1) continue;
              ax.appendChild(mk('line', {
                x1: side === 'left' ? (AXIS_W - 4) : 0, y1: y.toFixed(1),
                x2: side === 'left' ? AXIS_W : 4,        y2: y.toFixed(1),
                stroke:'var(--muted-3)', 'stroke-width':'0.8',
              }));
              ax.appendChild(mk('text', {
                x: side === 'left' ? (AXIS_W - 6) : 6, y: (y + 4).toFixed(1),
                'text-anchor': side === 'left' ? 'end' : 'start',
                'font-size':'11', 'font-family':"'DM Sans', sans-serif",
                fill:'var(--muted)',
              }, (t >= 0 ? '+' : '') + Math.round(t)));
            }
            return ax;
          };
          // Percentage axis for SVG2 (row 3). Ticks at 0%/50%/100%.
          const buildPctAxis = (side) => {
            const ax = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            ax.setAttribute('viewBox', `0 0 ${AXIS_W} ${SVG2_H}`);
            ax.setAttribute('preserveAspectRatio', 'none');
            ax.style.cssText = `display:block;width:${AXIS_W}px;height:${SVG2_H}px;flex-shrink:0;`;
            const lineX = side === 'left' ? (AXIS_W - 0.5) : 0.5;
            ax.appendChild(mk('line', {
              x1: lineX, y1: String(r3Top), x2: lineX, y2: String(r3Bot),
              stroke:'var(--surface-2)', 'stroke-width':'0.8',
            }));
            for (const pct of [0, 0.5, 1]) {
              const y = yOfPct(pct);
              ax.appendChild(mk('line', {
                x1: side === 'left' ? (AXIS_W - 4) : 0, y1: y.toFixed(1),
                x2: side === 'left' ? AXIS_W : 4,        y2: y.toFixed(1),
                stroke:'var(--muted-3)', 'stroke-width':'0.8',
              }));
              // Keep the label inside the SVG: 0% sits above the bottom line, 100% sits below
              // the top line, 50% centers on its tick.
              const labelY = pct === 0 ? y - 2 : (pct === 1 ? y + 9 : y + 4);
              ax.appendChild(mk('text', {
                x: side === 'left' ? (AXIS_W - 6) : 6, y: labelY.toFixed(1),
                'text-anchor': side === 'left' ? 'end' : 'start',
                'font-size':'11', 'font-family':"'DM Sans', sans-serif",
                fill:'var(--muted)',
              }, Math.round(pct * 100) + '%'));
            }
            return ax;
          };
          const leftAxis    = buildScoreAxis(sharedTicks, yOfPer, 'left');
          const rightAxis   = buildScoreAxis(sharedTicks, yOfRel, 'right');
          const leftAxis2   = buildPctAxis('left');
          const rightAxis2  = buildPctAxis('right');

          // Legend (rendered above the strip)
          const legendItem = (color, label) => h('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
            h('div',{style:{width:'12px',height:'2px',background:color,borderRadius:'1px'}}),
            h('span',{style:{fontSize:'10px',color:'var(--muted)'}}, label)
          );

          const expanded = !!S.homeForecastExpanded;
          return h('div',{style:{
            marginTop:'12px', paddingTop:'10px',
            borderTop:'1px solid var(--surface-2)',
          }},
            h('div',{
              style:{
                marginBottom:'8px', display:'flex', alignItems:'center', gap:'6px',
                cursor:'pointer', userSelect:'none',
              },
              onclick: () => {
                S.homeForecastExpanded = !expanded;
                render();
              },
            },
              h('span',{style:{
                fontSize:'10px', color:'var(--muted)', display:'inline-block',
                transition:'transform 0.15s',
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}, '▶'),
              h('span',{style:{fontSize:'10px',fontWeight:'600',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)'}}, '7-day forecast (atmosphere)'),
            ),
            expanded ? (() => {
              // Build the two scroll containers + sync their scroll positions.
              const mkScroll = (svg) => {
                const el = h('div', {
                  style:{
                    flex:'1', overflowX:'auto', overflowY:'hidden',
                    WebkitOverflowScrolling:'touch',
                    minWidth:'0',
                    cursor:'grab',
                    userSelect:'none',
                    touchAction:'pan-x',
                  }
                }, svg);
                // Drag-to-scroll for this container
                let dragging = false, startX = 0, startScroll = 0;
                el.addEventListener('pointerdown', (e) => {
                  dragging = true;
                  startX = e.clientX;
                  startScroll = el.scrollLeft;
                  el.style.cursor = 'grabbing';
                  try { el.setPointerCapture(e.pointerId); } catch(_) {}
                });
                el.addEventListener('pointermove', (e) => {
                  if (!dragging) return;
                  el.scrollLeft = startScroll - (e.clientX - startX);
                });
                const endDrag = () => { dragging = false; el.style.cursor = 'grab'; };
                el.addEventListener('pointerup',     endDrag);
                el.addEventListener('pointercancel', endDrag);
                el.addEventListener('pointerleave',  endDrag);
                return el;
              };
              const scroll1 = mkScroll(svgEl);
              const scroll2 = mkScroll(svgEl2);
              // Sync scroll positions
              let syncing = false;
              const onScroll = (src, dst) => () => {
                if (syncing) return;
                syncing = true;
                dst.scrollLeft = src.scrollLeft;
                syncing = false;
              };
              scroll1.addEventListener('scroll', onScroll(scroll1, scroll2));
              scroll2.addEventListener('scroll', onScroll(scroll2, scroll1));
              // Scroll to today on render — leaving and returning to the page (or expanding
              // a collapsed forecast) snaps back to today rather than preserving the last scroll.
              // Skip the reset when a storm popup is open: the popup re-renders the chart, and
              // jumping back to today during a popup interaction is jarring.
              requestAnimationFrame(() => {
                if (S._stormPopup) return;
                const todayCol = wxDays.findIndex(d => d.isToday);
                if (todayCol >= 0) {
                  const initial = todayCol * DAY_W;
                  scroll1.scrollLeft = initial;
                  scroll2.scrollLeft = initial;
                }
              });
              return h('div', {},
                // Chart 1: score line chart
                h('div', { style: { display:'flex', alignItems:'stretch' } },
                  leftAxis, scroll1, rightAxis,
                ),
                // Legend below chart 1 — app-wide order: Atmosphere → Relational → Personal.
                h('div',{style:{display:'flex',gap:'14px',justifyContent:'flex-end',marginTop:'0',marginBottom:'10px'}},
                  h('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
                    h('div',{style:{width:'12px',height:'0',borderTop:'1.5px dashed var(--muted)',opacity:'0.8'}}),
                    h('span',{style:{fontSize:'10px',color:'var(--muted)'}},'Atmosphere'),
                  ),
                  S.relationshipMode === 'individual'
                    ? legendItem('var(--c-social)', 'Social')
                    : legendItem('var(--c-affection)', 'Relational'),
                  legendItem('var(--c-restore)', 'Personal'),
                ),
                // Chart 2: percentage line chart
                h('div', { style: { display:'flex', alignItems:'stretch' } },
                  leftAxis2, scroll2, rightAxis2,
                ),
                // Legend below chart 2 — only series with data render. Series with a separate
                // fill color (e.g. Snow) show their fill swatch in the legend since that's the
                // dominant visual identifier on the chart.
                h('div',{style:{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'0',flexWrap:'wrap'}},
                  ...activeSeries.map(s => legendItem(s.fillColor || s.color, s.label)),
                ),
                // Inline hint — clarifies the weather-metaphor names for negative events.
                h('div',{style:{
                  fontSize:'10px', color:'var(--muted-2)', marginTop:'4px',
                  fontStyle:'italic', textAlign:'right', lineHeight:'1.4',
                }},
                  'Clouds = chance of any negative day · ' + precipLabel + ' = chance of 2+ same day'),

                // ── Combined chart debug — forecast / prediction / storm in one card ──
                S.showDebug ? (() => {
                  const fmt    = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (Math.round(n * 10) / 10).toFixed(1));
                  const fmtPct = (v) => Math.round(v * 100) + '%';
                  const headerStyle    = {fontSize:'10px',fontWeight:'600',color:'var(--text-strong)',letterSpacing:'0.05em',textTransform:'uppercase'};
                  const sectionHeader  = {fontSize:'11px',fontWeight:'700',color:'var(--text-strong)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:'4px'};
                  const blurbStyle     = {fontSize:'10px',color:'var(--muted-2)',marginBottom:'10px',fontStyle:'italic'};
                  const dividerStyle   = {borderTop:'1px solid var(--surface-2)',margin:'12px 0'};
                  const seriesEarliest = (s) => {
                    if (!s.dateSet || s.dateSet.size === 0) return '—';
                    let e = null;
                    const iter = (s.dateSet instanceof Map) ? s.dateSet.keys() : s.dateSet;
                    for (const d of iter) if (e === null || d < e) e = d;
                    return e;
                  };
                  // Forecast — per-DOW non-zero averages (shared lookback window)
                  const dowTable = h('div',{},
                    h('div',{style:{...headerStyle, marginBottom:'4px'}}, 'Per-DOW non-zero averages (last ' + PCT_WINDOW + ' days)'),
                    h('div',{style:{
                      display:'grid',
                      gridTemplateColumns:'auto repeat(7, minmax(0,1fr))',
                      gap:'2px 6px', fontSize:'10px', color:'var(--muted)',
                    }},
                      h('span',{},''),
                      ...DAY_NAMES.map(n => h('span',{style:{textAlign:'right',fontWeight:'600',color:'var(--muted-2)'}}, n)),
                      h('span',{style:{color:'var(--muted-2)'}}, 'rel'),
                      ...DAY_NAMES.map((_, i) => h('span',{style:{textAlign:'right',fontFamily:"'Libre Baskerville', serif"}}, fmt(wxDowAvgs[i].rel))),
                      h('span',{style:{color:'var(--muted-2)'}}, 'per'),
                      ...DAY_NAMES.map((_, i) => h('span',{style:{textAlign:'right',fontFamily:"'Libre Baskerville', serif"}}, fmt(wxDowAvgs[i].per))),
                    )
                  );
                  // Prediction — per-DOW probability per active series
                  const pctDowTable = h('div',{},
                    h('div',{style:{...headerStyle, marginBottom:'4px'}}, 'Per-DOW probability (each series)'),
                    h('div',{style:{
                      display:'grid',
                      gridTemplateColumns:'auto repeat(7, minmax(0,1fr)) auto auto',
                      gap:'2px 6px', fontSize:'10px', color:'var(--muted)', alignItems:'center',
                    }},
                      h('span',{},''),
                      ...DAY_NAMES.map(n => h('span',{style:{textAlign:'right',fontWeight:'600',color:'var(--muted-2)'}}, n)),
                      h('span',{style:{textAlign:'right',color:'var(--muted-2)'}}, 'n'),
                      h('span',{style:{textAlign:'right',color:'var(--muted-2)'}}, 'first'),
                      ...PCT_SERIES.flatMap(s => [
                        h('span',{style:{color: s.color}}, s.label),
                        ...DAY_NAMES.map((_, i) => h('span',{style:{textAlign:'right',fontFamily:"'Libre Baskerville', serif"}}, fmtPct(s.dowPct[i] || 0))),
                        h('span',{style:{textAlign:'right',fontFamily:"'Libre Baskerville', serif",color: s.hasData ? 'var(--text-strong)' : 'var(--muted-2)'}}, String(s.dateSet ? s.dateSet.size : 0)),
                        h('span',{style:{textAlign:'right',fontFamily:"'Libre Baskerville', serif",fontSize:'9px'}}, seriesEarliest(s)),
                      ]),
                    )
                  );
                  // Storm — per-day probability (DOW + shock) for every negative series, plus
                  // a top row showing the rel/per shock adjustment per day (red when active).
                  // Only conflict and wobble drive shock; steadying/turndown never do.
                  const SHOCK_RECEIVERS = new Set(['conflict', 'wobble']);
                  const _cloudsSeriesDbg = PCT_SERIES.find(s => s.cat === 'cloudcover');
                  const _precipSeriesDbg = PCT_SERIES.find(s => s.cat === 'precipitation');
                  // Conflict is rel-balance, wobble is per-balance — and they're the only shock
                  // drivers, so the rel/per shock series equal those.
                  const _relShockByDay = _shocksByCombo.conflict || wxDays.map(() => 0);
                  const _perShockByDay = _shocksByCombo.wobble   || wxDays.map(() => 0);
                  const NEG_ROWS = [
                    ...Object.keys(_stormCombos).map(combo => ({
                      label: combo,
                      dowPct: _stormCombos[combo].dowPct,
                      shockArr: SHOCK_RECEIVERS.has(combo) ? (_shocksByCombo[combo] || []) : null,
                    })),
                    _cloudsSeriesDbg ? { label: 'clouds',    dowPct: _cloudsSeriesDbg.dowPct, shockArr: _aggregateShockByDay } : null,
                    _precipSeriesDbg ? { label: (_precipSeriesDbg.label || 'rain/snow').toLowerCase(), dowPct: _precipSeriesDbg.dowPct, shockArr: _precipShockByDay } : null,
                  ].filter(Boolean);
                  const dayColStyles = wxDays.map(d => d.isToday
                    ? {fontWeight:'600', color:'var(--text-strong)'}
                    : (d.isPast ? {color:'var(--muted-2)'} : {}));
                  const shockColor = 'var(--c-conflict)';
                  // Top section — rel/per shock magnitudes per day.
                  const shockHeaderRow = (label, arr) => [
                    h('span',{style:{color:'var(--muted)'}}, label),
                    ...wxDays.map((d, idx) => {
                      const v = arr[idx] || 0;
                      const cellStyle = {textAlign:'right',fontFamily:"'Libre Baskerville', serif", ...dayColStyles[idx]};
                      if (v > 0) cellStyle.color = shockColor;
                      return h('span',{style:cellStyle}, v > 0 ? fmtPct(v) : '·');
                    }),
                  ];
                  const stormDayTable = h('div',{},
                    h('div',{style:{...headerStyle, marginBottom:'4px'}}, 'Per-day probability (DOW + shock)'),
                    h('div',{style:{
                      display:'grid',
                      gridTemplateColumns: 'auto repeat(' + wxDays.length + ', minmax(0,1fr))',
                      gap:'2px 6px', fontSize:'10px', color:'var(--muted)', alignItems:'center',
                    }},
                      h('span',{}, ''),
                      ...wxDays.map((d, idx) => {
                        const label = d.isToday ? 'Today' : DAY_NAMES[d.dow] + ' ' + (d.offset > 0 ? '+' + d.offset : d.offset);
                        return h('span',{style:{textAlign:'right',fontWeight:'600',color:'var(--muted-2)', ...dayColStyles[idx]}}, label);
                      }),
                      // Shock-only rows (rel & per) at the top.
                      ...shockHeaderRow('rel shock', _relShockByDay),
                      ...shockHeaderRow('per shock', _perShockByDay),
                      // Per-series totals (DOW + shock). Shock-adjusted cells render red.
                      ...NEG_ROWS.flatMap(r => [
                        h('span',{}, r.label),
                        ...wxDays.map((d, idx) => {
                          const dow   = r.dowPct[d.dow] || 0;
                          const shock = (r.shockArr && r.shockArr[idx]) || 0;
                          const total = Math.min(1, dow + shock);
                          const cellStyle = {textAlign:'right',fontFamily:"'Libre Baskerville', serif", ...dayColStyles[idx]};
                          if (shock > 0) cellStyle.color = shockColor;
                          return h('span',{style:cellStyle}, fmtPct(total));
                        }),
                      ]),
                    ),
                  );
                  const stormMatrix = (() => {
                    const combos = Object.keys(STORM_MATRIX);
                    const hiBg = 'rgba(210,160,40,0.20)';
                    const hiBorder = '1px solid rgba(210,160,40,0.5)';
                    return h('div',{style:{marginTop:'12px'}},
                      h('div',{style:{...headerStyle, marginBottom:'6px'}}, 'Storm matrix'),
                      h('div',{style:{
                        display:'grid',
                        gridTemplateColumns: '100px repeat(' + ZONE_BANDS.length + ', minmax(0,1fr))',
                        gap:'2px 4px', fontSize:'10px', alignItems:'center',
                      }},
                        h('span',{}, ''),
                        ...ZONE_BANDS.map((z) => h('span',{style:{textAlign:'center', fontSize:'16px', opacity:'0.85'}}, z.icon)),
                        h('span',{style:{color:'var(--muted-2)', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.04em'}}, 'state'),
                        ...ZONE_BANDS.map((z) => h('span',{style:{textAlign:'center', color:'var(--muted-2)', fontSize:'9px'}}, z.label)),
                        ...combos.flatMap(combo => {
                          const _tdIdx2 = wxDays.findIndex(d => d.isToday);
                          const shockToday = (_shocksByCombo[combo] && _tdIdx2 >= 0)
                            ? (_shocksByCombo[combo][_tdIdx2] || 0) : 0;
                          const totalToday = Math.min(1, _stormCombos[combo].todayProb + shockToday);
                          const isActiveTotal = totalToday > 0;
                          return [
                            h('span',{style:{
                              color: isActiveTotal ? 'var(--text-strong)' : 'var(--muted)',
                              fontWeight: isActiveTotal ? '600' : '400',
                              fontSize:'10px',
                            }}, combo + ' (' + _stormCombos[combo].balance + ')'),
                            ...ZONE_BANDS.map(z => {
                              const cell = STORM_MATRIX[combo][z.key];
                              const isCurrent = isActiveTotal && z.key === _stormCombos[combo].zoneKey;
                              // Mirror the chart-icon size scaling so the matrix
                              // shows the same visual severity progression.
                              const iconSize = Math.round(16 * (STORM_ZONE_SIZE[z.key] || 1));
                              return h('div',{
                                style:{
                                  textAlign:'center', padding:'3px 4px',
                                  background: isCurrent ? hiBg : 'transparent',
                                  border: isCurrent ? hiBorder : '1px solid transparent',
                                  borderRadius:'4px',
                                  color: isCurrent ? 'var(--text-strong)' : 'var(--muted)',
                                  display:'flex', flexDirection:'column', alignItems:'center', gap:'2px',
                                },
                                title: cell.icon + ' ' + cell.label,
                              },
                                h('div',{style:{fontSize: iconSize + 'px', lineHeight:'1'}}, cell.icon),
                                h('div',{style:{
                                  fontSize:'9px', lineHeight:'1.2',
                                  fontWeight: isCurrent ? '600' : '400',
                                }}, cell.label),
                              );
                            }),
                          ];
                        }),
                      ),
                    );
                  })();
                  return h('div',{style:{
                    marginTop:'10px', padding:'10px 12px', borderRadius:'10px',
                    background:'var(--surface-1)', border:'1px solid var(--surface-2)',
                    fontFamily:"'DM Sans', sans-serif",
                  }},
                    // Forecast section
                    h('div',{style:sectionHeader}, 'Forecast chart'),
                    h('div',{style:blurbStyle},
                      'Per-DOW averages over the shared ' + PCT_WINDOW + '-day lookback, zero-contribution days skipped. Today locked to projection.'),
                    dowTable,
                    h('div',{style:dividerStyle}),
                    // Prediction section
                    h('div',{style:sectionHeader}, 'Prediction chart'),
                    h('div',{style:blurbStyle},
                      'Window = ' + PCT_WINDOW + 'd · half-life = ' + DOW_HALFLIFE + 'd · conflict/wobble use resolution recurrence, steadying/turndown full weight.'),
                    pctDowTable,
                    h('div',{style:dividerStyle}),
                    // Storm section
                    h('div',{style:sectionHeader}, 'Storm identifier'),
                    h('div',{style:blurbStyle},
                      'Each combo maps (its balance\'s zone) → storm type. Live — today\'s entries update score, zone, and icon.'),
                    stormDayTable,
                    stormMatrix,
                    h('div',{style:dividerStyle}),
                    // Forecast accuracy — predicted vs actual for the past 14 days
                    (() => {
                      const LOOKBACK = 14;
                      // Sum of scored entry contributions on `date` (no decay; daysAgo=0).
                      const contribOn = (date) => {
                        let r = 0, p = 0;
                        for (const e of allEntries) {
                          if (e.date !== date) continue;
                          if (!_hasPoints(e)) continue;
                          const s = expEntryScores(e, _capFor(e.date));
                          r += s.rel; p += s.per;
                        }
                        return { rel: r, per: p };
                      };
                      // Symmetric % accuracy: 1 − |pred−actual| / max(|pred|, |actual|, 1).
                      // Returns 0 if signs diverge enough to drive the ratio above 100%.
                      const pctAccuracy = (pred, act) => {
                        const denom = Math.max(Math.abs(pred), Math.abs(act), 1);
                        return Math.max(0, 1 - Math.abs(pred - act) / denom);
                      };
                      const rows = [];
                      let sumR = 0, sumP = 0, sumT = 0, cnt = 0;
                      for (let i = 1; i <= LOOKBACK; i++) {
                        const date = addDays(S.today, -i);
                        const dow  = new Date(date + 'T00:00:00').getDay();
                        const actualEnd = computeExperimentalScores(date);
                        const contrib   = contribOn(date);
                        const mornR = actualEnd.rel - contrib.rel;
                        const mornP = actualEnd.per - contrib.per;
                        const predR = mornR + (wxDowAvgs[dow]?.rel || 0);
                        const predP = mornP + (wxDowAvgs[dow]?.per || 0);
                        const predT = (predR + predP) / 2;
                        const actR = actualEnd.rel;
                        const actP = actualEnd.per;
                        const actT = (actR + actP) / 2;
                        const accR = pctAccuracy(predR, actR);
                        const accP = pctAccuracy(predP, actP);
                        const accT = pctAccuracy(predT, actT);
                        sumR += accR; sumP += accP; sumT += accT; cnt++;
                        rows.push({ date, dow, predR, predP, predT, actR, actP, actT, accR, accP, accT });
                      }
                      const fmtN   = (v) => (v == null ? '—' : (v >= 0 ? '+' : '') + (Math.round(v * 10) / 10).toFixed(1));
                      const fmtPctAcc = (v) => Math.round(v * 100) + '%';
                      // Color by accuracy: ≥90% dark green, ≥70% amber, <70% red.
                      const accColor = (v) => {
                        if (v >= 0.90) return '#2f7a3a';
                        if (v >= 0.70) return '#d2a028';
                        return 'var(--c-conflict)';
                      };
                      const accCell = (v) => h('span',{style:{
                        textAlign:'right', fontFamily:"'Libre Baskerville', serif",
                        color: accColor(v),
                      }}, fmtPctAcc(v));
                      const accuracyTable = h('div',{},
                        h('div',{style:{...headerStyle, marginBottom:'4px'}}, 'Forecast accuracy — past ' + LOOKBACK + ' days'),
                        h('div',{style:{
                          display:'grid',
                          gridTemplateColumns: 'auto repeat(9, minmax(0,1fr))',
                          gap:'2px 6px', fontSize:'10px', color:'var(--muted)', alignItems:'center',
                        }},
                          // Header row
                          h('span',{}, ''),
                          h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontWeight:'600'}}, 'rel pred'),
                          h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontWeight:'600'}}, 'rel act'),
                          h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontWeight:'600'}}, '%'),
                          h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontWeight:'600'}}, 'per pred'),
                          h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontWeight:'600'}}, 'per act'),
                          h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontWeight:'600'}}, '%'),
                          h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontWeight:'600'}}, 'ten pred'),
                          h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontWeight:'600'}}, 'ten act'),
                          h('span',{style:{textAlign:'right',color:'var(--muted-2)',fontWeight:'600'}}, '%'),
                          // Data rows
                          ...rows.flatMap((r, idx) => {
                            const label = DAY_NAMES[r.dow] + ' −' + (idx + 1);
                            const num = (v) => h('span',{style:{textAlign:'right',fontFamily:"'Libre Baskerville', serif"}}, fmtN(v));
                            return [
                              h('span',{}, label),
                              num(r.predR), num(r.actR), accCell(r.accR),
                              num(r.predP), num(r.actP), accCell(r.accP),
                              num(r.predT), num(r.actT), accCell(r.accT),
                            ];
                          }),
                        ),
                        h('div',{style:{fontSize:'10px',color:'var(--muted-2)',marginTop:'8px',display:'flex',gap:'14px'}},
                          h('span',{}, 'Avg accuracy:'),
                          h('span',{style:{fontFamily:"'Libre Baskerville', serif",color:accColor(sumR / Math.max(1,cnt))}}, 'rel ' + fmtPctAcc(sumR / Math.max(1, cnt))),
                          h('span',{style:{fontFamily:"'Libre Baskerville', serif",color:accColor(sumP / Math.max(1,cnt))}}, 'per ' + fmtPctAcc(sumP / Math.max(1, cnt))),
                          h('span',{style:{fontFamily:"'Libre Baskerville', serif",color:accColor(sumT / Math.max(1,cnt))}}, 'tenor ' + fmtPctAcc(sumT / Math.max(1, cnt))),
                        ),
                      );
                      return h('div',{},
                        h('div',{style:sectionHeader}, 'Forecast accuracy'),
                        h('div',{style:blurbStyle},
                          'Predicted = morning + DOW gain · Actual = end-of-day score · % = 1 − |pred − actual| / max(|pred|, |actual|). Green ≥90%, amber ≥70%, red below.'),
                        accuracyTable,
                      );
                    })(),
                  );
                })() : null,
              );
            })() : null,

          );
        })() : null,

      ),
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

    // Nudges (no header — most fire on weekly stats, not "today" signals)
    nudges.length > 0 ? h('div',{style:{marginBottom:'6px'}},
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

// Base Tenor chart — the slow EMA baseline on its own. Sits between Weather
// and Observations on the Insights page. Lookback caps at the same PCT_WINDOW
// the Climate / Weather charts use (max-event lifespan, scaled by data
// availability) rather than the old hard-coded 60-day window.
function buildBaseTenorChart() {
  const allEntries = calcEntries();
  if (allEntries.length === 0) return null;

  // Compute LOOKBACK using the same logic as buildHistoricalChart.
  const DOW_WINDOW = Math.max(7, Math.round(expLifespan(100)));
  const _dayCapByDate = {};
  for (const e of allEntries) {
    if (e.category === 'libido' && _dayCapByDate[e.date] === undefined) {
      _dayCapByDate[e.date] = bankDayCap(e);
    }
  }
  const _capFor = (date) => _dayCapByDate[date] ?? bankDayCap(null);
  const _hasPoints = (e) => {
    const { rel, per, soc } = expEntryScores(e, _capFor(e.date));
    return rel !== 0 || per !== 0 || (soc || 0) !== 0;
  };
  let firstScored = null;
  for (const e of allEntries) {
    if (e.date > S.today) continue;
    if (!_hasPoints(e)) continue;
    if (firstScored === null || e.date < firstScored) firstScored = e.date;
  }
  if (firstScored === null) return null;
  const daysSinceFirst = Math.max(1, daysBetween(firstScored, S.today));
  const daysSinceCalc = S.calcStartDate ? Math.max(1, daysBetween(S.calcStartDate, S.today)) : Infinity;
  const LOOKBACK = Math.min(DOW_WINDOW, daysSinceFirst, daysSinceCalc);
  if (LOOKBACK <= 0) return null;

  const btd = computeBaseTenorData(LOOKBACK);
  if (!btd) return null;
  const { baseTenor, series } = btd;
  // Single neutral color — value-neutral (not green = good or red = bad), but
  // cheerful enough to read as a baseline rather than a warning. Soft teal sits
  // apart from rel pink, per blue, green/red zone bands, and the muted gray
  // tenor reference line.
  const baseColor = '#4eb8b0';

  // Mini SVG line chart — fixed pixel width that scales via viewBox to the container.
  const W = 280, H = 96;
  const padL = 32, padR = 6, padT = 6, padB = 18;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const chartStart = addDays(S.today, -(LOOKBACK - 1));

  const allVals = [...series.map(p => p.tenor), ...series.map(p => p.base), 0];
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const rawRange = rawMax - rawMin || 1;
  const roughStep = rawRange / 3;
  const mag = Math.pow(10, Math.floor(Math.log10(roughStep || 1)));
  const yStep = Math.max(Math.ceil(roughStep / mag) * mag, 1);
  const tickMin = Math.floor(rawMin / yStep) * yStep;
  const tickMax = Math.ceil(rawMax / yStep) * yStep;
  const yTicks = [];
  for (let t = tickMin; t <= tickMax + 0.01; t += yStep) yTicks.push(Math.round(t));
  const domMin = tickMin - yStep * 0.2;
  const domMax = tickMax + yStep * 0.2;
  const rangeV = domMax - domMin || 1;

  const xOf = d => padL + (daysBetween(chartStart, d) / Math.max(1, LOOKBACK - 1)) * plotW;
  const yOf = v => padT + plotH - ((v - domMin) / rangeV) * plotH;
  const ptsTenor = series.map(p => xOf(p.date).toFixed(1) + ',' + yOf(p.tenor).toFixed(1)).join(' ');
  const ptsBase  = series.map(p => xOf(p.date).toFixed(1) + ',' + yOf(p.base).toFixed(1)).join(' ');

  const mkSvg  = (tag, attrs) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v)); return el; };
  const txt = (content, attrs) => { const el = mkSvg('text', attrs); el.textContent = content; return el; };

  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svgEl.style.cssText = 'display:block;width:100%;height:auto;overflow:visible;';

  // Axes
  svgEl.appendChild(mkSvg('line', {x1:padL, y1:padT, x2:padL, y2:padT+plotH, stroke:'var(--border)', 'stroke-width':'0.8'}));
  const zeroY = yOf(0);
  const xAxisY = (zeroY >= padT && zeroY <= padT + plotH) ? zeroY : padT + plotH;
  svgEl.appendChild(mkSvg('line', {x1:padL, y1:xAxisY.toFixed(1), x2:padL+plotW, y2:xAxisY.toFixed(1), stroke:'var(--border)', 'stroke-width':'0.8'}));

  // Y ticks + labels
  for (const t of yTicks) {
    const ty = yOf(t);
    if (ty < padT - 2 || ty > padT + plotH + 2) continue;
    svgEl.appendChild(mkSvg('line', {x1:padL-3, y1:ty.toFixed(1), x2:padL, y2:ty.toFixed(1), stroke:'var(--border)', 'stroke-width':'0.8'}));
    svgEl.appendChild(txt(t === 0 ? '0' : (t > 0 ? '+' : '') + t, {x:String(padL - 5), y:ty.toFixed(1), 'text-anchor':'end', 'dominant-baseline':'middle', 'font-size':'8', fill:'var(--text-strong)', 'font-family':"'DM Sans',sans-serif"}));
  }

  // X labels
  svgEl.appendChild(txt(fmtS(chartStart), {x:String(padL), y:String(padT + plotH + 12), 'text-anchor':'start', 'font-size':'8', fill:'var(--muted)', 'font-family':"'DM Sans',sans-serif"}));
  svgEl.appendChild(txt('Today', {x:String(padL + plotW), y:String(padT + plotH + 12), 'text-anchor':'end', 'font-size':'8', fill:'var(--muted)', 'font-family':"'DM Sans',sans-serif"}));

  // Data lines — Tenor (thin/muted), Base Tenor (bold EMA).
  svgEl.appendChild(mkSvg('polyline', {points:ptsTenor, fill:'none', stroke:'var(--muted-3)', 'stroke-width':'1', 'stroke-linecap':'round', 'stroke-linejoin':'round', opacity:'0.55'}));
  svgEl.appendChild(mkSvg('polyline', {points:ptsBase,  fill:'none', stroke:baseColor, 'stroke-width':'2', 'stroke-linecap':'round', 'stroke-linejoin':'round'}));
  if (series.length) {
    const last = series[series.length - 1];
    svgEl.appendChild(mkSvg('circle', {cx:xOf(last.date).toFixed(1), cy:yOf(last.base).toFixed(1), r:'3.5', fill:baseColor}));
  }

  return h('div', { style:{ marginBottom:'14px' } },
    h('div', { class:'ins-section' },
      h('div', { class:'ins-section-title', style:{ fontWeight:'600' } }, 'Base Atmosphere'),
    ),
    h('div', { style:{ fontSize:'11px', color:'var(--muted)', marginBottom:'10px', lineHeight:'1.6' } },
      'Your emotional baseline — where your relationship and inner life have typically been sitting over the last ' + LOOKBACK + ' days. It moves slowly, so when it shifts, something has genuinely changed.'),
    h('div',{style:{padding:'12px 14px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:'14px'}},
      h('div',{style:{textAlign:'right', marginBottom:'8px'}},
        h('div',{style:{fontSize:'10px', fontWeight:'600', letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--muted)', marginBottom:'2px'}}, 'Base Atmosphere'),
        h('div',{style:{fontFamily:"'Libre Baskerville',serif", fontSize:'26px', fontWeight:'400', color:baseColor, lineHeight:'1'}},
          (baseTenor >= 0 ? '+' : '') + baseTenor.toFixed(1)),
      ),
      svgEl,
      h('div',{style:{display:'flex', gap:'14px', marginTop:'8px'}},
        h('div',{style:{display:'flex', alignItems:'center', gap:'5px'}},
          h('div',{style:{width:'20px', height:'2px', borderRadius:'1px', background:'var(--muted-3)', opacity:'0.7'}}),
          h('span',{style:{fontSize:'10px', color:'var(--muted)'}}, 'Atmosphere'),
        ),
        h('div',{style:{display:'flex', alignItems:'center', gap:'5px'}},
          h('div',{style:{width:'20px', height:'2.5px', borderRadius:'1px', background:baseColor}}),
          h('span',{style:{fontSize:'10px', color:'var(--muted)'}}, 'Base Atmosphere'),
        ),
      ),
    ),
  );
}

// Positivity ratio (Gottman-style) — for each window we compute positive vs
// negative for two flavors:
//   - Points (summed scored impact)
//   - Events (logged event counts)
// for both Relational and Personal balances. Bands: ≥5 green, 3–5 amber,
// below red, matching the Gottman 5:1 framing.
function buildPositivityRatioCard() {
  const allEntries = calcEntries();
  if (allEntries.length === 0) return null;

  // Day-cap cache so libido entries influence the right day's caps.
  const _dayCapByDate = {};
  for (const e of allEntries) {
    if (e.category === 'libido' && _dayCapByDate[e.date] === undefined) {
      _dayCapByDate[e.date] = bankDayCap(e);
    }
  }
  const capFor = (date) => _dayCapByDate[date] ?? bankDayCap(null);

  const WINDOWS = [
    { days: 7,  label: '7 day' },
    { days: 30, label: '30 day' },
    { days: 60, label: '60 day' },
  ];

  const REL_POS_CATS = new Set(['affection']);          // bonding
  const REL_POS_PHYS = true;                             // physical w/ partner counts as bonding/intimacy
  const REL_NEG_CATS = new Set(['conflict', 'turndown']);
  const PER_POS_CATS = new Set(['restore']);
  const PER_NEG_CATS = new Set(['regulation', 'burnout']);

  const compute = (days) => {
    let start = addDays(S.today, -(days - 1));
    // Clip the window so it never reaches back further than the debug
    // calcStartDate (if set) — otherwise the "60 day" ratio would lean on
    // data that's being deliberately ignored by every other calculation.
    if (S.calcStartDate && S.calcStartDate > start) start = S.calcStartDate;
    let relPos = 0, relNeg = 0, perPos = 0, perNeg = 0;
    let bondCount = 0, conflictCount = 0;
    let restoreCount = 0, wobbleCount = 0;
    // In Individual mode, Social fills the relational positivity slot.
    const isIndPos = S.relationshipMode === 'individual';
    for (const e of allEntries) {
      if (e.date < start || e.date > S.today) continue;
      const { rel, per, soc } = expEntryScores(e, capFor(e.date));
      const primary = isIndPos ? (soc || 0) : rel;
      if (primary > 0) relPos += primary;
      if (primary < 0) relNeg += -primary;
      if (per > 0) perPos += per;
      if (per < 0) perNeg += -per;
      // Relational counts (or Social in Individual mode)
      if (isIndPos) {
        if (e.category === 'social')   bondCount++;
        if (e.category === 'friction') conflictCount++;
      } else {
        if (REL_POS_CATS.has(e.category)) bondCount++;
        else if (REL_POS_PHYS && e.category === 'physical' && !e.solo) bondCount++;
        else if (REL_NEG_CATS.has(e.category)) conflictCount++;
      }
      // Personal counts
      if (PER_POS_CATS.has(e.category)) restoreCount++;
      else if (PER_NEG_CATS.has(e.category)) wobbleCount++;
    }
    return {
      relPoints: { pos: Math.round(relPos), neg: Math.round(relNeg) },
      perPoints: { pos: Math.round(perPos), neg: Math.round(perNeg) },
      relCounts: { pos: bondCount, neg: conflictCount },
      perCounts: { pos: restoreCount, neg: wobbleCount },
    };
  };

  const data = WINDOWS.map(w => ({ ...w, vals: compute(w.days) }));

  const fmtRatio = (pos, neg) => {
    if (pos === 0 && neg === 0) return '—';
    if (neg === 0) return pos + ':0';
    return (pos / neg).toFixed(1) + ':1';
  };
  // Six bands matching the app's zone system (Thriving → Hurting). Colors are
  // lighter tints so black text reads cleanly across every band.
  const ratioBand = (pos, neg) => {
    if (pos === 0 && neg === 0) return { color:'transparent',          label:'No data' };
    if (neg === 0) return                { color:'rgba(77,196,120,0.55)', label:'Thriving' };
    const r = pos / neg;
    if (r >= 5) return                   { color:'rgba(77,196,120,0.55)', label:'Thriving' };
    if (r >= 4) return                   { color:'rgba(168,196,140,0.55)', label:'Healthy' };
    if (r >= 3) return                   { color:'rgba(210,200,120,0.55)', label:'Progressing' };
    if (r >= 2) return                   { color:'rgba(224,160,80,0.55)',  label:'Unsettled' };
    if (r >= 1) return                   { color:'rgba(224,100,80,0.55)',  label:'Difficult' };
    return                                { color:'rgba(224,53,53,0.55)',   label:'Hurting' };
  };
  const ratioColor = (pos, neg) => ratioBand(pos, neg).color;

  const cellLabel = (txt) => h('div',{style:{
    color:'var(--muted)', fontSize:'12px', lineHeight:'1.3',
  }}, txt);
  const cellRatio = (pos, neg) => {
    const band = ratioBand(pos, neg);
    const noData = pos === 0 && neg === 0;
    return h('div',{style:{
      textAlign:'center', fontFamily:"'Libre Baskerville', serif",
      fontSize:'13px', fontWeight:'400',
      color: noData ? 'var(--muted-2)' : 'var(--text-strong)',
      background: noData ? 'transparent' : band.color,
      padding:'3px 6px', borderRadius:'4px', lineHeight:'1.2',
    }}, fmtRatio(pos, neg));
  };
  const sectionRow = (txt) => h('div',{style:{
    gridColumn:'1/-1', fontSize:'10px', fontWeight:'400',
    color:'var(--muted)', letterSpacing:'0.05em',
    textTransform:'uppercase', marginTop:'8px', paddingBottom:'2px',
    borderBottom:'1px solid var(--surface-2)',
  }}, txt);
  const swatch = (color) => h('span',{style:{
    display:'inline-block', width:'8px', height:'8px',
    background:color, borderRadius:'50%', marginRight:'4px',
    verticalAlign:'middle',
  }});

  return h('div', { style:{ marginBottom:'14px' } },
    h('div', { class:'ins-section' },
      h('div', { class:'ins-section-title', style:{ fontWeight:'600' } }, 'Positivity ratio'),
    ),
    // Band legend — uses the app's zone names so the meaning carries.
    h('div',{style:{
      display:'flex', flexWrap:'wrap', gap:'8px 12px',
      fontSize:'10px', color:'var(--muted)', marginBottom:'10px',
    }},
      h('span',{}, swatch('rgba(77,196,120,0.55)'),  '≥ 5:1 Thriving'),
      h('span',{}, swatch('rgba(168,196,140,0.55)'), '≥ 4:1 Healthy'),
      h('span',{}, swatch('rgba(210,200,120,0.55)'), '≥ 3:1 Progressing'),
      h('span',{}, swatch('rgba(224,160,80,0.55)'),  '≥ 2:1 Unsettled'),
      h('span',{}, swatch('rgba(224,100,80,0.55)'),  '≥ 1:1 Difficult'),
      h('span',{}, swatch('rgba(224,53,53,0.55)'),   '< 1:1 Hurting'),
    ),
    h('div', { style:{
      padding:'12px 14px', background:'var(--bg2)',
      border:'1px solid var(--border)', borderRadius:'14px',
      display:'grid',
      gridTemplateColumns:'auto repeat(3, minmax(0,1fr))',
      gap:'8px 8px', alignItems:'baseline',
    }},
      // Window header
      h('div', {}),
      ...WINDOWS.map(w => h('div',{style:{
        textAlign:'right', color:'var(--muted-2)', fontSize:'11px',
        fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.05em',
      }}, w.label)),

      // POINTS section — positive vs negative scored impact.
      sectionRow('Points — positive : negative impact'),
      cellLabel(S.relationshipMode === 'individual' ? 'Social' : 'Relational'),
      ...data.map(d => cellRatio(d.vals.relPoints.pos, d.vals.relPoints.neg)),
      cellLabel('Personal'),
      ...data.map(d => cellRatio(d.vals.perPoints.pos, d.vals.perPoints.neg)),

      // EVENTS section — count of positive vs negative logged events.
      sectionRow('Events — positive : negative count'),
      cellLabel(S.relationshipMode === 'individual' ? 'Social' : 'Relational'),
      ...data.map(d => cellRatio(d.vals.relCounts.pos, d.vals.relCounts.neg)),
      cellLabel('Personal'),
      ...data.map(d => cellRatio(d.vals.perCounts.pos, d.vals.perCounts.neg)),
    ),
  );
}

// Storm matrix definitions — a static reference table. Columns are the 6
// impact-tier % cutoffs we use to size storm icons; rows are the four storm
// combos. Each cell shows the combo's icon at the size that tier represents,
// so users can see the storm progression as a legend. No live data, no
// current-state highlighting.
function buildStormMatrixDebug() {
  // Per-tier icon size multiplier (applied to the matrix's base 16px).
  const IMPACT_SIZES = [0.5, 0.7, 0.9, 1.1, 1.4, 1.7]; // tiers 1..6
  // Top header row shows the 6 impact-tier % cutoffs. Point values use a
  // uniform max of 100 across every combo — if a combo's actual max is lower
  // (e.g. steadying with light caretaker types), the upper tiers simply won't
  // be hit, but the labels stay consistent across the whole matrix.
  const ZONE_BANDS_LOCAL = [
    { key: 'thriving',    label: 'Thriving',    threshold: '≤ 10%',  points: '≤ 10 pt' },
    { key: 'healthy',     label: 'Healthy',     threshold: '≤ 20%',  points: '≤ 20 pt' },
    { key: 'progressing', label: 'Progressing', threshold: '≤ 30%',  points: '≤ 30 pt' },
    { key: 'unsettled',   label: 'Unsettled',   threshold: '≤ 40%',  points: '≤ 40 pt' },
    { key: 'difficult',   label: 'Difficult',   threshold: '≤ 50%',  points: '≤ 50 pt' },
    { key: 'hurting',     label: 'Hurting',     threshold: '> 50%',  points: '> 50 pt' },
  ];
  const headerStyle = {
    fontSize:'10px', fontWeight:'600', color:'var(--text-strong)',
    letterSpacing:'0.05em', textTransform:'uppercase',
  };
  const hiBg = 'rgba(210,160,40,0.20)';
  const hiBorder = '1px solid rgba(210,160,40,0.5)';
  // Only include combos whose category is currently enabled — disabled
  // categories can't produce events, so their rows are noise here.
  const isComboEnabled = (combo) => {
    if (combo === 'conflict')  return S.showConflict;
    if (combo === 'turndown')  return S.showPhysical;
    if (combo === 'wobble')    return S.showRegulation;
    if (combo === 'steadying') return S.showCaretaker;
    if (combo === 'friction')  return S.relationshipMode === 'individual';
    return true;
  };
  const combos = Object.keys(STORM_MATRIX).filter(isComboEnabled);
  if (combos.length === 0) return null;
  return h('div', {style:{
    marginTop:'10px', marginBottom:'14px',
    padding:'10px 12px', borderRadius:'10px',
    background:'var(--surface-1)', border:'1px solid var(--surface-2)',
    fontFamily:"'DM Sans', sans-serif",
  }},
    // Title rendered inside the panel so it reads as a debug card, matching
    // the home page debug panels' visual convention.
    h('div',{style:{...headerStyle, marginBottom:'10px'}}, 'Storm matrix debug'),
    h('div',{},
      h('div',{style:{
        display:'grid',
        gridTemplateColumns: '100px repeat(' + ZONE_BANDS_LOCAL.length + ', minmax(0,1fr))',
        gap:'2px 4px', fontSize:'10px', alignItems:'center',
      }},
        // Header row: tier % thresholds across the columns.
        h('span',{}, ''),
        ...ZONE_BANDS_LOCAL.map(z => h('span',{style:{
          textAlign:'center', fontSize:'10px', fontFamily:"'Libre Baskerville', serif",
          color:'var(--text-strong)',
        }}, z.threshold)),
        // Data rows — one per storm combo. Icon size in each column comes from
        // the column's own tier multiplier (column 1 = smallest, column 6 = biggest).
        ...combos.flatMap(combo => {
          const meta = STORM_COMBO_META[combo] || {};
          return [
            h('span',{style:{
              color:'var(--text-strong)', fontWeight:'600',
              fontSize:'10px',
            }}, combo + ' (' + (meta.balance || '?') + ')'),
            ...ZONE_BANDS_LOCAL.map((z, colIdx) => {
              const cell = STORM_MATRIX[combo][z.key];
              const iconSize = Math.round(16 * IMPACT_SIZES[colIdx]);
              // Most-severe tier: render the base storm icon with a warning
              // badge (⚠️) overlaid at 50% size, instead of relying on the
              // bang/lightning glyph baked into the cell string.
              const isSevere = z.key === 'hurting';
              const baseIcon = isSevere
                ? cell.icon.replace('⚠️','').trim()
                : cell.icon;
              const overlaySize = Math.round(iconSize * 0.5);
              return h('div',{
                style:{
                  textAlign:'center', padding:'3px 4px',
                  color:'var(--muted)',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:'2px',
                },
                title: cell.icon + ' ' + cell.label,
              },
                h('div',{style:{position:'relative', display:'inline-block', lineHeight:'1'}},
                  h('div',{style:{fontSize: iconSize + 'px', lineHeight:'1'}}, baseIcon),
                  isSevere ? h('div',{style:{
                    position:'absolute',
                    top:'-2px', right:'-' + Math.round(overlaySize * 0.3) + 'px',
                    fontSize: overlaySize + 'px', lineHeight:'1',
                    pointerEvents:'none',
                  }}, '⚠️') : null,
                ),
                h('div',{style:{fontSize:'9px', lineHeight:'1.2'}}, cell.label),
                h('div',{style:{
                  fontSize:'9px', lineHeight:'1.2',
                  fontFamily:"'Libre Baskerville', serif",
                  color:'var(--text-strong)',
                }}, z.points),
              );
            }),
          ];
        }),
      ),
    ),
  );
}

// Climate (cumulative end-of-day scores, lifetime zones). Storm icons size
// by actual point impact of the day's events (sum across multiple events of
// the same combo).
function buildClimateChart() {
  return buildHistoricalChart({
    mode: 'cumulative',
    title: 'Climate',
    blurb: 'See how your atmosphere, relational, and personal scores have changed and developed over the last N days.',
    iconSizing: 'points',
  });
}

// Weather (per-day contribution, daily zones). What each day actually was —
// sharp, immediate, using the Log calendar's daily-change thresholds. Storm
// icons size by actual point impact of the day's events.
// Blurb is a function so it adapts to the active Tenor/Combined mode.
function buildWeatherChart() {
  return buildHistoricalChart({
    mode: 'velocity',
    title: 'Weather',
    blurb: () => {
      const isSplit = S._weatherBarMode === 'split';
      if (isSplit) {
        return 'How much each day moved your relational (pink) and personal (blue) balance.';
      }
      return 'How much each day moved your overall atmosphere.';
    },
    iconSizing: 'points',
  });
}

// ── Historical chart core — horizontally-scrollable backward view. Compact
// (day label + zone icon header, rel/per lines, storm icons on logged days).
// Lookback caps at the same PCT_WINDOW the home page uses (min of max-event
// lifespan, days since first scored entry, days since calcStartDate).
function buildHistoricalChart(opts) {
  const isVelocity = opts.mode === 'velocity';
  // Icon sizing mode: 'zone' (default) = current zone's STORM_ZONE_SIZE
  // multiplier; 'points' = tiered by that day's actual summed |impact| for
  // the combo (mirrors the storm-matrix point tiers: ≤10 / ≤20 / ≤30 / ≤40
  // / ≤50 / >50 pt).
  const iconSizingMode = opts.iconSizing || 'zone';
  const POINT_TIER_SIZES = [0.5, 0.7, 0.9, 1.1, 1.4, 1.7];
  const pointTierFor = (absImpact) => {
    if (absImpact > 50) return 6;
    if (absImpact > 40) return 5;
    if (absImpact > 30) return 4;
    if (absImpact > 20) return 3;
    if (absImpact > 10) return 2;
    return 1;
  };
  const stormIconSize = (zoneKey, summedImpact) => {
    if (iconSizingMode === 'points') {
      return Math.round(30 * POINT_TIER_SIZES[pointTierFor(Math.abs(summedImpact)) - 1]);
    }
    return Math.round(30 * (STORM_ZONE_SIZE[zoneKey] || 1));
  };
  const allEntries = calcEntries();
  if (allEntries.length === 0) return null;
  const zones7 = getBounds();
  const dailyZones = _dailyZoneBounds();
  // Helpers that pick the right zone scale per chart mode.
  const headerZoneIcon = (v) => isVelocity
    ? _dailyZoneIconFor(v, dailyZones)
    : _zoneIconFor(v, zones7);
  const stormZoneKey = (v) => isVelocity
    ? _dailyStormZoneKeyFor(v, dailyZones)
    : _stormZoneKeyFor(v, zones7);

  // Lookback window. expLifespan(100) ≈ 63 days with default weights.
  const DOW_WINDOW = Math.max(7, Math.round(expLifespan(100)));
  const _dayCapByDate = {};
  for (const e of allEntries) {
    if (e.category === 'libido' && _dayCapByDate[e.date] === undefined) {
      _dayCapByDate[e.date] = bankDayCap(e);
    }
  }
  const _capFor = (date) => _dayCapByDate[date] ?? bankDayCap(null);
  const _hasPoints = (e) => {
    const { rel, per, soc } = expEntryScores(e, _capFor(e.date));
    return rel !== 0 || per !== 0 || (soc || 0) !== 0;
  };
  let firstScored = null;
  for (const e of allEntries) {
    if (e.date > S.today) continue;
    if (!_hasPoints(e)) continue;
    if (firstScored === null || e.date < firstScored) firstScored = e.date;
  }
  if (firstScored === null) return null;
  const daysSinceFirst = Math.max(1, daysBetween(firstScored, S.today));
  const daysSinceCalc = S.calcStartDate ? Math.max(1, daysBetween(S.calcStartDate, S.today)) : Infinity;
  const LOOKBACK = Math.min(DOW_WINDOW, daysSinceFirst, daysSinceCalc);
  if (LOOKBACK <= 0) return null;

  // Per-day morning + afternoon scores
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const contributionOnDate = (date) => {
    let r = 0, p = 0, s = 0;
    for (const e of allEntries) {
      if (e.date !== date) continue;
      if (!_hasPoints(e)) continue;
      const { rel, per, soc } = expEntryScores(e, _capFor(e.date));
      r += rel; p += per; s += (soc || 0);
    }
    return { rel: r, per: p, soc: s };
  };
  const days = [];
  for (let off = -LOOKBACK; off <= 0; off++) {
    const date = addDays(S.today, off);
    const dow = new Date(date + 'T00:00:00').getDay();
    const decayOnly = computeExperimentalScores(date);
    const contrib = contributionOnDate(date);
    days.push({
      offset: off, date, dow, isToday: off === 0,
      morning:      { rel: decayOnly.rel - contrib.rel, per: decayOnly.per - contrib.per, soc: (decayOnly.soc || 0) - contrib.soc },
      afternoon:    { rel: decayOnly.rel, per: decayOnly.per, soc: decayOnly.soc || 0 },
      contribution: { rel: contrib.rel, per: contrib.per, soc: contrib.soc },
    });
  }
  // Per-day value picker: cumulative chart plots end-of-day score; velocity
  // chart plots the day's own contribution (its rel/per delta).
  const valFor = (d) => isVelocity ? d.contribution : d.afternoon;

  // Storm impact per (date, balance, combo) for icon picking
  const _stormCatToCombo = {};
  for (const [combo, meta] of Object.entries(STORM_COMBO_META)) _stormCatToCombo[meta.cat] = combo;
  const _stormImpactByDate = {};
  for (const e of allEntries) {
    const combo = _stormCatToCombo[e.category];
    if (!combo) continue;
    if (!_hasPoints(e)) continue;
    const scores = expEntryScores(e, _capFor(e.date));
    const meta = STORM_COMBO_META[combo];
    // In Individual mode the "rel" slot is fed by social entries
    // (so friction's score actually lives on scores.soc, not scores.rel).
    const impact = meta.balance === 'rel'
      ? (S.relationshipMode === 'individual' ? (scores.soc || 0) : scores.rel)
      : scores.per;
    const day = (_stormImpactByDate[e.date] ||= { rel:{}, per:{} });
    day[meta.balance][combo] = (day[meta.balance][combo] || 0) + impact;
  }
  const pickMostNegative = (combosMap) => {
    let best = null;
    for (const [combo, impact] of Object.entries(combosMap)) {
      if (best === null) { best = { combo, impact }; continue; }
      if (impact < best.impact) { best = { combo, impact }; continue; }
      if (impact === best.impact && (STORM_PRIORITY[combo] ?? 99) < (STORM_PRIORITY[best.combo] ?? 99)) {
        best = { combo, impact };
      }
    }
    return best;
  };

  // Y-axis range — shared by rel and per so the two series are directly
  // comparable (one rel-spike vs. a same-magnitude per-spike read at the
  // same height).
  let lo = 0, hi = 0;
  for (const d of days) {
    const v = valFor(d);
    // Include soc in the y-axis range so the Social line/bar fits the scale
    // in Individual mode (it's 0 in other modes, no effect).
    lo = Math.min(lo, v.rel, v.per, v.soc || 0);
    hi = Math.max(hi, v.rel, v.per, v.soc || 0);
  }
  // Pad range; keep zero visible
  const padRange = (a, b) => {
    if (a === b) { a -= 10; b += 10; }
    const span = b - a;
    const pad = Math.max(5, span * 0.1);
    return [a - pad, b + pad];
  };
  const [relLo, relHi] = padRange(lo, hi);
  const [perLo, perHi] = [relLo, relHi];

  // Layout — header holds: day label, date, zone icon, tenor score.
  // Font sizes bumped up for legibility — header is taller, columns wider.
  // DAY_W scales with the user's pinch-zoom level (transient, shared across
  // Climate & Weather so both stay visually consistent). Max zoom (2.6x)
  // targets roughly 4-5 days visible on a typical phone viewport; min zoom
  // (0.5x) targets ~10 days for a quick overview.
  const BASE_DAY_W = 68;
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2.6;
  const zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, S._historicalZoom || 1));
  const DAY_W = Math.round(BASE_DAY_W * zoomLevel);
  const HEAD_H = 90;
  const maxSpan = Math.max(relHi - relLo, perHi - perLo, 50);
  const LINE_H = Math.min(280, Math.max(90, Math.round(80 + maxSpan * 0.55)));
  const SVG_H = HEAD_H + LINE_H;
  const AXIS_W = 36;
  const TOTAL_W = days.length * DAY_W;
  const chartTop = HEAD_H + 6;
  const chartBot = SVG_H - 6;
  const yOfRel = v => chartBot - ((v - relLo) / (relHi - relLo)) * (chartBot - chartTop);
  const yOfPer = v => chartBot - ((v - perLo) / (perHi - perLo)) * (chartBot - chartTop);
  const xOf = i => i * DAY_W + DAY_W / 2;

  const mk = (tag, attrs, txt) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (txt != null) el.textContent = txt;
    return el;
  };

  // Build main SVG
  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgEl.setAttribute('viewBox', `0 0 ${TOTAL_W} ${SVG_H}`);
  svgEl.setAttribute('preserveAspectRatio', 'none');
  svgEl.style.cssText = `display:block;width:${TOTAL_W}px;height:${SVG_H}px;`;
  svgEl.addEventListener('click', () => {
    if (S._stormPopup) { S._stormPopup = null; render(); }
  });

  // Horizontal zero line
  const zeroYRel = yOfRel(0);
  svgEl.appendChild(mk('line', {
    x1:'0', y1: zeroYRel.toFixed(1), x2: String(TOTAL_W), y2: zeroYRel.toFixed(1),
    stroke:'var(--surface-2)', 'stroke-width':'0.5',
  }));
  // Vertical column dividers
  for (let i = 1; i < days.length; i++) {
    const x = i * DAY_W;
    svgEl.appendChild(mk('line', {
      x1: x.toFixed(1), y1: '0', x2: x.toFixed(1), y2: String(SVG_H),
      stroke:'var(--surface-2)', 'stroke-width':'0.5',
    }));
  }

  // Row 1: day label + date + zone icon + tenor score
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const cx = xOf(i);
    const v = valFor(d);
    const tenorVal = Math.round((v.rel + v.per) / 2);
    const zi = headerZoneIcon((v.rel + v.per) / 2);
    const dateObj = new Date(d.date + 'T00:00:00');
    const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    // Day label
    svgEl.appendChild(mk('text', {
      x: cx.toFixed(1), y: '13', 'text-anchor':'middle',
      'font-size':'10', 'font-family':"'DM Sans', sans-serif",
      fill: d.isToday ? 'var(--text-strong)' : 'var(--muted)',
      'font-weight': d.isToday ? '700' : '500',
      'letter-spacing':'0.04em',
    }, d.isToday ? 'TODAY' : DAY_NAMES[d.dow].toUpperCase()));
    // Date (Mar 4 etc.)
    svgEl.appendChild(mk('text', {
      x: cx.toFixed(1), y: '27', 'text-anchor':'middle',
      'font-size':'10', 'font-family':"'DM Sans', sans-serif",
      fill: 'var(--muted-2)',
    }, dateStr));
    // Zone icon
    svgEl.appendChild(mk('text', {
      x: cx.toFixed(1), y: '54', 'text-anchor':'middle',
      'dominant-baseline':'central', 'font-size':'26',
    }, zi.icon));
    // Tenor score
    svgEl.appendChild(mk('text', {
      x: cx.toFixed(1), y: '80', 'text-anchor':'middle',
      'font-size':'12', 'font-family':"'Libre Baskerville', serif",
      fill: 'var(--text-strong)',
      'font-weight': d.isToday ? '600' : '400',
    }, (tenorVal >= 0 ? '+' : '') + tenorVal));
  }

  // Row 2 lines + storm icons are drawn by the dynamic-scale code below — they
  // re-render on scroll so the rel/per axes ease toward the visible window's range.

  // Scrollable container — SVG directly inside, drag-to-scroll for desktop.
  const scrollWrap = h('div', {
    style: {
      flex:'1', overflowX:'auto', overflowY:'hidden',
      WebkitOverflowScrolling:'touch', minWidth:'0',
      cursor:'grab', userSelect:'none', touchAction:'pan-x',
    },
  }, svgEl);
  // Pointer handling — single-pointer = drag-to-scroll, two-pointer = pinch-zoom.
  // During a pinch we apply a CSS scaleX transform to the SVG for live visual
  // feedback (no re-render — that would flash the whole page). Only on pinch
  // end do we commit the new zoom to S._historicalZoom and re-render once.
  const pointers = new Map();
  let dragging = false, dragX = 0, dragScroll = 0;
  let pinching = false, pinchStartDist = 0, pinchStartZoom = 1, pinchLastRatio = 1;
  scrollWrap.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      // Switch from drag to pinch.
      dragging = false;
      pinching = true;
      scrollWrap.style.cursor = 'grab';
      const [p1, p2] = [...pointers.values()];
      pinchStartDist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      pinchStartZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, S._historicalZoom || 1));
      pinchLastRatio = 1;
      svgEl.style.transformOrigin = '0 50%';
    } else {
      dragging = true;
      dragX = e.clientX;
      dragScroll = scrollWrap.scrollLeft;
      scrollWrap.style.cursor = 'grabbing';
      try { scrollWrap.setPointerCapture(e.pointerId); } catch(_) {}
    }
  });
  scrollWrap.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinching && pointers.size >= 2) {
      const [p1, p2] = [...pointers.values()];
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
      const proposed = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchStartZoom * (dist / pinchStartDist)));
      // Live preview only — scale the SVG visually relative to its starting state.
      pinchLastRatio = proposed / pinchStartZoom;
      svgEl.style.transform = 'scaleX(' + pinchLastRatio + ')';
    } else if (dragging) {
      scrollWrap.scrollLeft = dragScroll - (e.clientX - dragX);
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pinching && pointers.size < 2) {
      // Pinch ended — commit zoom and re-render.
      pinching = false;
      svgEl.style.transform = '';
      const finalZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pinchStartZoom * pinchLastRatio));
      if (Math.abs(finalZoom - (S._historicalZoom || 1)) > 0.01) {
        S._historicalZoom = finalZoom;
        render();
      }
    }
    if (pointers.size === 0) { dragging = false; scrollWrap.style.cursor = 'grab'; }
  };
  scrollWrap.addEventListener('pointerup',     endPointer);
  scrollWrap.addEventListener('pointercancel', endPointer);
  scrollWrap.addEventListener('pointerleave',  endPointer);

  // Y-axes — fixed range computed once from the full dataset. When a single
  // outlier blows up the range, LINE_H (above) compensates by growing the
  // chart vertically so ordinary days still have pixel space to vary in.
  const buildAxis = (lo, hi, color, side) => {
    const ax = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ax.setAttribute('viewBox', `0 0 ${AXIS_W} ${SVG_H}`);
    ax.setAttribute('preserveAspectRatio', 'none');
    ax.style.cssText = `display:block;width:${AXIS_W}px;height:${SVG_H}px;flex-shrink:0;`;
    // Velocity uses smaller ticks since one-day deltas are bounded.
    const baseTicks = isVelocity
      ? [-100, -50, -dailyZones.thriving, -dailyZones.stable, 0, dailyZones.stable, dailyZones.thriving, 50, 100]
      : [-100, -75, -50, -25, 0, 25, 50, 75, 100];
    // Deduplicate (handles cases where calStable/calThriving collide with stock values),
    // then filter to the visible range, then sort.
    const ticks = Array.from(new Set(baseTicks))
      .filter(t => t >= lo && t <= hi)
      .sort((a, b) => a - b);
    // Drop ticks that would render too close together in pixel space (labels stack).
    const filtered = [];
    const minPx = 12;
    for (const t of ticks) {
      const y = chartBot - ((t - lo) / (hi - lo)) * (chartBot - chartTop);
      if (filtered.length === 0 || Math.abs(filtered[filtered.length - 1].y - y) >= minPx) {
        filtered.push({ t, y });
      }
    }
    for (const { t, y } of filtered) {
      ax.appendChild(mk('text', {
        x: side === 'left' ? (AXIS_W - 3) : 3,
        y: y.toFixed(1),
        'text-anchor': side === 'left' ? 'end' : 'start',
        'dominant-baseline':'central',
        'font-size':'10', 'font-family':"'Libre Baskerville', serif",
        fill: color,
      }, String(t)));
    }
    return ax;
  };
  // Single Y-axis only — rel and per share a unified scale now, so a second
  // axis would just duplicate the numbers. Right side (where "today" lives)
  // is the natural place to keep it.
  const relAxisSvg = buildAxis(relLo, relHi, 'var(--text-strong)', 'right');

  // Lines (per + rel) — drawn once at the static scale.
  const drawLine = (vals, yOf, color) => {
    if (vals.length < 2) return;
    let d = 'M' + xOf(0).toFixed(1) + ',' + yOf(vals[0]).toFixed(1);
    for (let i = 1; i < vals.length; i++) {
      d += ' L' + xOf(i).toFixed(1) + ',' + yOf(vals[i]).toFixed(1);
    }
    svgEl.appendChild(mk('path', {
      d, fill:'none', stroke: color, 'stroke-width':'1.6',
      'stroke-linecap':'round', 'stroke-linejoin':'round',
    }));
  };
  // In Individual mode, the "rel" slot is occupied by Social — atmosphere
  // averages soc + per instead of rel + per.
  const isIndChartMain = S.relationshipMode === 'individual';
  const tenorVals = days.map(d => {
    const v = valFor(d);
    const r = isIndChartMain ? (v.soc || 0) : v.rel;
    return (r + v.per) / 2;
  });

  if (isVelocity) {
    // Weather chart: one bar per day (or two in 'split' mode). Color depends on mode:
    //   'tenor' — Log-calendar band tints (cumulative aggregate, sign + magnitude)
    //   'split' — side-by-side rel + per bars, each colored per its own value/balance
    // Sign reads from above/below the zero line; magnitude from bar height.
    const mode = S._weatherBarMode || 'tenor';
    const calS = S.weights.calStable   || 11;
    const calT = S.weights.calThriving || 25;
    const tenorBandColor = (v) => {
      if (v >= calT)   return 'var(--c-partner)';
      if (v >= calS)   return 'rgba(30,160,80,0.65)';
      if (v > 0)       return 'rgba(30,160,80,0.35)';
      if (v > -calS)   return 'rgba(224,130,40,0.65)';
      if (v > -calT)   return 'rgba(220,80,40,0.70)';
      return                  'var(--c-conflict)';
    };
    // Positive: type color intensity tracks the band (full / 0.65 / 0.35).
    // Negative: shared standard negative bands across both balances so a bad
    // day reads the same regardless of which balance produced it.
    // In Individual mode, the "rel" slot is occupied by Social — so use the
    // social color and the per-day soc value instead of rel.
    const isIndChart = S.relationshipMode === 'individual';
    const REL_POS_RGB = isIndChart ? '217,152,117' : '224,133,184'; // --c-social vs --c-affection
    const PER_POS_RGB = '90,184,212';                                // --c-restore
    const PRIM_POS_VAR = isIndChart ? 'var(--c-social)' : 'var(--c-affection)';
    // Pull the "positive relational-slot" value off the day record — soc in
    // Individual mode, rel otherwise. Used by the bar drawing below.
    const primOf = (v) => isIndChart ? (v.soc || 0) : v.rel;
    const typeBarColor = (v, balance) => {
      if (v < 0) {
        if (v > -calS) return 'rgba(224,130,40,0.65)';
        if (v > -calT) return 'rgba(220,80,40,0.70)';
        return                'var(--c-conflict)';
      }
      const rgb = balance === 'rel' ? REL_POS_RGB : PER_POS_RGB;
      const base = balance === 'rel' ? PRIM_POS_VAR : 'var(--c-restore)';
      if (v >= calT) return base;                          // Thriving — full type color
      if (v >= calS) return 'rgba(' + rgb + ',0.65)';       // Healthy
      return                'rgba(' + rgb + ',0.35)';       // Progressing
    };
    const zeroY = yOfRel(0);
    const drawBar = (xLeft, w, v, color) => {
      if (v === 0 || !isFinite(v)) return;
      const y1 = yOfRel(v);
      const top = Math.min(zeroY, y1);
      const ht  = Math.abs(zeroY - y1);
      svgEl.appendChild(mk('rect', {
        x: xLeft.toFixed(1), y: top.toFixed(1),
        width: w.toFixed(1), height: Math.max(1, ht).toFixed(1),
        fill: color, rx: '2', ry: '2',
      }));
    };
    // Rounded integer value drawn just above the bar's top edge — for positive
    // bars that's above the value's tip; for negative bars that's above the
    // zero line (so the label never clashes with the storm-icon row below).
    const drawValueLabel = (cx, v) => {
      if (!isFinite(v)) return;
      const rounded = Math.round(v);
      const label = (rounded > 0 ? '+' : '') + rounded;
      const topY = v >= 0 ? yOfRel(v) : zeroY;
      const y = Math.max(chartTop + 6, topY - 7);
      svgEl.appendChild(mk('text', {
        x: cx.toFixed(1), y: y.toFixed(1),
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': '11',
        'font-family': "'Libre Baskerville', serif",
        fill: 'var(--text-strong)',
      }, label));
    };
    if (mode === 'split') {
      // Total width (both bars + gap) matches the single-bar width so the
      // column footprint stays consistent across modes.
      const TOTAL_W = Math.max(8, DAY_W * 0.55);
      const GAP   = 2;
      const BAR_W = Math.max(3, (TOTAL_W - GAP) / 2);
      // Zero-value stub: when the day has activity on the OTHER balance but
      // this one came out at 0, render a small marker at the zero line in the
      // lightest positive type color (rather than showing nothing).
      const drawZeroStub = (xLeft, w, balance) => {
        const rgb = balance === 'rel' ? REL_POS_RGB : PER_POS_RGB;
        const stubH = 3;
        svgEl.appendChild(mk('rect', {
          x: xLeft.toFixed(1),
          y: (zeroY - stubH / 2).toFixed(1),
          width: w.toFixed(1),
          height: String(stubH),
          fill: 'rgba(' + rgb + ',0.35)',
          rx: '1.5', ry: '1.5',
        }));
      };
      // Every day in the window renders bars — 0-value sides show the stub at
      // the zero line so the user can see "this day was logged but balanced /
      // had no impact" rather than a missing column.
      for (let i = 0; i < days.length; i++) {
        const v = valFor(days[i]);
        const cx = xOf(i);
        const xRel = cx - GAP / 2 - BAR_W;
        const xPer = cx + GAP / 2;
        const cxRel = xRel + BAR_W / 2;
        const cxPer = xPer + BAR_W / 2;
        const primVal = primOf(v);
        if (primVal === 0) drawZeroStub(xRel, BAR_W, 'rel');
        else               drawBar(xRel, BAR_W, primVal, typeBarColor(primVal, 'rel'));
        if (v.per === 0) drawZeroStub(xPer, BAR_W, 'per');
        else             drawBar(xPer, BAR_W, v.per, typeBarColor(v.per, 'per'));
        drawValueLabel(cxRel, primVal);
        drawValueLabel(cxPer, v.per);
      }
    } else {
      // Tenor mode — single atmosphere bar per day = avg of the two positive
      // axes for the active mode (rel+per in partner/dating, soc+per in
      // Individual). Zero days render a thin stub.
      const BAR_W = Math.max(8, DAY_W * 0.55);
      const drawTenorStub = (xLeft, w) => {
        const stubH = 3;
        svgEl.appendChild(mk('rect', {
          x: xLeft.toFixed(1),
          y: (zeroY - stubH / 2).toFixed(1),
          width: w.toFixed(1),
          height: String(stubH),
          fill: 'rgba(30,160,80,0.35)',
          rx: '1.5', ry: '1.5',
        }));
      };
      for (let i = 0; i < days.length; i++) {
        const v = valFor(days[i]);
        const cx = xOf(i);
        const dayVal = (primOf(v) + v.per) / 2;
        if (dayVal === 0) {
          drawTenorStub(cx - BAR_W / 2, BAR_W);
        } else {
          drawBar(cx - BAR_W / 2, BAR_W, dayVal, tenorBandColor(dayVal));
          drawValueLabel(cx, dayVal);
        }
      }
    }
  } else {
    // Climate chart: tenor line first (under rel/per) — the midpoint, as a soft
    // dashed reference. Same yOf since rel/per share a scale.
    if (tenorVals.length >= 2) {
      let d = 'M' + xOf(0).toFixed(1) + ',' + yOfRel(tenorVals[0]).toFixed(1);
      for (let i = 1; i < tenorVals.length; i++) {
        d += ' L' + xOf(i).toFixed(1) + ',' + yOfRel(tenorVals[i]).toFixed(1);
      }
      svgEl.appendChild(mk('path', {
        d, fill:'none', stroke:'var(--muted)', 'stroke-width':'1.2',
        'stroke-dasharray':'3,3', 'stroke-linecap':'round',
        opacity:'0.7',
      }));
    }
    drawLine(days.map(d => valFor(d).per), yOfPer, 'var(--c-restore)');
    // In Individual mode, Social takes the slot Relational normally occupies —
    // it scores against the same atmosphere axis the user reads off the chart.
    if (S.relationshipMode === 'individual') {
      drawLine(days.map(d => valFor(d).soc || 0), yOfRel, 'var(--c-social)');
    } else {
      drawLine(days.map(d => valFor(d).rel), yOfRel, 'var(--c-affection)');
    }
  }

  // Base Tenor — EMA of the daily tenor, matching the love-bank widget's
  // 4-week smoothing (alpha eases toward 2/29 ≈ 28-day half-life). Climate
  // mode only; on the velocity chart a moving-average of deltas is noisy
  // and less meaningful. Drawn on top so it reads as the trend line.
  let baseTenorEnd = null;
  if (!isVelocity && tenorVals.length >= 2) {
    const SMOOTHING_TARGET = 2 / 29;
    const baseVals = [];
    let b = null;
    for (let i = 0; i < tenorVals.length; i++) {
      const alpha = Math.max(SMOOTHING_TARGET, 2 / (i + 2));
      b = b === null ? tenorVals[i] : b * (1 - alpha) + tenorVals[i] * alpha;
      baseVals.push(b);
    }
    baseTenorEnd = b;
    // Neutral baseline color — see buildBaseTenorChart for the rationale.
    const baseColor = '#4eb8b0';
    let d = 'M' + xOf(0).toFixed(1) + ',' + yOfRel(baseVals[0]).toFixed(1);
    for (let i = 1; i < baseVals.length; i++) {
      d += ' L' + xOf(i).toFixed(1) + ',' + yOfRel(baseVals[i]).toFixed(1);
    }
    svgEl.appendChild(mk('path', {
      d, fill:'none', stroke: baseColor, 'stroke-width':'2.2',
      'stroke-linecap':'round', 'stroke-linejoin':'round',
    }));
  }

  // Storm icons on event days (max 1 per balance line per day; tie-break by STORM_PRIORITY).
  const buildIconNode = (iconStr, x, y, popupKey, popupText, size) => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.style.cursor = 'pointer';
    group.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); });
    group.addEventListener('click', (ev) => {
      ev.stopPropagation();
      S._stormPopup = (S._stormPopup === popupKey) ? null : popupKey;
      render();
    });
    const baseSize = size || 30;
    // Most-severe tier convention: glyph ends with ⚠️. Render the base icon
    // alone and overlay a half-size warning shield at the top-right, matching
    // the storm matrix's debug rendering.
    const hasShield = iconStr.indexOf('⚠️') >= 0;
    if (hasShield) {
      const baseIcon = iconStr.replace('⚠️', '').trim();
      group.appendChild(mk('text', {
        x: x.toFixed(1), y: y.toFixed(1),
        'text-anchor':'middle', 'dominant-baseline':'central',
        'font-size': String(baseSize),
      }, baseIcon));
      const overlaySize = Math.round(baseSize * 0.5);
      group.appendChild(mk('text', {
        x: (x + baseSize * 0.32).toFixed(1),
        y: (y - baseSize * 0.32).toFixed(1),
        'text-anchor':'middle', 'dominant-baseline':'central',
        'font-size': String(overlaySize),
      }, '⚠️'));
    } else {
      group.appendChild(mk('text', {
        x: x.toFixed(1), y: y.toFixed(1),
        'text-anchor':'middle', 'dominant-baseline':'central',
        'font-size': String(baseSize),
      }, iconStr));
    }
    if (S._stormPopup === popupKey) {
      // Width measured from the actual rendered text so the box always fits.
      const measuredW = measureTextWidth(popupText, 12, "'DM Sans', sans-serif");
      const popupW = Math.min(Math.max(measuredW + 20, 100), Math.min(320, TOTAL_W - 10));
      const popupH = 26;
      const aboveY = y - 16 - popupH;
      const belowY = y + 16;
      const py = (aboveY >= 2) ? aboveY : belowY;
      const px = Math.max(2, Math.min(x - popupW / 2, TOTAL_W - popupW - 2));
      group.appendChild(mk('rect', {
        x: px.toFixed(1), y: py.toFixed(1),
        width: popupW.toFixed(1), height: String(popupH),
        rx:'6', ry:'6',
        fill:'var(--bg2)', stroke:'var(--border-mid)', 'stroke-width':'1',
      }));
      group.appendChild(mk('text', {
        x: (px + popupW / 2).toFixed(1),
        y: (py + popupH / 2 + 1).toFixed(1),
        'text-anchor':'middle', 'dominant-baseline':'central',
        'font-size':'12', 'font-family':"'DM Sans', sans-serif",
        fill:'var(--text-strong)',
      }, popupText));
    }
    svgEl.appendChild(group);
  };
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const dayImp = _stormImpactByDate[d.date];
    if (!dayImp) continue;
    const dv = valFor(d);
    // Order combos rel-first so the rel icon sits left of the per icon when both render.
    const balanceOrder = ['rel', 'per'];
    const picks = balanceOrder.map(b => ({ balance: b, pick: pickMostNegative(dayImp[b]) })).filter(x => x.pick);
    if (picks.length === 0) continue;
    if (isVelocity) {
      // Both balances always render — only Tenor and Combined modes remain.
      // Tenor mode: icons under the single bar, offset ±11 when both rel and
      // per events fired, centered otherwise.
      // Combined mode: each icon sits on its bar's side of the column divide,
      // y anchored to that bar's bottom.
      const mode = S._weatherBarMode || 'tenor';
      const zeroY = yOfRel(0);
      const cx = xOf(i);
      // 30px icons need ~17px half-offset so two glyphs don't overlap, and
      // ~18px clearance from the bar's edge so they read as below the bar.
      const ICON_HALF_OFFSET = 17;
      const ICON_GAP_FROM_BAR = 18;
      const ICON_BOTTOM_MARGIN = 16;
      for (const { balance, pick } of picks) {
        const balVal = balance === 'rel' ? dv.rel : dv.per;
        const zoneKey = stormZoneKey(balVal);
        const cell = STORM_MATRIX[pick.combo] && STORM_MATRIX[pick.combo][zoneKey];
        if (!cell || !cell.icon) continue;
        const iconSize = stormIconSize(zoneKey, pick.impact);
        let ix, cy;
        if (mode === 'split') {
          ix = balance === 'rel' ? cx - ICON_HALF_OFFSET : cx + ICON_HALF_OFFSET;
          const barBottom = balVal < 0 ? yOfRel(balVal) : zeroY;
          cy = Math.min(chartBot - ICON_BOTTOM_MARGIN, barBottom + ICON_GAP_FROM_BAR);
        } else {
          // Tenor mode — y from the tenor bar.
          const tenorVal = (dv.rel + dv.per) / 2;
          const barBottom = tenorVal < 0 ? yOfRel(tenorVal) : zeroY;
          cy = Math.min(chartBot - ICON_BOTTOM_MARGIN, barBottom + ICON_GAP_FROM_BAR);
          ix = picks.length === 1
            ? cx
            : (balance === 'rel' ? cx - ICON_HALF_OFFSET : cx + ICON_HALF_OFFSET);
        }
        buildIconNode(cell.icon, ix, cy,
          'hist_v' + i + '_' + pick.combo,
          cell.label + ' · ' + pick.combo + ' logged',
          iconSize);
      }
    } else {
      // Climate: anchor each icon to its balance line so the user sees where the
      // event lived in score-space. Icon size respects the chart's iconSizing
      // option (zone-based by default, points-based for the test variant); the
      // gap above the line scales with icon size so the bottom edge clears it.
      for (const { balance, pick } of picks) {
        const balVal = balance === 'rel' ? dv.rel : dv.per;
        const zoneKey = stormZoneKey(balVal);
        const cell = STORM_MATRIX[pick.combo] && STORM_MATRIX[pick.combo][zoneKey];
        if (!cell || !cell.icon) continue;
        const iconSize = stormIconSize(zoneKey, pick.impact);
        const cx = xOf(i);
        const cy = (balance === 'rel' ? yOfRel(balVal) : yOfPer(balVal)) - Math.round(iconSize * 0.6);
        buildIconNode(cell.icon, cx, cy,
          'hist_c' + i + '_' + pick.combo,
          cell.label + ' · ' + pick.combo + ' logged',
          iconSize);
      }
    }
  }

  // Scroll position persists across renders so clicking a storm icon or
  // toggling a mode doesn't snap you back to "today". S._historicalScrollFrac
  // = scrollLeft / (scrollWidth - clientWidth), so zoom changes preserve the
  // approximate viewport position rather than the exact pixel offset.
  // Also: Climate and Weather scroll together — when one scrolls, the other
  // follows so the same date stays under the user's eye across both charts.
  _historicalScrollWraps.add(scrollWrap);
  scrollWrap.addEventListener('scroll', () => {
    const maxScroll = scrollWrap.scrollWidth - scrollWrap.clientWidth;
    if (maxScroll <= 0) return;
    S._historicalScrollFrac = scrollWrap.scrollLeft / maxScroll;
    // Sync sibling charts to the same fraction. Skip self and any disconnected
    // wraps (stale from previous renders).
    for (const peer of _historicalScrollWraps) {
      if (peer === scrollWrap) continue;
      if (!peer.isConnected) { _historicalScrollWraps.delete(peer); continue; }
      const peerMax = peer.scrollWidth - peer.clientWidth;
      if (peerMax <= 0) continue;
      const target = Math.round(S._historicalScrollFrac * peerMax);
      if (Math.abs(peer.scrollLeft - target) > 1) peer.scrollLeft = target;
    }
  });
  requestAnimationFrame(() => {
    const maxScroll = scrollWrap.scrollWidth - scrollWrap.clientWidth;
    if (S._historicalScrollFrac != null && maxScroll > 0) {
      scrollWrap.scrollLeft = Math.round(S._historicalScrollFrac * maxScroll);
    } else {
      // First render — default to far right (today).
      scrollWrap.scrollLeft = scrollWrap.scrollWidth;
      S._historicalScrollFrac = 1;
    }
  });

  // Blurb — wrappers pass a generic line; we inject the actual lookback here so the
  // chart-day count is self-documenting without each wrapper having to compute it.
  // Blurb may be a string OR a function returning a string (Weather uses a
  // function so the copy can change with the active Tenor/Combined mode).
  const rawBlurb = typeof opts.blurb === 'function' ? opts.blurb() : (opts.blurb || '');
  const blurbText = rawBlurb.replace('N days', LOOKBACK + ' days');
  // Weather-only: toggle between tenor and combined (rel + per side-by-side).
  // State lives on S._weatherBarMode (transient).
  if (isVelocity && !['tenor', 'split'].includes(S._weatherBarMode)) {
    S._weatherBarMode = 'tenor';
  }
  const toggleBtn = (label, mode) => h('button', {
    style: {
      padding: '3px 9px', fontSize: '10px',
      fontFamily: "'DM Sans', sans-serif",
      letterSpacing: '0.04em', textTransform: 'uppercase',
      border: '1px solid ' + (S._weatherBarMode === mode ? 'var(--border-mid)' : 'var(--border)'),
      background: S._weatherBarMode === mode ? 'var(--bg3)' : 'var(--bg2)',
      color: S._weatherBarMode === mode ? 'var(--text-strong)' : 'var(--muted)',
      cursor: 'pointer', borderRadius: '4px',
    },
    onclick: () => { S._weatherBarMode = mode; render(); },
  }, label);
  return h('div', { style:{ marginBottom:'14px' } },
    h('div', { class:'ins-section', style:{ display:'flex', alignItems:'baseline', justifyContent:'space-between', gap:'10px' } },
      h('div', { class:'ins-section-title', style:{ fontWeight:'600' } }, opts.title || 'Past weather'),
      // Weather-only toggle — two modes.
      isVelocity ? h('div', { style:{ display:'flex', gap:'4px' } },
        toggleBtn('Atmosphere', 'tenor'),
        toggleBtn('Combined', 'split'),
      ) : null,
    ),
    h('div', { style:{ fontSize:'11px', color:'var(--muted)', marginBottom:'10px', lineHeight:'1.6' } },
      blurbText),
    h('div', { style:{ display:'flex', alignItems:'stretch', width:'100%' } },
      scrollWrap,
      relAxisSvg,
    ),
    h('div', {style:{display:'flex',gap:'14px',justifyContent:'flex-end',marginTop:'4px',flexWrap:'wrap'}},
      isVelocity
        ? (() => {
            const mode = S._weatherBarMode || 'tenor';
            // Shared negative strip used by both rel and per.
            const negStrip = () => h('div',{style:{display:'flex',gap:'1px'}},
              h('div',{style:{width:'4px',height:'8px',background:'var(--c-conflict)',borderRadius:'1px'}}),
              h('div',{style:{width:'4px',height:'8px',background:'rgba(220,80,40,0.70)',borderRadius:'1px'}}),
              h('div',{style:{width:'4px',height:'8px',background:'rgba(224,130,40,0.65)',borderRadius:'1px'}}),
            );
            // Positive 3-step strip for a type color (lightest → full).
            const posStrip = (rgb, base) => h('div',{style:{display:'flex',gap:'1px'}},
              h('div',{style:{width:'4px',height:'8px',background:'rgba(' + rgb + ',0.35)',borderRadius:'1px'}}),
              h('div',{style:{width:'4px',height:'8px',background:'rgba(' + rgb + ',0.65)',borderRadius:'1px'}}),
              h('div',{style:{width:'4px',height:'8px',background:base,borderRadius:'1px'}}),
            );
            if (mode === 'split') {
              const isIndLegend = S.relationshipMode === 'individual';
              const primRgb   = isIndLegend ? '217,152,117' : '224,133,184';
              const primVar   = isIndLegend ? 'var(--c-social)' : 'var(--c-affection)';
              const primLabel = isIndLegend ? 'Social' : 'Relational';
              return [
                h('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
                  negStrip(),
                  posStrip(primRgb, primVar),
                  h('span',{style:{fontSize:'10px',color:'var(--muted)'}}, primLabel),
                ),
                h('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
                  negStrip(),
                  posStrip('90,184,212', 'var(--c-restore)'),
                  h('span',{style:{fontSize:'10px',color:'var(--muted)'}}, 'Personal'),
                ),
              ];
            }
            // Tenor mode — six Log calendar bands.
            return [h('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
              h('div',{style:{display:'flex',gap:'1px'}},
                h('div',{style:{width:'4px',height:'8px',background:'var(--c-partner)',borderRadius:'1px'}}),
                h('div',{style:{width:'4px',height:'8px',background:'rgba(30,160,80,0.65)',borderRadius:'1px'}}),
                h('div',{style:{width:'4px',height:'8px',background:'rgba(30,160,80,0.35)',borderRadius:'1px'}}),
                h('div',{style:{width:'4px',height:'8px',background:'rgba(224,130,40,0.65)',borderRadius:'1px'}}),
                h('div',{style:{width:'4px',height:'8px',background:'rgba(220,80,40,0.70)',borderRadius:'1px'}}),
                h('div',{style:{width:'4px',height:'8px',background:'var(--c-conflict)',borderRadius:'1px'}}),
              ),
              h('span',{style:{fontSize:'10px',color:'var(--muted)'}}, 'Daily atmosphere (calendar bands)'),
            )];
          })()
        : [
            // Climate: Atmosphere → Relational → Personal → Base Atmosphere
            // (matches the app-wide Atmosphere/Relational/Personal order;
            // Base Atmosphere is its own thing, sits last as a related trend).
            h('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
              h('div',{style:{width:'12px',height:'0',borderTop:'1.5px dashed var(--muted)',opacity:'0.8'}}),
              h('span',{style:{fontSize:'10px',color:'var(--muted)'}},'Atmosphere'),
            ),
            h('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
              h('div',{style:{width:'12px',height:'2px',background: S.relationshipMode === 'individual' ? 'var(--c-social)' : 'var(--c-affection)',borderRadius:'1px'}}),
              h('span',{style:{fontSize:'10px',color:'var(--muted)'}}, S.relationshipMode === 'individual' ? 'Social' : 'Relational'),
            ),
            h('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
              h('div',{style:{width:'12px',height:'2px',background:'var(--c-restore)',borderRadius:'1px'}}),
              h('span',{style:{fontSize:'10px',color:'var(--muted)'}},'Personal'),
            ),
            h('div',{style:{display:'flex',alignItems:'center',gap:'4px'}},
              h('div',{style:{width:'12px',height:'2.5px',background:'#4eb8b0',borderRadius:'1px'}}),
              h('span',{style:{fontSize:'10px',color:'var(--muted)'}},'Base Atmosphere'),
            ),
          ]
    ),
  );
}

function buildInsightsPanel() {
  const winEntries = getWindowEntries();
  const prevEntries = getPrevWindowEntries();
  // 7-day frame used by observation labels.
  const w = 7;

  // ── Correlations — use full history so sample sizes are meaningful ──
  const correlations = computeCorrelations(calcEntries());

  // Empty state check
  const hasData = winEntries.length > 0;

  return h('div',{class:'insights-panel'},
    (() => { try { return buildLoveBankPanel(); } catch(e) { console.error('Balance widget error:', e); return null; } })(),
    // ── Climate — cumulative tenor (the conditions you've been living in), uses lifetime zones ──
    (() => { try { return buildClimateChart(); } catch(e) { console.error('Climate chart error:', e); return null; } })(),
    // ── Weather — per-day deltas (what each day actually was), uses the Log calendar's daily-change zones ──
    (() => { try { return buildWeatherChart(); } catch(e) { console.error('Weather chart error:', e); return null; } })(),
    // ── Base Tenor — slow EMA baseline (moved out of the Love Bank widget) ──
    (() => { try { return buildBaseTenorChart(); } catch(e) { console.error('Base Tenor chart error:', e); return null; } })(),
    // ── Positivity ratio — Gottman-style 5:1 adapted to your data ──
    (() => { try { return buildPositivityRatioCard(); } catch(e) { console.error('Positivity ratio error:', e); return null; } })(),
    // ── Storm matrix debug — only when debug panels are enabled ──
    S.showDebug ? (() => { try { return buildStormMatrixDebug(); } catch(e) { console.error('Storm matrix debug error:', e); return null; } })() : null,
    // ── Observations (always visible — threshold-based weekly observations) ──
    // Threshold alerts surfaced as cards, mirroring the visual style of
    // Correlations below but without strength badges (these aren't statistical).
    (() => {
      // Threshold observations look at what's still alive — events whose
      // decayed score is non-zero — matching the lifetime-sum Tenor gauge.
      const obsWin  = aliveEntries(S.today);
      const obsPrev = aliveEntries(addDays(S.today, -7));
      const wLabel  = 'Active right now';
      const pRef    = 'in your active stretch';
      const pRefCap = 'Active stretch';
      const hint    = 'Signals from events still shaping your current tenor — thresholds crossed or conditions aligned right now.';
      return h('div',{style:{marginBottom:'14px'}},
        h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Observations')),
        h('div',{style:{fontSize:'11px',color:'var(--muted)',marginBottom:'10px',lineHeight:'1.6'}}, hint),
        buildWindowSummary(obsWin, obsPrev, wLabel, pRef, pRefCap, S.today, 'observationCards')
      );
    })(),

    !hasData ? h('div',{class:'ins-empty',style:{marginTop:'40px'}},
      'No entries in this window yet.\nStart logging to see patterns emerge.'
    ) : h('div',{},

      /* ── Correlations (cross-event statistical patterns) ── */
      (() => {
        const physicalIcons = ['🌹','❄️'];
        const strengthRank = {strong:0, moderate:1, weak:2};
        const allCards = (S.showPhysical
          ? correlations
          : correlations.filter(c => !physicalIcons.some(icon => c.icon.includes(icon))))
          .filter(c => c.strength !== 'weak')
          .slice().sort((a, b) => (strengthRank[a.strength] ?? 2) - (strengthRank[b.strength] ?? 2));
        const positiveIcons = ['🩷→🌹','🌹→🩷','🩷→🌹★','🌿✓→💨','💨💬→🌡️','🌊→🌡️','🌊→💨','🌸→🩷','🧭→🩷','🌸🧭→🌹','🩷🌹↔','🧭🩺→🩷','🌸→🌹+1','🧭🛡→🧭❤','🌸🩺→🌹','🌸🧭→🩷★'];
        const isPositive = c => positiveIcons.some(icon => c.icon.startsWith(icon));
        if (allCards.length === 0) return h('div',{style:{marginBottom:'14px'}},
          h('div',{class:'ins-section'},h('div',{class:'ins-section-title',style:{fontWeight:'600'}},'Correlations')),
          h('div',{class:'ins-empty'},'No clear patterns yet.\nKeep logging — meaningful correlations need more data to surface.')
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

    )
  );
}





function buildWindowSummary(weekEntries, prevEntries, label, periodRef, periodRefCap, end=S.today, mode='full') {
  // mode: 'full' renders observation + all three cards (default)
  //       'observationOnly' renders just the observation block
  //       'cardsOnly' renders just the Connection / Load / Positive Development cards

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
  // Lifetime relational sum so observations reference the same number the gauges show.
  const zones   = getBounds();
  const weekBal = weekEntries.length > 0 ? Math.round(computeExperimentalScores().rel) : null;

  // Only count her turn downs for load signal
  const herTurndownLoad = Math.round(
    turndown.filter(e=>e.initiatedBy==='her').reduce((s,e)=>s+bankTdLoad(e),0));

  // Restore quality-weighted (not raw count)
  const avgRestoreQ = avg(restore.map(e=>migrateRestoreQuality(e.restoreQuality, e)).filter(Boolean));
  const restoreGood = restore.length > 0 && avgRestoreQ !== null && avgRestoreQ >= 3;

  // Repair ↔ Conflict pairing:
  //  · "closed" (positive kudos) = a repair within REPAIR_WINDOW_DAYS — a
  //    prompt repair earns the call-out.
  //  · "open" (concern flag) = the conflict has NO subsequent repair at all,
  //    AND it sits in a narrow 1–5 day actionable window. Repair typically
  //    happens during or shortly after a conflict; if it hasn't by day 5,
  //    it likely isn't going to, so the flag ages out rather than nagging.
  const REPAIR_WINDOW_DAYS      = 5;
  const OPEN_FLAG_MIN_AGE_DAYS  = 1;
  const OPEN_FLAG_MAX_AGE_DAYS  = 5;
  const allRepairsByDate = (S.allEntries || []).filter(e => e.category === 'repair');
  const conflictRepaired = (c) => allRepairsByDate.some(r => {
    const days = daysBetween(c.date, r.date);
    return days >= 0 && days <= REPAIR_WINDOW_DAYS;
  });
  const conflictHasAnyLaterRepair = (c) => allRepairsByDate.some(r =>
    daysBetween(c.date, r.date) >= 0
  );
  const closedConflicts = conflict.filter(conflictRepaired);
  const openConflicts   = conflict.filter(c => {
    if (conflictHasAnyLaterRepair(c)) return false;
    const ageDays = daysBetween(c.date, end);
    return ageDays >= OPEN_FLAG_MIN_AGE_DAYS && ageDays <= OPEN_FLAG_MAX_AGE_DAYS;
  });

  // ── Streak / momentum helpers ──────────────────────────────────────────
  // Walk back from `end` and count consecutive days where relational balance
  // is at or above the Healthy threshold. Used by the sustained-stretch
  // observation; capped at 14 days of lookback.
  const healthyStreak = (() => {
    const stableT = zones.stable;
    let streak = 0;
    for (let d = 0; d < 14; d++) {
      const rel = computeExperimentalScores(addDays(end, -d)).rel;
      if (rel >= stableT) streak++;
      else break;
    }
    return streak;
  })();

  // Days since the last bonding entry (regardless of decay status).
  const lastBondingDate = (S.allEntries || [])
    .filter(e => e.category === 'affection')
    .map(e => e.date).sort().pop();
  const daysSinceLastBonding = lastBondingDate ? daysBetween(lastBondingDate, end) : null;

  // Today positive after a tough stretch — relational ≥ 0 today,
  // and the previous 3+ consecutive days were < 0.
  const recoveryToday = (() => {
    const todayRel = computeExperimentalScores(end).rel;
    if (todayRel < 0) return false;
    let neg = 0;
    for (let d = 1; d <= 7; d++) {
      const r = computeExperimentalScores(addDays(end, -d)).rel;
      if (r < 0) neg++;
      else break;
    }
    return neg >= 3;
  })();

  // Scored observations with priority — highest priority first, first match wins
  const candidates = [

    // ── Critical negatives ───────────────────────────────────────────────
    {
      icon:'📉', title:'Balance in critical range', tone:'critical',
      test: weekBal !== null && weekBal < zones.depleted,
      text: `Relational balance is at ${weekBal>=0?'+':''}${weekBal?.toFixed(0)} ${periodRef} — in the depleted or critical range. The numbers reflect accumulated strain; restoration takes time.`
    },
    {
      icon:'⛈️❄️', title:'Conflict and turn-downs', tone:'critical',
      test: S.showPhysical && conflictLoad >= 60 && herTurndownLoad >= 40,
      text: `Conflict and significant turn-downs both ${periodRef} — a double withdrawal. Worth checking if they fell on the same days.`
    },
    {
      icon:'🩺', title:'Steadying without restoration', tone:'critical',
      test: S.showCaretaker && burnoutLoad >= 120 && restore.length === 0,
      text: `Heavy steadying ${periodRef} (${burnoutLoad} pts) with no restorative activity logged — your resource tank needs attention.`
    },
    {
      icon:'🌪️', title:'Wobble drain without restore', tone:'critical',
      test: S.showRegulation && wobbleLoad >= 60 && restore.length === 0,
      text: `Heavy wobble load ${periodRef} (${wobbleLoad} pts) with no restorative activity — personal tank draining without being refilled.`
    },
    {
      icon:'⚖️', title:'Restore not keeping pace', tone:'concern',
      test: S.showRegulation && wobbleLoad >= 60 && restorePts > 0 && restorePts < wobbleLoad,
      text: `Wobble drain outpaced restore ${periodRef} (${wobbleLoad} pts out vs ${restorePts} pts in) — restore activity isn't keeping up with the personal load.`
    },
    {
      icon:'🌪️⛈️', title:'Wobble and conflict together', tone:'concern',
      test: S.showRegulation && (() => {
        const relWobble = regulation.filter(e=>e.regulationTrigger==='relational');
        if (relWobble.length === 0 || conflict.length === 0) return false;
        const conflictDates = new Set(conflict.map(e=>e.date));
        return relWobble.some(e=>conflictDates.has(e.date));
      })(),
      text: `Relational wobble and conflict logged on the same day ${periodRef} — a double load. Worth noting if they were connected.`
    },
    {
      icon:'❄️', title:'Heavy turn-down weight', tone:'concern',
      test: S.showPhysical && herTurndownLoad >= 120,
      text: `High turn-down weight ${periodRef} (${herTurndownLoad} pts) — significant anticipated investment went unmet.`
    },
    {
      icon:'❄️❄️', title:'Mutual withdrawal', tone:'concern',
      test: (() => {
        if (!S.showPhysical) return false;
        const myTDs  = turndown.filter(e => e.initiatedBy === 'me').length;
        const herTDs = turndown.filter(e => e.initiatedBy === 'her').length;
        return myTDs >= 2 && herTDs >= 2;
      })(),
      text: (() => {
        const myTDs  = turndown.filter(e => e.initiatedBy === 'me').length;
        const herTDs = turndown.filter(e => e.initiatedBy === 'her').length;
        return `Both directions of turn-downs ${periodRef} (you: ${myTDs}, ${P.Sub}: ${herTDs}) — when both sides withdraw at once, distance tends to compound rather than recover on its own.`;
      })()
    },
    {
      icon:'⛈️', title:'Heavy conflict load', tone:'concern',
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
    {
      icon:'🩷⏳', title:'A while since '+bondingLabel().toLowerCase(), tone:'concern',
      test: daysSinceLastBonding !== null && daysSinceLastBonding >= 7,
      text: `${daysSinceLastBonding} days since the last ${bondingLabel().toLowerCase()} entry — worth noticing.`
    },

    // ── Mixed signals ────────────────────────────────────────────────────
    {
      icon:'🩺⛈️', title:'Steadying alongside conflict', tone:'mixed',
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
      icon:'⛈️❄️', title:'Turn-downs followed conflict', tone:'concern',
      test: S.showPhysical && (() => {
        const conflictDates = new Set(conflict.map(e=>e.date));
        return turndown.filter(e=>e.initiatedBy==='her').some(e =>
          conflictDates.has(e.date) || conflictDates.has(addDays(e.date,-1))
        );
      })(),
      text: `Turn-downs followed conflict on the same or next day ${periodRef} — the two events overlapped.`
    },
    {
      icon:'⛈️🤝', title:'Recent conflict, no repair logged', tone:'concern',
      test: S.showRepair && openConflicts.length > 0,
      text: (() => {
        const n = openConflicts.length;
        return `${n === 1 ? 'A conflict' : n + ' conflicts'} from the last ${OPEN_FLAG_MAX_AGE_DAYS} days ${n === 1 ? 'has' : 'have'} no repair entry.`;
      })()
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
      text: `Relational balance is at +${weekBal?.toFixed(0)} ${periodRef} — in the thriving range. The connection is tracking well.`
    },
    {
      icon:'🌿', title:'Sustained Healthy stretch', tone:'positive',
      test: healthyStreak >= 5,
      text: `Relational balance has stayed Healthy+ for ${healthyStreak} consecutive days — a real stretch of stability.`
    },
    {
      icon:'🌅', title:'Turning back to positive', tone:'positive',
      test: recoveryToday,
      text: `Relational balance crossed back into positive today after a tough stretch — a transition worth marking.`
    },
    {
      icon:'🩷🌹', title:'A good week', tone:'positive',
      test: S.showPhysical && physical.length >= 2 && affection.length >= 2 && conflict.length === 0 && (!S.showCaretaker || burnoutLoad <= 30) && (!S.showRegulation || wobbleLoad <= 20),
      text: `A genuinely good period — connection on both sides, no conflict, light load throughout.`
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
      icon:'🤝', title:'Repair followed conflict', tone:'positive',
      test: S.showRepair && closedConflicts.length > 0,
      text: (() => {
        const n = closedConflicts.length;
        return `${n === 1 ? 'A conflict was' : n + ' conflicts were'} followed by a logged repair within ${REPAIR_WINDOW_DAYS} days — the relational loop closing.`;
      })()
    },
    {
      icon:'🔀', title:'Combined activities carrying weight', tone:'positive',
      test: (() => {
        // Combined-origin entries are the affection + restore entries written
        // by the Combined screen; they're identifiable by the scoreScale
        // multiplier on partial splits.
        const combo = weekEntries.filter(e => e.scoreScale != null);
        if (combo.length < 3) return false;
        const cBond = combo.filter(e => e.category === 'affection').length;
        const cRest = combo.filter(e => e.category === 'restore').length;
        const tBond = affection.length;
        const tRest = restore.length;
        const bondShare = tBond > 0 ? cBond / tBond : 0;
        const restShare = tRest > 0 ? cRest / tRest : 0;
        return bondShare >= 0.4 || restShare >= 0.4;
      })(),
      text: (() => {
        const combo = weekEntries.filter(e => e.scoreScale != null);
        const cBond = combo.filter(e => e.category === 'affection').length;
        const cRest = combo.filter(e => e.category === 'restore').length;
        const bondShare = affection.length > 0 ? Math.round(cBond / affection.length * 100) : 0;
        const restShare = restore.length > 0 ? Math.round(cRest / restore.length * 100) : 0;
        const parts = [];
        if (bondShare >= 40) parts.push(`${bondShare}% of ${bondingLabel().toLowerCase()}`);
        if (restShare >= 40) parts.push(`${restShare}% of restorative`);
        return `Combined activities make up ${parts.join(' and ')} entries ${periodRef} — dual-purpose time is doing meaningful work on the ${parts.length > 1 ? 'ledgers' : 'ledger'}.`;
      })()
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

  const matched = candidates.filter(c => c.test);
  const observationEl = matched.length > 0
    ? matched.map(c => h('p',{style:{margin:'0 0 6px 0'}}, c.text))
    : [h('p',{style:{margin:'0'}}, weekEntries.length === 0
        ? 'No entries to flag yet.'
        : `A quiet period — no notable patterns to flag.`)];

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
        ? 'No entries to flag yet.'
        : `A quiet period — no notable patterns to flag.`);
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
            h('span',{class:'week-row-label'},'❄️ Turn downs'),
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
            h('span',{class:'week-row-label'},'⛈️ Conflicts'),
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
            h('span',{class:'week-row-label'},'💨 Steadying'),
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
          // Wobble
          S.showRegulation && regulation.length > 0 ? h('div',{class:'week-row'},
            h('span',{class:'week-row-label'},'🌪️ Wobble'),
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

