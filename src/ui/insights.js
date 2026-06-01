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
          + (lowerOnTD ? ' Turn-down days have a noticeably lower average balance than other days.' : '')
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
          icon:'🫧', title:'Tones in your wobbles',
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
          icon:'🛌🫧', title:'Body load is driving wobbles',
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
        icon:'🫧🔁', title:'Same tone keeps showing up',
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
          icon: better ? '🫧↘' : '🫧↗',
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
          icon:'🌡️→⚡', title:'Low check-in days forecast harder next days',
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
          icon:'🩷⏳→⚡', title:'Bonding gaps coincide with friction',
          desc: `Days that came 6+ days after a ${bondingLabel().toLowerCase()} entry saw conflict or turn-down ${pctFar}% of the time — vs ${pctNear}% on days that came within 2 days. Cadence appears to matter.`,
          strength: diff >= 0.30 ? 'strong' : diff >= 0.22 ? 'moderate' : 'weak',
          n: farDays.length,
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

  // Relational & personal balance — lifetime sum via the active scoring model.
  const expNow = computeExperimentalScores(S.today);
  const relBal7 = Math.round(expNow.rel);
  const perBal7 = Math.round(expNow.per);

  const hasEnoughData = allEntries.length >= 3;
  const loggedMoodToday = todayEs.some(e => e.category === 'libido');

  // Tenor zone for greeting card
  const zones7 = getBounds();
  const tenorScore7 = hasEnoughData ? Math.round((relBal7 + perBal7) / 2) : null;
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

  // ── Tomorrow forecast — lifetime sum as of tomorrow (one more day of decay).
  const _fcAnchor = addDays(S.today, 1);
  const expFc     = computeExperimentalScores(_fcAnchor);
  const fcRel     = Math.round(expFc.rel);
  const fcPer     = Math.round(expFc.per);
  const fcTenor   = Math.round(expFc.tenor);
  // Map each projected score to a weather icon based on its zone band
  const _zoneIcon = v =>
      v >= zones7.thriving  ? { icon:'☀️',  label:'Thriving',    color:'var(--c-partner)' }
    : v >= zones7.stable    ? { icon:'🌤️', label:'Healthy',     color:'rgba(77,196,120,0.85)' }
    : v >= 0                ? { icon:'⛅',  label:'Progressing', color:'#a8b870' }
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
    { name:'Relational', ..._zoneIcon(fcRel),   trend:_tempDelta(relBal7,    fcRel),   today: relBal7,     tomorrow: fcRel   },
    { name:'Personal',   ..._zoneIcon(fcPer),   trend:_tempDelta(perBal7,    fcPer),   today: perBal7,     tomorrow: fcPer   },
    { name:'Tenor',      ..._zoneIcon(fcTenor), trend:_tempDelta(tenorScore7, fcTenor), today: tenorScore7, tomorrow: fcTenor },
  ] : null;

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
    const contributionOnDate = (date) => {
      const dayEs = byDate[date] || [];
      if (dayEs.length === 0) return null;
      const cap = bankDayCap(dayEs.find(le => le.category === 'libido'));
      let r = 0, p = 0;
      for (const e of dayEs) {
        const { rel, per } = expEntryScores(e, cap);
        if (rel !== 0) r += expRemaining(rel, 0);
        if (per !== 0) p += expRemaining(per, 0);
      }
      if (r === 0 && p === 0) return null;
      return { rel: r, per: p };
    };

    // Per-day-of-week averages from last 28 days, ignoring zero-contribution days.
    const dowVals = {}; for (let d = 0; d < 7; d++) dowVals[d] = [];
    for (let i = 1; i <= 28; i++) {
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
      let mornRel, mornPer;
      let gainRel, gainPer;

      if (off < 0) {
        // Past day — morning is decay-only (without that day's logging), afternoon is actual.
        const dayContrib = contributionOnDate(date) || { rel: 0, per: 0 };
        gainRel = dayContrib.rel;
        gainPer = dayContrib.per;
        mornRel = decayOnly.rel - gainRel;
        mornPer = decayOnly.per - gainPer;
      } else if (off === 0) {
        // Today — forecast is LOCKED to the start-of-day DOW projection. Logging today updates
        // the "now" card but does not move this line; the line "updates" only when the day rolls
        // over (today becomes a past day and uses actual).
        const todayContrib = contributionOnDate(date) || { rel: 0, per: 0 };
        mornRel = decayOnly.rel - todayContrib.rel;
        mornPer = decayOnly.per - todayContrib.per;
        gainRel = dowAvgs[dow].rel;
        gainPer = dowAvgs[dow].per;
      } else {
        // Future day — today is treated as locked to its projection (not its actuals), so the
        // forecast line stays continuous from today's afternoon into tomorrow's morning.
        // Undo today's actual contribution from decayOnly, substitute today's projection decayed.
        let intermediateRel = 0, intermediatePer = 0;
        const todayDow = new Date(S.today + 'T00:00:00').getDay();
        const todayContrib = contributionOnDate(S.today) || { rel: 0, per: 0 };
        const todayProjRel = dowAvgs[todayDow].rel;
        const todayProjPer = dowAvgs[todayDow].per;
        if (Math.abs(todayContrib.rel) >= 1) intermediateRel -= expRemaining(todayContrib.rel, off);
        if (Math.abs(todayContrib.per) >= 1) intermediatePer -= expRemaining(todayContrib.per, off);
        if (Math.abs(todayProjRel) >= 1) intermediateRel += expRemaining(todayProjRel, off);
        if (Math.abs(todayProjPer) >= 1) intermediatePer += expRemaining(todayProjPer, off);
        for (let f = 1; f < off; f++) {
          const futureDate = addDays(S.today, f);
          const fDow = new Date(futureDate + 'T00:00:00').getDay();
          const fRel = dowAvgs[fDow].rel;
          const fPer = dowAvgs[fDow].per;
          const ageAtTarget = off - f;
          if (Math.abs(fRel) >= 1) intermediateRel += expRemaining(fRel, ageAtTarget);
          if (Math.abs(fPer) >= 1) intermediatePer += expRemaining(fPer, ageAtTarget);
        }
        mornRel = decayOnly.rel + intermediateRel;
        mornPer = decayOnly.per + intermediatePer;
        gainRel = dowAvgs[dow].rel;
        gainPer = dowAvgs[dow].per;
      }

      const aftRel = mornRel + gainRel;
      const aftPer = mornPer + gainPer;

      out.push({
        date, offset: off, dow,
        isPast:  off < 0,
        isToday: off === 0,
        morning:   { rel: mornRel, per: mornPer, tenor: (mornRel + mornPer) / 2 },
        afternoon: { rel: aftRel,  per: aftPer,  tenor: (aftRel  + aftPer)  / 2 },
        gain:      { rel: gainRel, per: gainPer },
      });
    }
    // Extra morning value for the day immediately after END_OFFSET — used by the score chart
    // line so it can extend to the morning of the day after the last visible column instead of
    // stopping at the last day's afternoon midpoint.
    const _extraOff = END_OFFSET + 1;
    const _extraDate = addDays(S.today, _extraOff);
    const _extraDecay = computeExperimentalScores(_extraDate);
    let _extraInterRel = 0, _extraInterPer = 0;
    const _todayDow = new Date(S.today + 'T00:00:00').getDay();
    const _todayContrib = contributionOnDate(S.today) || { rel: 0, per: 0 };
    const _todayProjRel = dowAvgs[_todayDow].rel;
    const _todayProjPer = dowAvgs[_todayDow].per;
    if (Math.abs(_todayContrib.rel) >= 1) _extraInterRel -= expRemaining(_todayContrib.rel, _extraOff);
    if (Math.abs(_todayContrib.per) >= 1) _extraInterPer -= expRemaining(_todayContrib.per, _extraOff);
    if (Math.abs(_todayProjRel) >= 1)     _extraInterRel += expRemaining(_todayProjRel, _extraOff);
    if (Math.abs(_todayProjPer) >= 1)     _extraInterPer += expRemaining(_todayProjPer, _extraOff);
    for (let f = 1; f < _extraOff; f++) {
      const fDate = addDays(S.today, f);
      const fDow  = new Date(fDate + 'T00:00:00').getDay();
      const ageAtTarget = _extraOff - f;
      if (Math.abs(dowAvgs[fDow].rel) >= 1) _extraInterRel += expRemaining(dowAvgs[fDow].rel, ageAtTarget);
      if (Math.abs(dowAvgs[fDow].per) >= 1) _extraInterPer += expRemaining(dowAvgs[fDow].per, ageAtTarget);
    }
    const extraMorning = {
      rel:   _extraDecay.rel + _extraInterRel,
      per:   _extraDecay.per + _extraInterPer,
      tenor: ((_extraDecay.rel + _extraInterRel) + (_extraDecay.per + _extraInterPer)) / 2,
    };
    return { days: out, dowAvgs, extraMorning };
  })();
  const wxDays    = wxData.days;
  const wxDowAvgs = wxData.dowAvgs;
  const wxExtraMorning = wxData.extraMorning;

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
      nudges.push(card('⚡', 'Conflict logged today', 'No '+bondingLabel().toLowerCase()+' entries this week to balance it.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (conflictYest && !conflictToday && !conflictYestResolved)
      nudges.push(card('💬', 'Yesterday had conflict', 'Yesterday\'s conflict isn\'t marked resolved — the loop is still open.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (week7Conflict >= 3)
      nudges.push(card('⚡', week7Conflict+' conflicts this week', 'A heavy week for conflict.', 'var(--c-conflict)', 'rgba(224,53,53,0.18)', 'rgba(224,53,53,0.05)', goInsights));
    else if (week7Conflict === 0 && last14.filter(e=>e.category==='conflict').length === 0 && allEntries.filter(e=>e.category==='conflict').length > 0)
      kudos.push(card('✨', 'Two weeks conflict-free', 'No conflict logged in 14 days.', 'var(--c-partner)', 'rgba(77,196,120,0.25)', 'rgba(77,196,120,0.06)', goInsights));
  }

  // ── Repair ──
  if (S.showRepair && hasEnoughData && repairToday)
    kudos.push(card('🤝', 'Repair logged today', 'Reconnection work tracked.', 'var(--c-partner)', 'rgba(77,196,120,0.20)', 'rgba(77,196,120,0.05)', goInsights));

  // ── Overall balance ──
  if (hasEnoughData) {
    if (relBal7 >= relThresh)
      kudos.push(card('💚', 'Relational balance positive', 'Balance at +'+relBal7+'. Deposits are outpacing withdrawals.', 'var(--c-partner)', 'rgba(77,196,120,0.25)', 'rgba(77,196,120,0.06)', ()=>goInsightsMode('relational')));
    else if (relBal7 < -relThresh)
      nudges.push(card('📉', 'Balance running low', 'Relational balance at '+relBal7+'. More withdrawals than deposits recently.', 'var(--text)', 'var(--border)', 'var(--bg2)', ()=>goInsightsMode('relational')));

    if (perBal7 >= perThresh)
      kudos.push(card('🌿', 'Personal tank healthy', 'Restore is outpacing drain this week.', 'var(--c-restore)', 'rgba(90,184,212,0.25)', 'rgba(90,184,212,0.06)', ()=>goInsightsMode('personal')));
    else if (perBal7 < -perThresh && week7Restore === 0)
      nudges.push(card('🪫', 'Personal tank depleted', 'Wobble or steadying load without restorative activity this week.', 'var(--text)', 'var(--border)', 'var(--bg2)', ()=>goInsightsMode('personal')));
  }

  // ── Steady / wellbeing ──
  if (S.showCaretaker && hasEnoughData) {
    if (week7Burnout >= 4 && week7Restore === 0)
      nudges.push(card('🕯️', 'Heavy steadying load', week7Burnout+' steadying entries this week with no restorative activity logged.', 'var(--text)', 'var(--border)', 'var(--bg2)', goInsights));
    else if (week7Burnout >= 2 && week7Restore >= 1)
      kudos.push(card('🕯️', 'Caretaking with self-care', 'Steadying for others and restoring yourself this week.', 'var(--c-restore)', 'rgba(90,184,212,0.20)', 'rgba(90,184,212,0.04)', goInsights));
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
      { icon:'🤝', label:'Repair',   key:'repair',   show: S.showRepair },
      { icon:'🔀', label:'Combined', key:'combined', show: true },
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
          'Your Tenor is currently'),
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
            const { rel, per } = expEntryScores(e, todayCap);
            if (rel !== 0) todayLogRel += expRemaining(rel, 0);
            if (per !== 0) todayLogPer += expRemaining(per, 0);
          }
          const hasLoggedRel   = Math.abs(todayLogRel) >= 1;
          const hasLoggedPer   = Math.abs(todayLogPer) >= 1;
          const hasLoggedTenor = hasLoggedRel || hasLoggedPer;

          // Low/High = the two end-of-day bounds (morning decay state + locked afternoon projection),
          // sorted so Low is always the smaller number. The forecast gain can be negative (e.g. a
          // conflict-heavy DOW) which would push the afternoon below the morning. `forecast` keeps
          // the afternoon distinct from the sorted bounds so the status column can compare to it.
          const rng = (a, b) => ({ low: Math.min(a, b), high: Math.max(a, b) });
          const rRel = rng(todayDay.morning.rel,   todayDay.afternoon.rel);
          const rPer = rng(todayDay.morning.per,   todayDay.afternoon.per);
          const rTen = rng(todayDay.morning.tenor, todayDay.afternoon.tenor);
          const rows = [
            { name:'Relational', low:rRel.low, high:rRel.high, forecast:todayDay.afternoon.rel,   actual:relBal7,     hasLogged:hasLoggedRel   },
            { name:'Personal',   low:rPer.low, high:rPer.high, forecast:todayDay.afternoon.per,   actual:perBal7,     hasLogged:hasLoggedPer   },
            { name:'Tenor',      low:rTen.low, high:rTen.high, forecast:todayDay.afternoon.tenor, actual:tenorScore7, hasLogged:hasLoggedTenor },
          ];
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
          return h('div',{style:{
            marginTop:'12px', paddingTop:'10px',
            borderTop:'1px solid var(--surface-2)',
            display:'grid', gridTemplateColumns:'auto 1fr auto auto auto auto', alignItems:'center',
            columnGap:'4px',
          }},
            // Header row — Now sits over the number, the icon column has no header
            h('div',{}),
            h('div',{}),
            headerCell('Now'),
            h('div',{}),
            headerCell('Low'),
            headerCell('High'),
            // One row per series
            ...rows.flatMap(r => {
              // Now always shows the current actual value with weather icon for that score.
              const zi = _zoneIcon(r.actual);
              // Status = how the current actual compares to the locked forecast (afternoon).
              const td = _tempDelta(r.forecast, r.actual);
              const statusText = td ? td.label : '';
              const statusCell = h('div',{style:{
                fontSize:'10px', color:'var(--muted)', fontStyle:'italic',
                textAlign:'right', padding:'6px 8px',
              }}, statusText);
              const nowValCell = h('div',{style:{
                fontFamily:"'Libre Baskerville', serif", fontSize:'18px',
                color:'var(--text-strong)', letterSpacing:'0.01em',
                textAlign:'right', padding:'6px 0 6px 8px',
              }}, fmt(r.actual));
              const nowIconCell = h('div',{style:{
                fontSize:'18px', lineHeight:'1', padding:'6px 8px 6px 4px',
              }}, zi.icon);
              return [
                h('div',{style:{
                  fontSize:'10px', fontWeight:'600', letterSpacing:'0.07em', textTransform:'uppercase',
                  color:'var(--muted)', padding:'6px 0',
                }}, r.name),
                statusCell,
                nowValCell,
                nowIconCell,
                valCell(fmt(r.low),  { size:'13px', color:'var(--muted-2)' }),
                valCell(fmt(r.high), { size:'13px', color:'var(--muted-2)' }),
              ];
            })
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
          const DAY_W = 85;
          const ROW1_H = 60;   // day label + icon + tenor high/low
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

          // Per-category date sets and per-DOW probabilities.
          // Window per series = days since that series' first logged event, capped at big-event lifespan.
          // Pre-lifespan days dilute the percentages, so we don't count days before the user started tracking.
          const DOW_WINDOW = Math.max(7, Math.round(expLifespan(100)));
          const datesWithCat = (cat) => new Set(allEntries.filter(e => e.category === cat).map(e => e.date));
          const daysBetween = (a, b) => Math.round(
            (new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000
          );
          const computeDowPct = (dateSet) => {
            const out = {}; for (let d = 0; d < 7; d++) out[d] = 0;
            if (dateSet.size === 0) return out;
            let earliest = null;
            for (const dt of dateSet) if (earliest === null || dt < earliest) earliest = dt;
            const win = Math.min(DOW_WINDOW, Math.max(1, daysBetween(earliest, S.today)));
            const stat = {}; for (let d = 0; d < 7; d++) stat[d] = { total: 0, hit: 0 };
            for (let i = 1; i <= win; i++) {
              const dt  = addDays(S.today, -i);
              const dow = new Date(dt + 'T00:00:00').getDay();
              stat[dow].total++;
              if (dateSet.has(dt)) stat[dow].hit++;
            }
            for (let d = 0; d < 7; d++) out[d] = stat[d].total > 0 ? stat[d].hit / stat[d].total : 0;
            return out;
          };
          // Only entries that actually contribute points should count toward the percentage
          // (e.g. solo physical = 0 points → excluded; restore "none" type = 0 points → excluded).
          // Pre-compute per-day bankDayCap once so we can score each entry consistently.
          const _dayCapByDate = {};
          for (const e of allEntries) {
            if (e.category === 'libido' && _dayCapByDate[e.date] === undefined) {
              _dayCapByDate[e.date] = bankDayCap(e);
            }
          }
          const _capFor = (date) => _dayCapByDate[date] ?? bankDayCap(null);
          const _hasPoints = (e) => {
            const { rel, per } = expEntryScores(e, _capFor(e.date));
            return rel !== 0 || per !== 0;
          };
          const datesWithCatScored = (cat) => {
            const s = new Set();
            for (const e of allEntries) {
              if (e.category === cat && _hasPoints(e)) s.add(e.date);
            }
            return s;
          };
          // All negative-scoring categories collapse into a weather metaphor:
          //   Cloudcover    = chance of ANY negative event on a day
          //   Precipitation = chance of 2+ distinct negative events on the same day
          const NEG_CATS = new Set(['conflict', 'turndown', 'regulation', 'burnout']);
          const negCatsByDate = new Map();
          for (const e of allEntries) {
            if (!NEG_CATS.has(e.category)) continue;
            if (!_hasPoints(e)) continue;
            if (!negCatsByDate.has(e.date)) negCatsByDate.set(e.date, new Set());
            negCatsByDate.get(e.date).add(e.category);
          }
          const cloudDates  = new Set(negCatsByDate.keys());
          const precipDates = new Set();
          for (const [date, cats] of negCatsByDate) {
            if (cats.size >= 2) precipDates.add(date);
          }
          // Positive lines stay individual; negative load is summarized by Cloudcover/Precipitation (filled).
          const PCT_SERIES = [
            { cat: 'affection',  color: CAT_COLORS.affection,  label: bondingLabel(),  show: true,
              dateSet: datesWithCatScored('affection') },
            { cat: 'physical',   color: CAT_COLORS.physical,   label: 'Intimacy',      show: S.showPhysical,
              dateSet: datesWithCatScored('physical') },
            { cat: 'restore',    color: CAT_COLORS.restore,    label: 'Restore',       show: true,
              dateSet: datesWithCatScored('restore') },
            { cat: 'cloudcover',    color: '#9aa5ad', label: 'Clouds', show: true, fill: true,
              dateSet: cloudDates },
            { cat: 'precipitation', color: '#3b7dd8', label: 'Rain',   show: true, fill: true,
              dateSet: precipDates },
          ].filter(s => s.show);
          for (const s of PCT_SERIES) s.dowPct = computeDowPct(s.dateSet);
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

          // Row 1: day label + weather icon + high/low (high = afternoon, low = morning)
          const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          for (let i = 0; i < wxDays.length; i++) {
            const d  = wxDays[i];
            const cx = i * DAY_W + DAY_W / 2;
            const zi = _zoneIcon(d.afternoon.tenor);
            const lblText = d.isToday ? 'Today' : DAY_NAMES[d.dow];
            const opacity = d.isPast ? '0.65' : (d.offset > 0 ? '0.85' : '1');
            const hi = Math.round(Math.max(d.morning.tenor, d.afternoon.tenor));
            const lo = Math.round(Math.min(d.morning.tenor, d.afternoon.tenor));
            // Day label
            svgEl.appendChild(mk('text', {
              x: cx.toFixed(1), y: '11', 'text-anchor':'middle',
              'font-size':'9', 'font-family':"'DM Sans', sans-serif",
              fill: d.isToday ? 'var(--text-strong)' : 'var(--muted)',
              'font-weight': d.isToday ? '700' : '500',
              'letter-spacing': '0.04em',
              opacity,
            }, lblText.toUpperCase()));
            // Weather icon
            svgEl.appendChild(mk('text', {
              x: cx.toFixed(1), y: '32', 'text-anchor':'middle',
              'font-size':'19',
              opacity,
            }, zi.icon));
            // Tenor high / low (afternoon peak / morning low) — single combined line
            const hiStr = (hi >= 0 ? '+' : '') + hi;
            const loStr = (lo >= 0 ? '+' : '') + lo;
            svgEl.appendChild(mk('text', {
              x: cx.toFixed(1), y: '50', 'text-anchor':'middle',
              'font-size':'10', 'font-family':"'Libre Baskerville', serif",
              fill: 'var(--text-strong)',
              opacity,
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
          drawSeries(perPts, yOfPer, 'var(--c-restore)', 1.9);
          drawSeries(relPts, yOfRel, 'var(--c-affection)', 1.9);

          // ── Scrollable SVG #2 (row 3: percentage line chart) ──
          const svgEl2 = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svgEl2.setAttribute('viewBox', `0 0 ${TOTAL_W} ${SVG2_H}`);
          svgEl2.setAttribute('preserveAspectRatio', 'none');
          svgEl2.style.cssText = `display:block;width:${TOTAL_W}px;height:${SVG2_H}px;`;

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
          const buildPctLine = (dateSet, dowPct) => {
            const pts = [];
            if (wxDays.length === 0) return pts;
            const beforeDow = (wxDays[0].dow + 6) % 7;
            const afterDow  = (wxDays[wxDays.length - 1].dow + 1) % 7;
            pts.push({ x: -0.5, y: dowPct[beforeDow] });
            for (let i = 0; i < wxDays.length; i++) {
              const d = wxDays[i];
              pts.push({ x: i + 0.5, y: dowPct[d.dow] });
            }
            pts.push({ x: wxDays.length + 0.5, y: dowPct[afterDow] });
            return pts;
          };
          const drawPctSeries = (pts, color, fill) => {
            if (pts.length < 2) return;
            const linePath = pathWith(pts, yOfPct);
            if (fill) {
              const zeroY = yOfPct(0);
              const fillPath = linePath
                + ' L' + xOf(pts[pts.length-1].x).toFixed(1) + ',' + zeroY.toFixed(1)
                + ' L' + xOf(pts[0].x).toFixed(1)            + ',' + zeroY.toFixed(1)
                + ' Z';
              svgEl2.appendChild(mk('path', {
                d: fillPath, fill: color, 'fill-opacity':'0.18',
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
            s.samples = buildPctLine(s.dateSet, s.dowPct);
            s.hasData = s.samples.some(p => p.y > 0);
          }
          const activeSeries = PCT_SERIES.filter(s => s.hasData);
          // Draw filled series first so unfilled lines stay readable on top
          for (const s of activeSeries.filter(s => s.fill)) {
            drawPctSeries(s.samples, s.color, true);
          }
          for (const s of activeSeries.filter(s => !s.fill)) {
            drawPctSeries(s.samples, s.color, false);
          }

          // ── Y-axis SVGs — fixed outside the scroll containers ──
          const AXIS_W = 32;
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
                x: side === 'left' ? (AXIS_W - 6) : 6, y: (y + 3).toFixed(1),
                'text-anchor': side === 'left' ? 'end' : 'start',
                'font-size':'9', 'font-family':"'DM Sans', sans-serif",
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
              ax.appendChild(mk('text', {
                x: side === 'left' ? (AXIS_W - 6) : 6, y: (y + 3).toFixed(1),
                'text-anchor': side === 'left' ? 'end' : 'start',
                'font-size':'9', 'font-family':"'DM Sans', sans-serif",
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

          const expanded = S.homeForecastExpanded !== false;
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
                saveSettings();
                render();
              },
            },
              h('span',{style:{
                fontSize:'10px', color:'var(--muted)', display:'inline-block',
                transition:'transform 0.15s',
                transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}, '▶'),
              h('span',{style:{fontSize:'10px',fontWeight:'600',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)'}}, '7-day forecast (tenor)'),
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
                S._wxScroll = src.scrollLeft;
              };
              scroll1.addEventListener('scroll', onScroll(scroll1, scroll2));
              scroll2.addEventListener('scroll', onScroll(scroll2, scroll1));
              // Initial scroll to today (or restore last position)
              requestAnimationFrame(() => {
                let initial = S._wxScroll;
                if (initial == null) {
                  const todayCol = wxDays.findIndex(d => d.isToday);
                  if (todayCol >= 0) initial = todayCol * DAY_W;
                }
                if (initial != null) {
                  scroll1.scrollLeft = initial;
                  scroll2.scrollLeft = initial;
                }
              });
              return h('div', {},
                // Chart 1: score line chart
                h('div', { style: { display:'flex', alignItems:'stretch' } },
                  leftAxis, scroll1, rightAxis,
                ),
                // Legend below chart 1
                h('div',{style:{display:'flex',gap:'14px',justifyContent:'flex-end',marginTop:'0',marginBottom:'10px'}},
                  legendItem('var(--c-restore)', 'Personal'),
                  legendItem('var(--c-affection)', 'Relational'),
                ),
                // Chart 2: percentage line chart
                h('div', { style: { display:'flex', alignItems:'stretch' } },
                  leftAxis2, scroll2, rightAxis2,
                ),
                // Legend below chart 2 — only series with data render
                h('div',{style:{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'0',flexWrap:'wrap'}},
                  ...activeSeries.map(s => legendItem(s.color, s.label)),
                ),
                // Inline hint — clarifies the weather-metaphor names for negative events.
                h('div',{style:{
                  fontSize:'10px', color:'var(--muted-2)', marginTop:'4px',
                  fontStyle:'italic', textAlign:'right', lineHeight:'1.4',
                }},
                  'Clouds = chance of any negative day · Rain = chance of 2+ same day'),
              );
            })() : null,

            // ── Debug panel — every number behind the 10-day forecast ──────────
            expanded && S.showDebug ? (() => {
              const fmt  = (n) => (n == null ? '—' : (n >= 0 ? '+' : '') + (Math.round(n * 10) / 10).toFixed(1));
              const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
              const cell = (txt, opts={}) => h('span', {style:{
                display:'inline-block',
                fontFamily:"'Libre Baskerville', serif",
                fontSize:'10px',
                ...opts,
              }}, txt);
              const muteCell = (txt) => h('span',{style:{fontSize:'10px',color:'var(--muted)'}}, txt);

              const headerStyle = {fontSize:'10px',fontWeight:'600',color:'var(--text-strong)',letterSpacing:'0.05em',textTransform:'uppercase'};

              // Day-of-week averages table
              const dowTable = h('div',{style:{marginBottom:'10px'}},
                h('div',{style:{...headerStyle, marginBottom:'4px'}}, 'Per-DOW non-zero averages (last 28 days)'),
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

              // Per-day table
              const dayTable = h('div',{},
                h('div',{style:{...headerStyle, marginBottom:'4px'}}, 'Per-day breakdown'),
                h('div',{style:{
                  display:'grid',
                  gridTemplateColumns:'70px repeat(8, minmax(0,1fr))',
                  gap:'2px 4px', fontSize:'10px', color:'var(--muted)',
                  alignItems:'center',
                }},
                  // Header row
                  h('span',{}, ''),
                  h('span',{style:{textAlign:'right',color:'var(--muted-2)'}}, 'm.rel'),
                  h('span',{style:{textAlign:'right',color:'var(--muted-2)'}}, 'a.rel'),
                  h('span',{style:{textAlign:'right',color:'var(--muted-2)'}}, 'm.per'),
                  h('span',{style:{textAlign:'right',color:'var(--muted-2)'}}, 'a.per'),
                  h('span',{style:{textAlign:'right',color:'var(--muted-2)'}}, 'm.ten'),
                  h('span',{style:{textAlign:'right',color:'var(--muted-2)'}}, 'a.ten'),
                  h('span',{style:{textAlign:'right',color:'var(--muted-2)'}}, 'gain.r'),
                  h('span',{style:{textAlign:'right',color:'var(--muted-2)'}}, 'gain.p'),
                  // Data rows
                  ...wxDays.flatMap(d => {
                    const label = d.isToday ? 'Today' : DAY_NAMES[d.dow] + ' ' + d.offset;
                    const rowStyle = d.isToday
                      ? {fontWeight:'600', color:'var(--text-strong)'}
                      : (d.isPast ? {color:'var(--muted-2)'} : {});
                    const num = (v) => h('span',{style:{textAlign:'right',fontFamily:"'Libre Baskerville', serif", ...rowStyle}}, fmt(v));
                    return [
                      h('span',{style:rowStyle}, label),
                      num(d.morning.rel),   num(d.afternoon.rel),
                      num(d.morning.per),   num(d.afternoon.per),
                      num(d.morning.tenor), num(d.afternoon.tenor),
                      num(d.gain.rel),      num(d.gain.per),
                    ];
                  })
                ),
                h('div',{style:{fontSize:'9px',color:'var(--muted-2)',marginTop:'6px',lineHeight:'1.5'}},
                  'm = morning low (decay-only end-of-day, without that day\'s own contribution). ',
                  'a = afternoon peak (= morning + day\'s gain). ',
                  'gain = day\'s own contribution: actual sum of entries for past/today, dow-average for future.',
                )
              );

              return h('div',{style:{
                marginTop:'10px', padding:'10px 12px', borderRadius:'10px',
                background:'var(--surface-1)', border:'1px solid var(--surface-2)',
                fontFamily:"'DM Sans', sans-serif",
              }},
                h('div',{style:{...headerStyle, marginBottom:'8px'}}, 'Forecast debug'),
                h('div',{style:{fontSize:'10px',color:'var(--muted-2)',marginBottom:'10px',fontStyle:'italic'}},
                  'Projections use per-day-of-week averages from each series’ first logged event (up to ' + DOW_WINDOW + ' days).'),
                dowTable,
                dayTable,
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
      const hint    = 'Notable signals from events still contributing to your tenor — thresholds crossed, conditions aligned.';
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
        const physicalIcons = ['🌹','🌒'];
        const strengthRank = {strong:0, moderate:1, weak:2};
        const allCards = (S.showPhysical
          ? correlations
          : correlations.filter(c => !physicalIcons.some(icon => c.icon.includes(icon))))
          .filter(c => c.strength !== 'weak')
          .slice().sort((a, b) => (strengthRank[a.strength] ?? 2) - (strengthRank[b.strength] ?? 2));
        const positiveIcons = ['🩷→🌹','🌹→🩷','🩷→🌹★','🌿✓→🕯️','🕯️💬→🌡️','🌊→🌡️','🌊→🕯️','🌸→🩷','🧭→🩷','🌸🧭→🌹','🩷🌹↔','🧭🩺→🩷','🌸→🌹+1','🧭🛡→🧭❤','🌸🩺→🌹','🌸🧭→🩷★'];
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
      icon:'🌒🌒', title:'Mutual withdrawal', tone:'concern',
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
    {
      icon:'🩷⏳', title:'A while since '+bondingLabel().toLowerCase(), tone:'concern',
      test: daysSinceLastBonding !== null && daysSinceLastBonding >= 7,
      text: `${daysSinceLastBonding} days since the last ${bondingLabel().toLowerCase()} entry — worth noticing.`
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
      icon:'⚡🤝', title:'Recent conflict, no repair logged', tone:'concern',
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

