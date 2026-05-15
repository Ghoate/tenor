'use strict';

/* ── Needs2 — Emotional Needs Calibration ─────────────
 * 12 scenario questions. Each choice maps to one of the 10 emotional needs.
 * Each need appears 4–5 times across the 48 choice slots (max 6).
 *
 * After all 12 answers, we tally hits per need and assign a bell-curve rating:
 *   1 need  → Deeply matters    (rating 9)
 *   2 needs → Matters a lot     (rating 7)
 *   4 needs → Matters some      (rating 5)
 *   2 needs → Matters a little  (rating 3)
 *   1 need  → Barely registers  (rating 1)
 *
 * Ranking: hit count DESC, then alphabetical by label as a tiebreaker.
 */

const NEEDS2_RATING_LABELS = [
  { val: 9, label: 'Deeply matters' },
  { val: 7, label: 'Matters a lot' },
  { val: 5, label: 'Matters some' },
  { val: 3, label: 'Matters a little' },
  { val: 1, label: 'Barely registers' },
];

// Bucket sizes for the bell curve, top-to-bottom (sums to 10)
const NEEDS2_BUCKETS = [
  { size: 1, val: 9 },
  { size: 2, val: 7 },
  { size: 4, val: 5 },
  { size: 2, val: 3 },
  { size: 1, val: 1 },
];

// Replace partner-pronoun tokens in a string with the user's configured pronouns.
// Tokens: {Sub} {sub} {obj} {pos} {ref} — see PRONOUN_MAP in state.js for forms.
function applyPartnerPronouns(text) {
  if (!text) return text;
  return text
    .replace(/\{Sub\}/g, P.Sub)
    .replace(/\{sub\}/g, P.sub)
    .replace(/\{obj\}/g, P.obj)
    .replace(/\{pos\}/g, P.pos)
    .replace(/\{ref\}/g, P.ref);
}

// 12 scenario questions. Each choice carries the EMOTIONAL_NEEDS .val it represents.
const NEEDS2_QUIZ = [
  {
    q: 'Distance — You and your partner have felt a little distant lately. Nothing dramatic — just disconnected. Which would mean the most to you if {sub} did it today?',
    choices: [
      { label: '{Sub} sits down and genuinely asks how you\'ve been — and actually listens', need: 'conversation' },
      { label: '{Sub} reaches over and touches you — just to be close, no agenda',           need: 'affection' },
      { label: '{Sub} initiates sex — not routine, but like {sub} actually wants you',       need: 'sexual' },
      { label: '{Sub} tells you something specific {sub} admires about you',                 need: 'admiration' },
      { label: '{Sub} suggests something fun you can do together this weekend',              need: 'recreation' },
    ],
  },
  {
    q: 'Hard week — Brutal week at work. You walk in Friday evening running on empty. What would mean the most right now?',
    choices: [
      { label: '{Sub} lets you talk it out — no advice, just listening',                       need: 'conversation' },
      { label: 'Dinner is handled, the house is calm, nothing needs your attention',          need: 'domestic' },
      { label: '{Sub} pulls you onto the couch and just holds you',                            need: 'affection' },
      { label: '{Sub} tells you {sub} sees how hard you work and how much it matters',        need: 'admiration' },
      { label: '{Sub}\'s quietly handled the bills and finances so your mind can rest',       need: 'financial' },
    ],
  },
  {
    q: 'Misstep — You made a mistake at work that cost the team. You come home feeling small. What would help most tonight?',
    choices: [
      { label: '{Sub} listens and reminds you of times you\'ve come through under pressure',  need: 'admiration' },
      { label: '{Sub} reaches for you — a long hug, {pos} hand on your back',                  need: 'affection' },
      { label: '{Sub} tells you what {sub} honestly thinks, even the hard parts',              need: 'honesty' },
      { label: '{Sub} makes sure dinner and the evening run smoothly so you can just rest',   need: 'domestic' },
      { label: '{Sub} initiates intimacy that night — you feel wanted, not pitied',           need: 'sexual' },
    ],
  },
  {
    q: 'Reunion — You\'ve been apart for several days. You\'re finally home. What matters most in those first hours back together?',
    choices: [
      { label: 'A long catch-up — you want to tell {obj} everything and hear everything',   need: 'conversation' },
      { label: '{Sub} pulls you close — passionate, physical, like {sub} missed you',       need: 'sexual' },
      { label: 'Easy closeness — touching, sitting together, just being near {obj} again',  need: 'affection' },
      { label: '{Sub} made an effort tonight — {sub} looks beautiful and you notice',       need: 'attraction' },
      { label: 'You pick up right where you left off doing something you both love',        need: 'recreation' },
    ],
  },
  {
    q: 'After an argument — You had a real argument yesterday. It\'s the next morning. What matters most in moving forward?',
    choices: [
      { label: 'An honest conversation about what was actually going on underneath it', need: 'honesty' },
      { label: '{Sub} comes to you first — a long hug before any words',                 need: 'affection' },
      { label: '{Sub} makes breakfast and creates a calm, easy morning together',       need: 'domestic' },
      { label: '{Sub} suggests something fun to do today — a reset, not a debrief',     need: 'recreation' },
      { label: '{Sub} tells you {sub} respects the way you handled yourself',           need: 'admiration' },
    ],
  },
  {
    q: 'A good day — Something genuinely great happened — a win, recognition, a personal breakthrough. What matters most that evening?',
    choices: [
      { label: '{Sub} wants every detail — {sub}\'s genuinely excited to hear it all',     need: 'conversation' },
      { label: '{Sub} names specifically what\'s impressive about what you did',           need: 'admiration' },
      { label: '{Sub} plans something special — dinner, a night out — to mark the moment', need: 'recreation' },
      { label: '{Sub} initiates passionate intimacy to celebrate',                          need: 'sexual' },
      { label: '{Sub} put {ref} together tonight — {sub} looks stunning and {sub} knows it', need: 'attraction' },
    ],
  },
  {
    q: 'Ordinary Tuesday — No drama, nothing special — just a normal weeknight. What makes that evening actually feel good?',
    choices: [
      { label: 'Real conversation over dinner — not logistics, just talking',         need: 'conversation' },
      { label: 'On the couch together, touching, watching something — easy and close', need: 'affection' },
      { label: 'The house is in order, dinner happened, nothing is a mess',           need: 'domestic' },
      { label: 'Brief but real intimacy before sleep',                                 need: 'sexual' },
      { label: '{Sub} made an effort today — {sub} looks good and you notice',        need: 'attraction' },
    ],
  },
  {
    q: 'Big decision — You\'re facing a major decision — career change, big investment, life direction. What matters most from {obj}?',
    choices: [
      { label: '{Sub} gives you {pos} honest read, even when it\'s not what you want to hear', need: 'honesty' },
      { label: '{Sub} tells you {sub} trusts your judgment and {sub}\'s in whatever you decide', need: 'admiration' },
      { label: '{Sub} wants to sit down and think through it with you in depth',                need: 'conversation' },
      { label: '{Sub} handles the household and keeps finances stable so you can focus',        need: 'financial' },
      { label: '{Sub} makes sure you stay physically and intimately connected through stress', need: 'sexual' },
    ],
  },
  {
    q: 'Family gathering — A complicated family event is coming up — your side, some tension in the mix. What matters most about how {sub} shows up?',
    choices: [
      { label: '{Sub}\'s warm, engaged, genuinely present with your family',                            need: 'family' },
      { label: '{Sub} looks put together — you feel proud standing next to {obj}',                     need: 'attraction' },
      { label: '{Sub} stays close to you all night — a hand, a look, reminding you you\'re not alone', need: 'affection' },
      { label: '{Sub} handled the logistics without you — gifts, timing, everything',                  need: 'domestic' },
      { label: '{Sub} gives you {pos} honest read on the evening afterward',                            need: 'honesty' },
    ],
  },
  {
    q: 'Family life — You\'re thinking about your family — kids, legacy, what you\'re building together. What matters most about {pos} role?',
    choices: [
      { label: '{Sub}\'s deeply present with the kids — engaged, patient, genuinely invested',  need: 'family' },
      { label: 'You two talk openly about how you\'re showing up as parents and partners',      need: 'conversation' },
      { label: '{Sub} makes the home one where family actually wants to gather',                need: 'domestic' },
      { label: '{Sub} shows up put-together and present at every family moment',                need: 'attraction' },
      { label: '{Sub}\'s honest with you about what\'s working and what isn\'t',                need: 'honesty' },
    ],
  },
  {
    q: 'Financial pressure — Your financial situation feels uncertain — nothing catastrophic, but real pressure. What matters most from {obj}?',
    choices: [
      { label: '{Sub} contributes, manages the numbers with you, pulls {pos} weight',                    need: 'financial' },
      { label: '{Sub} tells you honestly what {sub}\'s worried about — and what {sub} isn\'t',           need: 'honesty' },
      { label: '{Sub} trims {pos} own spending and keeps the household running on less without complaint', need: 'domestic' },
      { label: '{Sub} tells you {sub}\'s not going anywhere — you\'ll figure it out together',           need: 'admiration' },
      { label: '{Sub} keeps the family stable and connected through the stress',                          need: 'family' },
    ],
  },
  {
    q: 'Five years from now — You\'re picturing your life with {obj} five years from now. What would make you feel like life is genuinely going well?',
    choices: [
      { label: 'Deep, ongoing honesty between you — no pretending, no walls',                need: 'honesty' },
      { label: 'Financial stability you built together, real security',                       need: 'financial' },
      { label: 'A physical and sexual connection that hasn\'t gone quiet',                    need: 'sexual' },
      { label: 'Real adventures and play together — you still have fun',                      need: 'recreation' },
      { label: 'A rich family life — kids, gatherings, something that feels like a legacy',   need: 'family' },
    ],
  },
];

// 12 scenarios for the Personal Needs calibration. Choices map to PERSONAL_NEEDS .val.
// Distribution intent: ~6 per need (actual: COM=6, AUT=6, CHA=6, FLO=6, ESC=6, IDE=6,
// BEL=6, AES=6, CMP=5, NAT=7 — minor uneven coverage, normalized by ratio at ranking time).
const NEEDS_PN_QUIZ = [
  {
    q: 'Saturday morning — Nothing is scheduled, nobody needs anything from you yet. What sounds most like exactly what you want?',
    choices: [
      { label: 'Disappear into something absorbing — a project, a book, a task — until hours have passed without noticing', need: 'flow' },
      { label: 'Go somewhere quiet and beautiful — coffee, good light, no agenda',                                            need: 'sensory' },
      { label: 'Get outside — move through open space, feel weather and ground under you',                                    need: 'nature' },
      { label: 'Do exactly what you want, in exactly the order you want, with no input from anyone',                          need: 'autonomy' },
      { label: 'Let the morning be slow and easy — no demands, no to-do list, just off',                                      need: 'escape' },
    ],
  },
  {
    q: 'Burned out — You\'re genuinely burned out — not just tired, but depleted. What actually restores you?',
    choices: [
      { label: 'Total detachment — no screens, no obligations, nothing that requires anything of you', need: 'escape' },
      { label: 'Getting out into open space — water, trees, sky, something bigger than your problems', need: 'nature' },
      { label: 'Being around people who know you well — easy company, no performance required',        need: 'belonging' },
      { label: 'A genuinely comfortable environment — good food, good atmosphere, physical ease',      need: 'sensory' },
      { label: 'Doing something entirely on your own terms, no schedule, no compromise',                need: 'autonomy' },
    ],
  },
  {
    q: 'Free weekend — You have a full weekend with no obligations. What kind of weekend actually leaves you feeling like yourself again?',
    choices: [
      { label: 'Something with real stakes — a trip, a race, a project where failure is possible',           need: 'challenge' },
      { label: 'Completely unstructured — you decide everything as you go, no plan at all',                  need: 'autonomy' },
      { label: 'Something competitive — a game, a sport, a contest where you\'re measuring yourself',        need: 'competition' },
      { label: 'Time with your people — a group that gets you, shared experience, easy belonging',           need: 'belonging' },
      { label: 'Something that\'s purely yours — connects to who you are, your interests, your values',      need: 'identity' },
    ],
  },
  {
    q: 'In a slump — You\'ve been in a flat stretch — unmotivated, a little lost. What tends to pull you out of it?',
    choices: [
      { label: 'Getting good at something again — practice, improvement, tangible progress',                       need: 'competence' },
      { label: 'Taking on something genuinely hard — something that demands everything you have',                  need: 'challenge' },
      { label: 'Finding an activity where you lose yourself completely — time disappears, mind quiets',            need: 'flow' },
      { label: 'A real break — stepping fully away from everything and just not thinking about any of it',         need: 'escape' },
      { label: 'Reconnecting with something that feels like the real you — not roles, not obligations',            need: 'identity' },
    ],
  },
  {
    q: 'Fully alive — Think of a moment when you felt most alive — electric, fully present, like this is it. What does that moment look like?',
    choices: [
      { label: 'Completely absorbed in something — no self-consciousness, just pure doing',         need: 'flow' },
      { label: 'Right at your edge — physically or mentally — where failure was genuinely possible', need: 'challenge' },
      { label: 'Head-to-head with someone — competing, pushing, giving everything',                 need: 'competition' },
      { label: 'Deep in nature — raw environment, weather, landscape doing something to you',       need: 'nature' },
      { label: 'Executing at a high level — feeling sharp, capable, in command',                     need: 'competence' },
    ],
  },
  {
    q: 'Rare solo time — You have a rare stretch of time entirely to yourself. No one is watching, nothing is expected. What do you actually do with it?',
    choices: [
      { label: 'Something that feels like you — an interest, a pursuit, a side of yourself that doesn\'t get much air', need: 'identity' },
      { label: 'Whatever you want, decided in the moment, with zero obligation to anyone',                              need: 'autonomy' },
      { label: 'Create the right environment — music, comfort, atmosphere — and just be in it',                         need: 'sensory' },
      { label: 'Connect with people you choose — low pressure, easy, on your terms',                                    need: 'belonging' },
      { label: 'Fully unplug — no productivity, no improvement, just genuine rest and relief',                          need: 'escape' },
    ],
  },
  {
    q: 'After finishing something hard — You just completed something difficult. What kind of feeling are you most looking for afterward?',
    choices: [
      { label: 'The satisfaction of having done it well — skill, execution, craftsmanship',         need: 'competence' },
      { label: 'The high of having beaten someone or something — a score, a time, a benchmark',    need: 'competition' },
      { label: 'The relief of having survived something genuinely difficult',                       need: 'challenge' },
      { label: 'The freedom of it being done — you answer to no one now',                          need: 'autonomy' },
      { label: 'The sense that this is who you are — this is what you do, what you\'re made of',   need: 'identity' },
    ],
  },
  {
    q: 'Restless — You\'re restless — can\'t settle, nothing is holding your attention. What actually works to get you out of your head?',
    choices: [
      { label: 'Finding something that pulls you fully in — where you stop thinking and just do',      need: 'flow' },
      { label: 'Getting physical — something demanding enough that your body takes over',              need: 'challenge' },
      { label: 'Getting outside — movement, air, landscape, away from walls and screens',              need: 'nature' },
      { label: 'Being around your people — the right company, easy energy, no need to explain yourself', need: 'belonging' },
      { label: 'Building or making something — tangible progress, a problem you can actually solve',   need: 'competence' },
    ],
  },
  {
    q: 'End of a long stretch — You\'ve just come off a long, demanding stretch of work or responsibility. What does genuinely good recovery look like?',
    choices: [
      { label: 'Complete psychological off — no thinking about anything important for a while',     need: 'escape' },
      { label: 'Physical comfort and pleasure — good food, good environment, ease',                  need: 'sensory' },
      { label: 'Time with people who fill you up — low effort, high warmth',                         need: 'belonging' },
      { label: 'Doing something you\'re good at — easy competence, no struggle, just smooth execution', need: 'competence' },
      { label: 'Being somewhere that does something to you — landscape, water, open air',            need: 'nature' },
    ],
  },
  {
    q: 'Planning for yourself — You\'re planning something just for you. What does the ideal version look like?',
    choices: [
      { label: 'Something that connects to who you actually are — your real interests, your values, your history', need: 'identity' },
      { label: 'An experience with genuine depth — where you get absorbed and lose track of everything else',      need: 'flow' },
      { label: 'Something with a score, a ranking, a result — you want to know how you did',                       need: 'competition' },
      { label: 'Completely self-directed — you decide everything, answer to no one, go at your own pace',          need: 'autonomy' },
      { label: 'Somewhere beautiful or atmospheric — the environment itself is part of the point',                  need: 'sensory' },
    ],
  },
  {
    q: 'Surprised by restoration — Think of a time you felt unexpectedly restored — you didn\'t plan it, but something filled you back up. What was it most like?',
    choices: [
      { label: 'A moment in nature that caught you off guard — something about the light, the space, the quiet',  need: 'nature' },
      { label: 'A conversation or gathering where you felt genuinely known and accepted',                          need: 'belonging' },
      { label: 'Doing something you were good at — it just flowed, and you remembered you had this',               need: 'competence' },
      { label: 'Getting completely lost in something — you looked up and an hour had passed',                      need: 'flow' },
      { label: 'A sensory moment — a meal, a space, music — that was just exactly right',                          need: 'sensory' },
    ],
  },
  {
    q: 'Looking back — Thinking about the times in your life when you\'ve felt most like yourself — most restored, most whole. What was usually at the center of it?',
    choices: [
      { label: 'Competing and performing — measuring yourself, pushing against something real',           need: 'competition' },
      { label: 'Being tested — hard things, uncertain outcomes, genuine risk',                             need: 'challenge' },
      { label: 'A clear sense of who you are and what you stand for — your own life, on your own terms',  need: 'identity' },
      { label: 'The natural world — places that made you feel small and alive at the same time',          need: 'nature' },
      { label: 'Real relief from the weight of things — times when you were truly free of it all',        need: 'escape' },
    ],
  },
];

// Generic slot-count builder — counts how many times each need appears as a choice
// across all questions in a quiz. Used to normalize hit counts by available coverage.
function buildQuizSlotsMap(quiz, needsList) {
  const counts = {};
  for (const need of needsList) counts[need.val] = 0;
  for (const q of quiz) {
    for (const c of q.choices) {
      if (counts[c.need] != null) counts[c.need]++;
    }
  }
  return counts;
}

// Slot counts per need across each quiz. Computed once at module load.
const NEEDS2_SLOTS   = buildQuizSlotsMap(NEEDS2_QUIZ,   EMOTIONAL_NEEDS);
const NEEDS_PN_SLOTS = buildQuizSlotsMap(NEEDS_PN_QUIZ, PERSONAL_NEEDS);

// Convert quiz answers into a hit count per need. Each answer may be a single
// choice index OR an array of indices (for quizzes that allow multi-select).
function needs2TallyHits(answers) {
  const counts = Object.fromEntries(EMOTIONAL_NEEDS.map(n => [n.val, 0]));
  for (const [qIdxStr, value] of Object.entries(answers || {})) {
    const qIdx = Number(qIdxStr);
    const q = NEEDS2_QUIZ[qIdx];
    if (!q) continue;
    const indices = Array.isArray(value) ? value : [value];
    for (const cIdx of indices) {
      const choice = q.choices[cIdx];
      if (!choice) continue;
      if (counts[choice.need] != null) counts[choice.need]++;
    }
  }
  return counts;
}

// Sort needs into a ranked order from quiz hit counts.
// Primary: raw hits DESC (number of selections, what the user asked for).
// Within a hit-tied group: honor explicit tie-breaker picks first, then ratio,
// then alphabetical. Tie-breaker picks come as { hitCount, members, picks }.
function needs2OrderFromCounts(counts, tieGroups) {
  return EMOTIONAL_NEEDS
    .map(n => {
      const hits  = counts[n.val] || 0;
      const slots = NEEDS2_SLOTS[n.val] || 1;
      return { val: n.val, label: n.label, hits, slots, ratio: hits / slots };
    })
    .sort((a, b) => {
      if (b.hits !== a.hits) return b.hits - a.hits;
      // Same hit count — see if the user explicitly ordered this tied group
      if (tieGroups && tieGroups.length) {
        const group = tieGroups.find(g => g.hitCount === a.hits && g.members.includes(a.val) && g.members.includes(b.val));
        if (group) {
          const idxOf = (v) => {
            const pi = group.picks.indexOf(v);
            return pi >= 0 ? pi : group.picks.length; // unpicked → last
          };
          const ia = idxOf(a.val), ib = idxOf(b.val);
          if (ia !== ib) return ia - ib;
        }
      }
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return a.label.localeCompare(b.label);
    })
    .map(o => o.val);
}

// Build the list of tie-breaker groups from a hits map. A "group" is a set of
// needs sharing the same hit count, size >= 2. Each group contributes
// (members.length - 1) tie-breaker questions.
function needs2BuildTieGroups(counts) {
  const byCount = {};
  for (const need of EMOTIONAL_NEEDS) {
    const c = counts[need.val] || 0;
    if (!byCount[c]) byCount[c] = [];
    byCount[c].push(need);
  }
  const groups = [];
  for (const c of Object.keys(byCount).map(Number).sort((a, b) => b - a)) {
    const members = byCount[c];
    if (members.length < 2) continue;
    members.sort((a, b) => a.label.localeCompare(b.label));
    groups.push({
      hitCount: c,
      members: members.map(m => m.val),
      picks: [],
    });
  }
  return groups;
}

// Locate which tie-breaker group and pick index a flat tie-breaker idx falls in.
function needs2TieBreakerAt(groups, tbIdx) {
  let acc = 0;
  for (let gi = 0; gi < groups.length; gi++) {
    const groupSize = groups[gi].members.length - 1;
    if (tbIdx < acc + groupSize) {
      return { groupIdx: gi, pickIdx: tbIdx - acc, group: groups[gi] };
    }
    acc += groupSize;
  }
  return null;
}

// Members of a tie-breaker group still in contention at a given pick index.
function needs2TieBreakerPool(group, pickIdx) {
  const alreadyPicked = group.picks.slice(0, pickIdx);
  return group.members.filter(m => !alreadyPicked.includes(m));
}

function needs2TotalTieBreakers(groups) {
  if (!groups) return 0;
  return groups.reduce((s, g) => s + (g.members.length - 1), 0);
}

// Derive bell-curve ratings (9/7/5/3/1) purely from a positional order array.
// Top slot → 9, next two → 7, next four → 5, next two → 3, last → 1.
function needs2RatingsFromOrder(order) {
  const ratings = {};
  let i = 0;
  for (const bucket of NEEDS2_BUCKETS) {
    for (let k = 0; k < bucket.size && i < order.length; k++, i++) {
      ratings[order[i]] = bucket.val;
    }
  }
  return ratings;
}

function needs2RatingFor(val) {
  return (S.needs2Ratings && S.needs2Ratings[val] != null) ? S.needs2Ratings[val] : null;
}
function needs2RatingLabel(rating) {
  return NEEDS2_RATING_LABELS.find(l => l.val === rating)?.label || '—';
}

/* ── PN (personal needs) equivalents ────────────────── */
function needsPnTallyHits(answers) {
  const counts = Object.fromEntries(PERSONAL_NEEDS.map(n => [n.val, 0]));
  for (const [qIdxStr, value] of Object.entries(answers || {})) {
    const q = NEEDS_PN_QUIZ[Number(qIdxStr)];
    if (!q) continue;
    const indices = Array.isArray(value) ? value : [value];
    for (const cIdx of indices) {
      const choice = q.choices[cIdx];
      if (!choice) continue;
      if (counts[choice.need] != null) counts[choice.need]++;
    }
  }
  return counts;
}

function needsPnBuildTieGroups(counts) {
  const byCount = {};
  for (const need of PERSONAL_NEEDS) {
    const c = counts[need.val] || 0;
    if (!byCount[c]) byCount[c] = [];
    byCount[c].push(need);
  }
  const groups = [];
  for (const c of Object.keys(byCount).map(Number).sort((a, b) => b - a)) {
    const members = byCount[c];
    if (members.length < 2) continue;
    members.sort((a, b) => a.label.localeCompare(b.label));
    groups.push({ hitCount: c, members: members.map(m => m.val), picks: [] });
  }
  return groups;
}

function needsPnOrderFromCounts(counts, tieGroups) {
  return PERSONAL_NEEDS
    .map(n => {
      const hits  = counts[n.val] || 0;
      const slots = NEEDS_PN_SLOTS[n.val] || 1;
      return { val: n.val, label: n.label, hits, slots, ratio: hits / slots };
    })
    .sort((a, b) => {
      if (b.hits !== a.hits) return b.hits - a.hits;
      if (tieGroups && tieGroups.length) {
        const group = tieGroups.find(g => g.hitCount === a.hits && g.members.includes(a.val) && g.members.includes(b.val));
        if (group) {
          const idxOf = (v) => {
            const pi = group.picks.indexOf(v);
            return pi >= 0 ? pi : group.picks.length;
          };
          const ia = idxOf(a.val), ib = idxOf(b.val);
          if (ia !== ib) return ia - ib;
        }
      }
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      return a.label.localeCompare(b.label);
    })
    .map(o => o.val);
}

function buildNeeds2Panel() {
  if (!S.needs2Quiz) S.needs2Quiz = { open: false, idx: 0, answers: {}, tieGroups: null };
  const quiz = S.needs2Quiz;
  const baseCount = NEEDS2_QUIZ.length;
  const inTieBreaker = quiz.idx >= baseCount;
  const totalQuestions = baseCount + needs2TotalTieBreakers(quiz.tieGroups);

  const openQuiz = () => {
    S.needs2Quiz = { open: true, idx: 0, answers: {}, tieGroups: null };
    render();
  };
  const closeQuiz = () => {
    S.needs2Quiz = { ...quiz, open: false };
    render();
  };
  const goBack = () => {
    if (quiz.idx > 0) {
      S.needs2Quiz = { ...quiz, idx: quiz.idx - 1 };
      render();
    }
  };
  const goNext = () => {
    // Special case: leaving the last base question. Compute tie groups —
    // if any exist, enter the tie-breaker phase, otherwise save right away.
    if (!inTieBreaker && quiz.idx === baseCount - 1) {
      const counts    = needs2TallyHits(quiz.answers);
      const tieGroups = needs2BuildTieGroups(counts);
      if (tieGroups.length > 0) {
        S.needs2Quiz = { ...quiz, idx: baseCount, tieGroups };
        render();
      } else {
        S.needs2Quiz = { ...quiz, tieGroups: null };
        onSave();
      }
      return;
    }
    if (quiz.idx < totalQuestions - 1) {
      S.needs2Quiz = { ...quiz, idx: quiz.idx + 1 };
      render();
    } else {
      // Past the last question — save.
      onSave();
    }
  };
  const onSave = () => {
    const counts = needs2TallyHits(quiz.answers);
    const order  = needs2OrderFromCounts(counts, quiz.tieGroups);
    S.needs2Order   = order;
    S.needs2Hits    = counts;
    S.needs2Ratings = needs2RatingsFromOrder(order);
    saveSettings();
    showToast('✓ Calibration saved');
    closeQuiz();
  };
  const selectChoice = (choiceIdx) => {
    // Changing a base answer invalidates any computed tie groups.
    S.needs2Quiz = {
      ...quiz,
      answers: { ...quiz.answers, [quiz.idx]: choiceIdx },
      tieGroups: null,
    };
    render();
  };
  const selectTieBreaker = (chosenVal) => {
    const tbIdx = quiz.idx - baseCount;
    const info = needs2TieBreakerAt(quiz.tieGroups, tbIdx);
    if (!info) return;
    const newGroups = quiz.tieGroups.map((g, gi) => {
      if (gi !== info.groupIdx) return g;
      // Truncate later picks for this group (re-picking earlier in sequence
      // invalidates picks that depended on the prior choice).
      const newPicks = g.picks.slice(0, info.pickIdx);
      newPicks.push(chosenVal);
      return { ...g, picks: newPicks };
    });
    S.needs2Quiz = { ...quiz, tieGroups: newGroups };
    render();
  };

  // Move a need up or down in the saved order. Ratings re-derive from the new
  // positions so the bell-curve labels follow whatever the user puts on top.
  const moveNeed = (val, delta) => {
    const order = (S.needs2Order || []).slice();
    const idx = order.indexOf(val);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= order.length) return;
    [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
    S.needs2Order   = order;
    S.needs2Ratings = needs2RatingsFromOrder(order);
    saveSettings();
    render();
  };

  const isLast    = quiz.idx === totalQuestions - 1;
  const hasAnswer = (() => {
    if (!inTieBreaker) return quiz.answers[quiz.idx] != null;
    const info = needs2TieBreakerAt(quiz.tieGroups || [], quiz.idx - baseCount);
    return info != null && info.group.picks.length > info.pickIdx;
  })();
  // Whether tapping Continue on the last base question will transition into
  // tie-breakers (rather than save). Computed for the button label.
  const willEnterTieBreakers = !inTieBreaker && quiz.idx === baseCount - 1 && (() => {
    const c = needs2TallyHits(quiz.answers);
    return needs2BuildTieGroups(c).length > 0;
  })();

  // The displayed order: prefer the saved order array (post-quiz, possibly
  // manually reordered). Fall back to EMOTIONAL_NEEDS default for the
  // pre-calibration view.
  const hasRatings = S.needs2Ratings && Object.keys(S.needs2Ratings).length > 0;
  const orderArr   = Array.isArray(S.needs2Order) && S.needs2Order.length === EMOTIONAL_NEEDS.length
    ? S.needs2Order
    : null;
  const orderedNeeds = orderArr
    ? orderArr.map(val => EMOTIONAL_NEEDS.find(n => n.val === val)).filter(Boolean)
    : EMOTIONAL_NEEDS;

  const quizModal = quiz.open ? (() => {
    // Branch: base scenario question vs tie-breaker question.
    let qText, qChoices, currentAnswerIdx, onPick;
    if (inTieBreaker) {
      const info = needs2TieBreakerAt(quiz.tieGroups, quiz.idx - baseCount);
      const pool = info ? needs2TieBreakerPool(info.group, info.pickIdx) : [];
      const poolNeeds = pool.map(v => EMOTIONAL_NEEDS.find(n => n.val === v)).filter(Boolean);
      const poolLabels = poolNeeds.map(n => n.label);
      const remaining = pool.length;
      qText = remaining === info.group.members.length
        ? 'Tie-breaker — these needs tied. Which matters most to you?'
        : (remaining === 2
            ? 'Between the last two, which matters more?'
            : 'And from the remaining, which matters most next?');
      qChoices = poolNeeds.map(n => ({ label: n.label, val: n.val }));
      currentAnswerIdx = info.group.picks[info.pickIdx] != null
        ? qChoices.findIndex(c => c.val === info.group.picks[info.pickIdx])
        : -1;
      onPick = (cIdx) => selectTieBreaker(qChoices[cIdx].val);
    } else {
      const current = NEEDS2_QUIZ[quiz.idx];
      qText = applyPartnerPronouns(current.q);
      qChoices = current.choices.map(c => ({ label: applyPartnerPronouns(c.label) }));
      currentAnswerIdx = quiz.answers[quiz.idx] != null ? quiz.answers[quiz.idx] : -1;
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
        // Header
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
            style:{
              background:'none', border:'none', cursor:'pointer',
              fontSize:'18px', color:'var(--muted)', padding:'4px 8px',
            },
            onclick: closeQuiz,
          }, '×')
        ),
        // Progress bar
        h('div',{style:{
          height:'3px', background:'var(--surface-1)',
        }},
          h('div',{style:{
            height:'100%', width:(((quiz.idx + 1) / totalQuestions) * 100).toFixed(1)+'%',
            background:'var(--c-affection)',
            transition:'width 0.25s',
          }})
        ),
        // Body
        h('div',{style:{
          padding:'20px 18px', flex:'1 1 auto', minHeight:'0',
          overflowY:'auto', WebkitOverflowScrolling:'touch',
          overscrollBehavior:'contain',
        }},
          h('div',{style:{
            fontSize:'15px', color:'var(--text)', lineHeight:'1.5',
            marginBottom:'18px', fontFamily:"'DM Sans',sans-serif",
          }}, qText),
          h('div',{style:{display:'flex', flexDirection:'column', gap:'8px'}},
            ...qChoices.map((choice, idx) => {
              const selected = currentAnswerIdx === idx;
              return h('button',{
                style:{
                  display:'flex', alignItems:'center', gap:'10px',
                  padding:'12px 14px', borderRadius:'10px', cursor:'pointer',
                  fontFamily:"'DM Sans',sans-serif", textAlign:'left',
                  background: selected ? 'rgba(224,133,184,0.12)' : 'var(--bg2)',
                  border: selected ? '1px solid var(--c-affection)' : '1px solid var(--border)',
                  color: selected ? 'var(--c-affection)' : 'var(--text)',
                  fontSize:'13px',
                },
                onclick:()=>onPick(idx),
              },
                h('span',{style:{
                  width:'16px', height:'16px', borderRadius:'50%',
                  border: selected ? '1px solid var(--c-affection)' : '1px solid var(--muted)',
                  background: selected ? 'var(--c-affection)' : 'transparent',
                  boxShadow: selected ? 'inset 0 0 0 3px var(--bg2)' : 'none',
                  flexShrink:'0',
                }}),
                h('span',{}, choice.label)
              );
            })
          )
        ),
        // Footer
        h('div',{style:{
          padding:'12px 18px', borderTop:'1px solid var(--surface-2)',
          display:'flex', gap:'8px',
        }},
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
              background: hasAnswer ? 'var(--c-affection)' : 'var(--bg3)',
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

  return h('div',{class:'insights-panel'},
    h('div',{style:{paddingTop:'14px',paddingBottom:'14px'}},
      h('div',{style:{fontSize:'10px',fontWeight:'600',letterSpacing:'0.07em',textTransform:'uppercase',color:'var(--muted)',marginBottom:'12px'}},
        'Emotional needs'),
      // Stacked list — same structure as the Needs tab's drag-rank list
      h('div',{style:{marginBottom:'14px'}},
        ...orderedNeeds.map((need, idx) => {
          const rating = needs2RatingFor(need.val);
          const ratingLabel = rating != null ? needs2RatingLabel(rating) : null;
          const canMove = orderArr != null; // arrows only after calibration
          const isFirst = idx === 0;
          const isLast  = idx === orderedNeeds.length - 1;

          const btnStyle = (disabled) => ({
            width:'28px', height:'28px', borderRadius:'7px',
            border:'1px solid var(--border)', background:'var(--surface-1)',
            fontSize:'13px', cursor: disabled ? 'default' : 'pointer',
            color: disabled ? 'var(--muted-3)' : 'var(--muted)',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:'0',
          });
          // Set disabled as a property after construction — h()'s setAttribute path
          // treats `disabled:false` as a present attribute and disables the button.
          const upBtn = h('button',{style:btnStyle(isFirst)}, '↑');
          if (isFirst) upBtn.disabled = true;
          else upBtn.addEventListener('click', () => moveNeed(need.val, -1));
          const dnBtn = h('button',{style:btnStyle(isLast)}, '↓');
          if (isLast) dnBtn.disabled = true;
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
            canMove ? h('div',{style:{display:'flex',flexDirection:'column',gap:'2px',flexShrink:'0'}}, upBtn, dnBtn) : null
          );
        })
      ),
      h('button',{
        style:{
          width:'100%', padding:'12px', borderRadius:'14px', border:'none',
          background:'var(--c-affection)', color:'var(--bg)',
          fontSize:'13px', fontWeight:'500', cursor:'pointer',
          fontFamily:"'DM Sans',sans-serif",
        },
        onclick: openQuiz,
      }, hasRatings ? 'Re-calibrate' : 'Start calibration'),

      // ── Debug panel ─────────────────────────────────
      S.showDebug ? (() => {
        // Prefer saved hits from the last completed quiz, otherwise compute
        // from the current draft (in-progress quiz). Zeros if neither exists.
        const savedCounts = S.needs2Hits || {};
        const hasSaved    = Object.values(savedCounts).some(v => v > 0);
        const draftCounts = needs2TallyHits(quiz.answers || {});
        const hasDraft    = Object.values(draftCounts).some(v => v > 0);
        const liveCounts  = hasSaved && !hasDraft ? savedCounts : draftCounts;
        const hasAnyHits  = hasSaved || hasDraft;
        const rows = EMOTIONAL_NEEDS.map(n => {
          const hits  = liveCounts[n.val] || 0;
          const slots = NEEDS2_SLOTS[n.val] || 0;
          const ratio = slots > 0 ? hits / slots : 0;
          const rating = needs2RatingFor(n.val);
          return { val: n.val, label: n.label, hits, slots, ratio, rating };
        }).sort((a, b) => {
          // Match the save-time order: hits → ratio → alpha
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
          marginTop:'16px', padding:'10px 12px', borderRadius:'10px',
          background:'var(--surface-1)', border:'1px solid var(--surface-2)',
          fontSize:'11px', fontFamily:"'DM Sans',sans-serif",
        }},
          h('div',{style:{fontWeight:'600',color:'var(--text-strong)',marginBottom:'8px',fontSize:'11px',letterSpacing:'0.06em',textTransform:'uppercase'}},
            'Needs2 · debug'),
          h('div',{style:{fontSize:'10px',color:'var(--muted)',marginBottom:'8px',lineHeight:'1.5'}},
            hasAnyHits
              ? (hasRatings ? 'Showing saved hit counts and assigned ratings.' : 'Showing current draft answers (not yet saved).')
              : 'No answers yet. Start the calibration to populate.'),
          // Header row
          h('div',{style:{display:'flex',alignItems:'center',gap:'8px',padding:'4px 0',borderBottom:'1px solid var(--surface-2)'}},
            h('span',{style:{flex:'1',fontSize:'10px',color:'var(--muted)',letterSpacing:'0.04em',textTransform:'uppercase'}}, 'Need'),
            headerCell('Hits', '38px'),
            headerCell('Slots','38px'),
            headerCell('Ratio','48px'),
            headerCell('Rating','98px'),
          ),
          ...rows.map(r => h('div',{style:{
            display:'flex', alignItems:'center', gap:'8px',
            padding:'4px 0', borderBottom:'1px solid var(--surface-2)',
          }},
            h('span',{style:{flex:'1', fontSize:'11px', color:'var(--text)'}}, r.label),
            dataCell(String(r.hits),  '38px', true),
            dataCell(String(r.slots), '38px', false),
            dataCell(r.ratio.toFixed(2), '48px', true),
            dataCell(r.rating != null ? needs2RatingLabel(r.rating) : '—', '98px', false),
          )),
          h('div',{style:{marginTop:'8px',fontSize:'10px',color:'var(--muted)',lineHeight:'1.5'}},
            'Sorted by hits (number of selections). Tiebreaks: ratio (hits ÷ slots), then alphabetical.'
          ),
        );
      })() : null,
    ),
    quizModal,
  );
}
