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

// 12 scenarios for the Social Needs calibration. Choices map to SOCIAL_NEEDS .val.
// Distribution: each of the 10 needs appears exactly 6 times across 60 choice slots.
// Used in Individual mode only.
const NEEDS_SN_QUIZ = [
  {
    q: 'Distance — You and a close friend haven\'t talked in a while. Nothing dramatic, just drifted. Which would mean the most if they reached out today?',
    choices: [
      { label: 'They ask how you\'ve actually been — and listen',                                       need: 'support' },
      { label: 'They invite you to something low-key — coffee, a walk, a hang',                        need: 'companionship' },
      { label: 'They bring up something you both care about — a project, a cause, an idea',            need: 'meaning' },
      { label: 'They tell you they\'ve been thinking about you, that you matter to them',              need: 'validation' },
      { label: 'They send something dumb and funny that makes you laugh out loud',                     need: 'play' },
    ],
  },
  {
    q: 'Hard week — School or work has been brutal. You\'re walking in Friday evening exhausted. What would mean the most right now?',
    choices: [
      { label: 'Someone you can vent to who just listens',                                   need: 'support' },
      { label: 'Someone brings food over or handles something practical you\'ve been dreading', need: 'help' },
      { label: 'A friend coming over to just hang in the same space — low-key, no plans',     need: 'companionship' },
      { label: 'A friend pulls you out for something dumb and fun — no thinking needed',      need: 'play' },
      { label: 'Someone reminding you that you\'re doing more than you think',                need: 'validation' },
    ],
  },
  {
    q: 'Tough decision — You\'re facing a real choice — a big one. What matters most from the people around you?',
    choices: [
      { label: 'Someone whose judgment you trust telling you what they actually think',     need: 'advice' },
      { label: 'Someone listening through it without pressuring you to decide',             need: 'support' },
      { label: 'A friend who challenges your reasoning, won\'t let you off easy',           need: 'growth' },
      { label: 'Someone reminding you you\'ve handled hard things before',                  need: 'validation' },
      { label: 'Someone helping you reconnect with what you actually care about',           need: 'meaning' },
    ],
  },
  {
    q: 'Back in town — You\'ve been away for a stretch and you\'re back. What\'s the first thing that matters?',
    choices: [
      { label: 'Doing something normal with a friend — picking up where you left off',  need: 'companionship' },
      { label: 'A long catch-up with someone close — the real stuff, not the surface', need: 'intimacy' },
      { label: 'Going out with the group — laughs, music, no agenda',                   need: 'play' },
      { label: 'Showing up to the regular thing — practice, club, the usual crew',     need: 'community' },
      { label: 'Someone helping you catch up on what piled up while you were gone',     need: 'help' },
    ],
  },
  {
    q: 'Group setting — A bunch of people you know are together. What would make the evening actually feel good?',
    choices: [
      { label: 'Conversations that get past surface — what you all actually care about', need: 'meaning' },
      { label: 'It feels like a group, not just individuals — you belong here',           need: 'community' },
      { label: 'A real one-on-one moment with someone close inside the bigger thing',    need: 'intimacy' },
      { label: 'Someone in the group having your back on a small thing you need',         need: 'help' },
      { label: 'Someone actually notices you and pulls you in',                            need: 'validation' },
    ],
  },
  {
    q: 'After a misstep — You messed something up. Hurt a friend, dropped a ball, said the wrong thing. What matters most that night?',
    choices: [
      { label: 'Someone to talk it through with — no judgment',                                 need: 'support' },
      { label: 'Someone giving you their honest read — what to do to fix it',                   need: 'advice' },
      { label: 'Someone who pushes you to own it and figure out how to make it right',          need: 'growth' },
      { label: 'Someone reminding you a mistake doesn\'t define you',                            need: 'validation' },
      { label: 'Telling someone the real stuff — the parts you don\'t say out loud',             need: 'intimacy' },
    ],
  },
  {
    q: 'Stuck — You feel stuck. Same routine, same days, nothing moving. What matters most from your people?',
    choices: [
      { label: 'Someone challenging you to shake it up — pushing you out of it',                need: 'growth' },
      { label: 'A friend dragging you somewhere fun and unfamiliar',                             need: 'play' },
      { label: 'Someone reconnecting you with what you actually want from this stretch of life', need: 'meaning' },
      { label: 'Someone with perspective pointing out what you can\'t see',                       need: 'advice' },
      { label: 'Showing up somewhere you belong — a group, a place, a rhythm',                    need: 'community' },
    ],
  },
  {
    q: 'Ordinary Tuesday — Nothing dramatic. Just a normal weeknight. What makes that evening feel good?',
    choices: [
      { label: 'Time with a close person — easy, not productive',                       need: 'companionship' },
      { label: 'A bit of fun — a game, a stupid show, laughter',                         need: 'play' },
      { label: 'One real conversation with someone you trust',                           need: 'intimacy' },
      { label: 'A regular thing — group, club, friends meeting at the usual spot',      need: 'community' },
      { label: 'A friend showing up with something you\'ve been meaning to get done',   need: 'help' },
    ],
  },
  {
    q: 'A good day — Something genuinely great happened — recognition, an achievement, a breakthrough. What matters most that night?',
    choices: [
      { label: 'Someone naming specifically what\'s impressive about it',           need: 'validation' },
      { label: 'Going out to celebrate — fun, ridiculous, no holding back',          need: 'play' },
      { label: 'Someone helping you think about what comes next',                    need: 'advice' },
      { label: 'Sharing it with your group — they see what it means',                need: 'community' },
      { label: 'Sitting with someone who gets why it matters beyond the surface',    need: 'meaning' },
    ],
  },
  {
    q: 'Practical bind — You need something concrete — a ride, a place to crash, a hand with a task. What matters most about how it lands?',
    choices: [
      { label: 'Someone who shows up without making a thing of it',                                 need: 'help' },
      { label: 'Someone who asks if you\'re okay underneath the practical ask',                     need: 'support' },
      { label: 'Someone offering a smarter way to handle it',                                        need: 'advice' },
      { label: 'Someone helping but also pushing you to set things up better next time',            need: 'growth' },
      { label: 'Just being together while you sort it out — even if they can\'t fix it',             need: 'companionship' },
    ],
  },
  {
    q: 'A friend struggling — Someone you care about is going through something hard. What kind of friend would you most want to be capable of being for them?',
    choices: [
      { label: 'The one they can vent to who actually listens',     need: 'support' },
      { label: 'The person they tell the real stuff to',             need: 'intimacy' },
      { label: 'The friend who actually shows up with what they need', need: 'help' },
      { label: 'The voice they trust to tell them straight',         need: 'advice' },
      { label: 'The one who won\'t let them stay stuck in it',       need: 'growth' },
    ],
  },
  {
    q: 'A year from now — You\'re picturing your life a year from now. What would make it feel genuinely full on the social side?',
    choices: [
      { label: 'A group of people who feel like your people — somewhere you belong',     need: 'community' },
      { label: 'A handful of close people who really know you',                            need: 'intimacy' },
      { label: 'Regular time with people you actually enjoy',                              need: 'companionship' },
      { label: 'Friends who push you to become someone you\'re proud of',                  need: 'growth' },
      { label: 'Connections built around what matters to you — shared purpose, values',   need: 'meaning' },
    ],
  },
];

// Slot counts per need across each quiz. Computed once at module load.
const NEEDS2_SLOTS   = buildQuizSlotsMap(NEEDS2_QUIZ,   EMOTIONAL_NEEDS);
const NEEDS_PN_SLOTS = buildQuizSlotsMap(NEEDS_PN_QUIZ, PERSONAL_NEEDS);
const NEEDS_SN_SLOTS = buildQuizSlotsMap(NEEDS_SN_QUIZ, SOCIAL_NEEDS);

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

/* ── SN (social needs) equivalents — Individual mode only ── */
function needsSnTallyHits(answers) {
  const counts = Object.fromEntries(SOCIAL_NEEDS.map(n => [n.val, 0]));
  for (const [qIdxStr, value] of Object.entries(answers || {})) {
    const q = NEEDS_SN_QUIZ[Number(qIdxStr)];
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

function needsSnBuildTieGroups(counts) {
  const byCount = {};
  for (const need of SOCIAL_NEEDS) {
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

function needsSnOrderFromCounts(counts, tieGroups) {
  return SOCIAL_NEEDS
    .map(n => {
      const hits  = counts[n.val] || 0;
      const slots = NEEDS_SN_SLOTS[n.val] || 1;
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
