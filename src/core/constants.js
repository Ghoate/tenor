'use strict';

/* ── Constants ──────────────────────────────────────── */
const LIBIDO_LEVELS = [
  {val:1,label:'Absent',           desc:'No awareness at all'},
  {val:2,label:'Distant',          desc:'A faint trace, easily ignored'},
  {val:3,label:'Present',          desc:'Aware and noticeable'},
  {val:4,label:'Strong',           desc:'Clearly there, hard to ignore'},
  {val:5,label:'Consuming',        desc:'Dominant, hard to concentrate'},
];
const MOOD_EMOJIS   = ['😶','😔','😐','🙂','😊'];
const MOOD_LABELS   = ['Low','Below average','Okay','Good','Great'];
const ENERGY_EMOJIS = ['🪫','😴','⚡','🔋','🚀'];
const ENERGY_LABELS = ['Depleted','Low','Moderate','Good','High'];
const CONFLICT_LEVELS = [
  {val:1,label:'Calm',sub:'Difficult but calm'},
  {val:2,label:'Tension',          sub:'Friction, some edge'},
  {val:3,label:'Argument',         sub:'Raised voices or notable distress'},
  {val:4,label:'Serious',sub:'Significant emotional impact'},
  {val:5,label:'Crisis',     sub:'Deeply destabilising'},
];

const CONFLICT_HARM = [
  {val:1, label:'None',        sub:'No lasting damage — connection intact'},
  {val:2, label:'Minor',       sub:'Small dent, fades quickly'},
  {val:3, label:'Notable',  sub:'Tangible impact, takes time to recover'},
  {val:4, label:'Deep',      sub:'Real damage to trust or closeness'},
  {val:5, label:'Severe',      sub:'Deep wound to the emotional connection'},
];

// Conduct — how the conflict was conducted (Harley Love Buster dimension)
// Single-select: worst point reached during this conflict
const CONFLICT_CONDUCT = [
  {val:'calm',        label:'Calm',          sub:'Difficult but no raised voices or attacks — handled with care',       mult:0.20},
  {val:'demands',     label:'Voices',  sub:'Voices raised, some rudeness — friction without personal attacks',    mult:0.40},
  {val:'disrespect',  label:'Contempt',    sub:'Accusations, contempt, or criticism of character',                    mult:0.60},
  {val:'angry',       label:'Anger',         sub:'Strong anger, demands, or serious disrespect — loss of control',      mult:0.80},
  {val:'withdrawn',   label:'Shutdown',      sub:'One or both shut down — stonewalling or emotional withdrawal',        mult:1.00},
];

// Intensity multipliers — severity anchor, scales base weight up
const CONF_INTENSITY_M = {1:0.20, 2:0.40, 3:0.60, 4:0.80, 5:1.00};

// Conduct multipliers keyed by val for fast lookup
const CONF_CONDUCT_M = Object.fromEntries(CONFLICT_CONDUCT.map(c=>[c.val, c.mult]));

// ── Attachment tags (conflict) ────────────────────────────────────────
// Optional, multi-select cues describing YOUR behaviour during the conflict.
// Grouped by axis: 'anxiety' (hyperactivation), 'avoidance' (deactivation),
// 'secure' (regulated engagement), 'disorganized' (oscillating/contradictory).
// Used by the Attachment tab — never scored, never affects the bank.
const CONFLICT_ATTACHMENT_TAGS = [
  // Anxiety / hyperactivation
  {val:'reached',        axis:'anxiety',      label:'Reached for reassurance',
    sub:'Sought contact, comfort, or some signal of being okay mid-conflict — touched their arm, asked "are we good?", looked for a softening from them. From inside, often feels like a need to know the bond is still there before you can keep going.'},
  {val:'pursued',        axis:'anxiety',      label:'Pursued',
    sub:'Kept following up after they tried to step away — brought it up again, sent another text, didn\'t let the conversation close. From inside, often feels like the disconnect can\'t be left to settle on its own; the contact has to be maintained or something will break.'},
  {val:'escalated',      axis:'anxiety',      label:'Escalated to be heard',
    sub:'Volume rose, tone sharpened, or you said the same thing in stronger and stronger ways trying to land it. From inside, often feels like you\'re not being received — the only way to be heard is to make it bigger.'},
  {val:'critical',       axis:'anxiety',      label:'Got critical / sharp',
    sub:'Used criticism, blame, or a biting tone — naming what they did wrong, what they always do, what\'s wrong with them. From inside, often a way of reaching when reaching directly feels too vulnerable; the sharpness is protest dressed as attack.'},
  // Avoidance / deactivation
  {val:'shutdown',       axis:'avoidance',    label:'Went quiet',
    sub:'Stopped engaging — physically there but checked out, or fully shut down and refused to talk. From inside, often feels like there\'s no point continuing, or like the only safety is to stop participating.'},
  {val:'withdrew',       axis:'avoidance',    label:'Needed space',
    sub:'Pulled away physically or emotionally — left the room, turned away, said you were done talking. From inside, often feels like staying any longer would be too much, like distance is the only way to settle.'},
  {val:'minimized',      axis:'avoidance',    label:'Minimised it',
    sub:'Said "it\'s fine" or "doesn\'t matter" or shrugged it off, even though it wasn\'t fine. From inside, often feels easier than letting the thing be real — like if you don\'t engage with it, it can\'t really hurt or matter.'},
  // Secure / regulated
  {val:'stayed',         axis:'secure',       label:'Stayed with it',
    sub:'Tolerated the discomfort without escalating, leaving, or shutting down — kept being present even though it was hard. From inside, requires being able to feel the difficulty without needing it to stop right away.'},
  {val:'heard',          axis:'secure',       label:'Heard them out',
    sub:'Genuinely listened to what they were saying, even while disagreeing or feeling defensive. From inside, requires holding your own position loosely enough to actually take in theirs — not just waiting to speak.'},
  {val:'accountable',    axis:'secure',       label:'Took accountability',
    sub:'Owned a real part of what happened, without prompting and without immediately deflecting to what they did. From inside, requires being able to feel the discomfort of being wrong without it threatening your sense of self.'},
  {val:'reachedForRepair',axis:'secure',      label:'Reached for repair mid-conflict',
    sub:'Tried to bridge the gap during the disagreement — softened your tone, named the bond, said "I love you and I\'m frustrated." From inside, requires holding both the difficulty and the connection at the same time, instead of letting one cancel the other.'},
  // Disorganized / oscillating
  {val:'frozen',         axis:'disorganized', label:'Couldn\'t move',
    sub:'Body or mind shut down mid-conflict — went still, blank, or felt frozen in place. From inside, often feels like nothing comes — no words, no feelings, no clear direction. The system caught between fight and flight and producing neither.'},
  {val:'oppositePulls',  axis:'disorganized', label:'Wanted opposite things',
    sub:'Felt pulled in two directions at once — wanted to leave AND stay, wanted to be held AND get away, wanted to talk AND stop talking. From inside, the contradictions don\'t resolve; you can\'t pick a direction because both feel necessary and impossible.'},
  {val:'watchedOutside', axis:'disorganized', label:'Watched from outside',
    sub:'Felt detached from what was happening — observing the conflict rather than being in it, like watching a movie of yourself. From inside, often feels strange or numb; the words coming out of your mouth feel like someone else\'s.'},
];
const ATTACHMENT_AXIS_META = {
  anxiety:      {label:'Anxiety',      hint:'Hyperactivation — pulled toward maintaining contact', color:'var(--c-affection)'},
  avoidance:    {label:'Avoidance',    hint:'Deactivation — pulled toward distance or shutdown',   color:'var(--c-turndown)'},
  secure:       {label:'Secure',       hint:'Regulated engagement — stayed in the relational field', color:'var(--c-partner)'},
  disorganized: {label:'Disorganized', hint:'Oscillating, contradictory or frozen',                 color:'var(--c-wobble)'},
};
const ATTACHMENT_AXIS_ORDER = ['anxiety','avoidance','secure','disorganized'];

// ── Attachment tags (wobble / regulation) ─────────────────────────────
// Optional, multi-select cues describing the FLAVOUR of activation during
// this wobble. Same axis vocabulary as conflict tags: 'anxiety' (pulled
// toward connection/contact), 'avoidance' (pulled toward distance/shutdown),
// 'secure' (regulated). Used by the Attachment tab — never scored.
const WOBBLE_ATTACHMENT_TAGS = [
  // Anxiety / hyperactivation
  {val:'looped',       axis:'anxiety',   label:'Looped / ruminated',
    sub:'Couldn\'t stop the thought spiral — replaying, analysing, trying to figure it out from every angle. From inside, often feels like the looping is doing useful work, even though it isn\'t resolving anything; stopping feels like giving up before a solution is found.'},
  {val:'wantedReass',  axis:'anxiety',   label:'Wanted reassurance',
    sub:'Pulled toward seeking contact or comfort — texting them, looking at their photo, wanting to hear their voice. From inside, often feels like the only thing that will settle the wobble is a signal from them that the bond is okay.'},
  {val:'feltDistant',  axis:'anxiety',   label:'Felt distant',
    sub:'A closeness gap with someone became the focus of the wobble — feeling far from them, even when you were physically together. From inside, often feels like the gap is real and growing; like proximity isn\'t closeness, and you can\'t seem to bridge what feels missing.'},
  // Avoidance / deactivation
  {val:'wantedAlone',  axis:'avoidance', label:'Wanted to be alone',
    sub:'Pulled toward withdrawal — needed space, not contact. Other people felt like more, not less. From inside, often feels like solitude is the only environment in which you can settle; their presence, even loving, would be too much input right now.'},
  {val:'feltNumb',     axis:'avoidance', label:'Felt numb',
    sub:'Muted, flat, suppressed — not really feeling the wobble, not really feeling anything. From inside, often feels like the volume got turned down on everything; you know something\'s off but can\'t access what.'},
  {val:'irritatedClose', axis:'avoidance', label:'Irritated by closeness',
    sub:'Others\' presence felt grating — their breathing, their questions, their care. The closeness itself became the thing that needed to stop. From inside, often feels like a thin-skinned reactivity to anyone trying to reach you; you know it\'s not really about them, but you can\'t make it not feel personal.'},
  // Secure / regulated
  {val:'stayedGrounded',axis:'secure',   label:'Stayed grounded',
    sub:'Felt the wobble without getting pulled under — could acknowledge what was happening without it taking over. From inside, requires being able to be in the wobble without being it; staying connected to the rest of you while one part is unsteady.'},
  {val:'selfSoothed',  axis:'secure',    label:'Self-soothed',
    sub:'Used a regulation strategy and it worked — went for a walk, breathed, named what was happening, did the thing you know helps. From inside, requires the capacity to take action toward yourself, not against yourself, when you\'re not okay.'},
  {val:'reachedAndMet',axis:'secure',    label:'Reached out and was met',
    sub:'Asked for support — texted, called, sat down next to someone — and what came back actually helped you settle. From inside, requires the capacity to ask without making it more complicated than it needs to be, and to let what they offered land.'},
  // Disorganized / contradictory / dissociative
  {val:'pulledBoth',   axis:'disorganized', label:'Pulled both ways',
    sub:'Wanted closeness AND distance at the same time — wanted them to come hold you AND wanted them to leave you alone. From inside, the contradictions don\'t resolve; whichever direction you go feels wrong, and staying still feels worse.'},
  {val:'wentBlank',    axis:'disorganized', label:'Went blank',
    sub:'Couldn\'t feel into the wobble — mind went dark, no clear thought, no specific feeling. From inside, often feels like a kind of static; you know something\'s happening but can\'t locate what, and trying to find it makes it recede further.'},
  {val:'feltUnreal',   axis:'disorganized', label:'Felt unreal',
    sub:'Dissociated — like it was happening to someone else, like the room got further away, like time slipped. From inside, often feels strange and hard to describe; the world looks the same but doesn\'t feel real, or you don\'t feel real in it.'},
];

// ── Attachment tags (turn-down: partner declined you) ─────────────────
// Optional, multi-select cues describing how the turn-down LANDED for you
// in the hours/days afterward — not the moment itself, which existing
// fields cover. Used by the Attachment tab — never scored.
const TURNDOWN_PARTNER_TAGS = [
  // Anxiety / hyperactivation
  {val:'looped',         axis:'anxiety',      label:'Looped on it',
    sub:'Replayed the moment afterward — what they said, how they said it, what it might have meant. Couldn\'t quite let it close. From inside, often feels like the looping is searching for the meaning, but the meaning never quite settles, so the search keeps going.'},
  {val:'feltRejectedByThem', axis:'anxiety',  label:'Felt rejected by them',
    sub:'The no felt like it was about you, not about the moment — like they were saying something about how they feel about you, even if their words said otherwise. From inside, often feels like the personal interpretation is the truer one, no matter what reason they gave.'},
  {val:'reachedLater',   axis:'anxiety',      label:'Reached for reassurance later',
    sub:'Brought it up afterward, sought repair, asked if everything was okay — needed contact to settle the unease the no left. From inside, often feels like you can\'t quite move on until you\'ve confirmed the bond directly, even when nothing\'s actually wrong.'},
  // Avoidance / deactivation
  {val:'pulledAway',     axis:'avoidance',    label:'Pulled away',
    sub:'Created distance afterward — became cooler, less initiating, less affectionate without quite acknowledging why. From inside, often feels protective; if you\'re less invested, the next no won\'t hurt as much.'},
  {val:'shutItDown',     axis:'avoidance',    label:'Shut it down internally',
    sub:'"Fine, didn\'t want to anyway" — switched off the wanting, turned the desire off internally so the no couldn\'t hurt. From inside, often feels like a quick-acting anaesthetic; the wanting is what\'s painful, so you stop wanting.'},
  {val:'didntWantToWant',axis:'avoidance',    label:'Didn\'t want to want',
    sub:'Got mad at yourself for having needed it in the first place — turned the avoidance inward, criticised your own desire. From inside, often feels like the wanting itself was the mistake; if you hadn\'t wanted it, you wouldn\'t be in this position.'},
  // Secure / regulated
  {val:'tookCleanly',    axis:'secure',       label:'Took it cleanly',
    sub:'Felt the disappointment, named it as disappointment, didn\'t make it mean more than it was. From inside, requires the capacity to feel a wanting that didn\'t get met without that becoming a story about the relationship, you, or them.'},
  {val:'trustedTheNo',   axis:'secure',       label:'Trusted the no',
    sub:'Believed the reason they gave, didn\'t need to interrogate it for hidden meanings. From inside, requires a baseline trust that they\'re telling you the truth about what they need — and the willingness to take their word for it.'},
  // Disorganized / contradictory
  {val:'rejectedBySelf', axis:'disorganized', label:'Felt rejected by myself',
    sub:'The rejection got confused — couldn\'t tell who was doing what to whom, ended up turning it inward. From inside, often feels like you became the rejecter and rejected at once; the partner\'s no got internalised as something you did to yourself.'},
  {val:'unclearFeeling', axis:'disorganized', label:'Couldn\'t tell what I felt',
    sub:'Numb and hurt at once, or shifting through several incompatible feelings, or just not able to identify what was there. From inside, often feels like the feeling refuses to settle into one shape; trying to name it changes what it is.'},
];

// ── Attachment tags (turn-down: you declined partner) ─────────────────
// What happened in YOU afterward — the residue of having said no.
const TURNDOWN_MY_TAGS = [
  // Anxiety / hyperactivation
  {val:'worriedHurt',    axis:'anxiety',      label:'Worried I\'d hurt them',
    sub:'Replayed the no from their side — wondered how it landed, whether they took it personally, whether you damaged something. From inside, often feels like the worry is necessary care, but it can also be a way the anxious system stays tied to them through guilt.'},
  {val:'wantedRepair',   axis:'anxiety',      label:'Wanted to repair quickly',
    sub:'Pulled to follow up, smooth it over, send a sweet text — couldn\'t quite leave the moment alone. From inside, often feels like you can\'t fully relax until you\'ve confirmed the bond is intact; the unrepaired distance feels like a problem that needs solving.'},
  // Avoidance / deactivation
  {val:'reliefAtDistance',axis:'avoidance',   label:'Felt relief at the distance',
    sub:'The no created the space you wanted — and the space felt good. Not just neutral; actually relieving. From inside, often a piece of information worth noticing; relief at distance points at something the closeness was costing you.'},
  {val:'didntThink',     axis:'avoidance',    label:'Didn\'t think about it',
    sub:'Decided and moved on — didn\'t process the no, didn\'t reflect on it, didn\'t check in with yourself or them about how it landed. From inside, often feels like efficiency; the alternative is to make it complicated, and complications cost.'},
  {val:'pulledFurther',  axis:'avoidance',    label:'Pulled further away after',
    sub:'The no was the start of broader distance, not the end of a single moment — became cooler, less initiating, more separate in the days that followed. From inside, often feels like the no opened a door; once you stepped through, you didn\'t feel like coming back yet.'},
  // Secure / regulated
  {val:'feltClear',      axis:'secure',       label:'Felt clear about it',
    sub:'Honest no, no second-guessing afterward, no inner argument about whether you should have said yes. From inside, requires the capacity to make a decision and let it rest; not all of you needs to agree for the no to be valid.'},
  {val:'followedUpWarm', axis:'secure',       label:'Followed up warmly',
    sub:'Reconnected on your own terms once the moment had passed — touched their arm, made a joke, came back into closeness when you had it to give. From inside, requires holding the no AND the bond at the same time; the no didn\'t mean disconnection, just that.'},
  // Disorganized / contradictory
  {val:'reliefAndGuilt', axis:'disorganized', label:'Both relieved and guilty',
    sub:'Wanted the space AND felt bad for taking it, at the same time. From inside, the two feelings don\'t resolve into one; you can\'t enjoy the space because of the guilt, and you can\'t fully feel the guilt because of the relief.'},
  {val:'didntKnowWhy',   axis:'disorganized', label:'Didn\'t know why I said no',
    sub:'The no was reflexive — surprising even to you. Looking back, you couldn\'t locate the reason; it happened from a part of you you didn\'t have full access to. From inside, often disorienting; "I\'m not the kind of person who would say no to this, but I just did."'},
];

// ── Attachment tags (bonding) ─────────────────────────────────────────
// Optional, multi-select cues describing your INTERNAL state during the
// bonding moment — was your nervous system actually settled, or activated
// even as the moment looked good from outside? Used by the Attachment tab.
const BONDING_ATTACHMENT_TAGS = [
  // Anxiety / hyperactivation
  {val:'watchedForSigns', axis:'anxiety',      label:'Watched for signs',
    sub:'Some part of you was monitoring — checking whether they were really there with you, whether the closeness was mutual, whether anything had shifted. From inside, often feels like vigilance you can\'t quite turn off, even when nothing is wrong.'},
  {val:'worriedItEnd',    axis:'anxiety',      label:'Worried it would end',
    sub:'A quiet undercurrent of "this won\'t last" — knowing the closeness would end, sometimes already grieving it while it was happening. From inside, often feels like the present moment can\'t be received cleanly because the future loss is already pressing in.'},
  // Avoidance / deactivation
  {val:'heldBack',        axis:'avoidance',    label:'Held something back',
    sub:'Present in body and surface but kept some part of yourself protected — didn\'t fully show up, didn\'t let yourself be all the way there. From inside, often feels safer than dropping in completely; like keeping a small reserve in case the closeness needs to end suddenly.'},
  {val:'closeFeltLot',    axis:'avoidance',    label:'Closeness felt like a lot',
    sub:'The intensity of the closeness was more than felt comfortable — wanted to slow it down, create some breathing room, dial it back. From inside, often feels like being filled up too quickly; the impulse to step back isn\'t about not wanting them, it\'s about needing space to metabolise what\'s already there.'},
  // Secure / regulated
  {val:'feltSafeSeen',    axis:'secure',       label:'Felt safe being seen',
    sub:'Could show up as yourself — no performing, no managing how you came across, no part of you hiding. From inside, requires a felt sense that what they see won\'t be used against you — that you can be fully there and the bond will hold.'},
  {val:'stayedPresent',   axis:'secure',       label:'Stayed present',
    sub:'Were actually there throughout — not in your head, not running commentary, not somewhere else. From inside, requires the capacity to receive a moment without managing it; letting it land where it lands.'},
  // Disorganized / contradictory
  {val:'closeAndAfraid',  axis:'disorganized', label:'Felt close and afraid of it',
    sub:'The closeness felt good AND something in you was unsettled by it — drawn in and uneasy at the same time. From inside, often feels confusing; you can\'t tell whether to lean in or pull back, and the contradiction itself feels destabilising. Common when the people who once meant safety also caused harm.'},
];

// ── Repair entry field constants ─────────────────────────────────────
// Used by the Repair form. Repair is a standalone positive event — work
// done after a rupture to reconnect. Currently no bank impact; data is
// surfaced through the Attachment tab.
const REPAIR_INITIATED_BY = [
  {val:'me',      label:'Me',      sub:'I reached first'},
  {val:'partner', label:'Partner', sub:()=>`${P.Sub} reached first`},
  {val:'mutual',  label:'Mutual',  sub:'We found each other'},
];
const REPAIR_FORM = [
  {val:'verbal',       label:'Acknowledgment',   sub:'A brief verbal naming — "I\'m sorry," "I shouldn\'t have said that" — short and one-sided.'},
  {val:'physical',     label:'Physical',         sub:'Body-based reconnection — a hug, held hand, touch on the back, sitting close.'},
  {val:'conversation', label:'Conversation',     sub:'A sustained two-way talk that goes into what happened, both contributing.'},
  {val:'written',      label:'Written',          sub:'A text, note or letter — words the receiver can take in on their own time.'},
  {val:'spaceReturn',  label:'Time then return', sub:'Took space to settle, then came back — the regulated re-engagement was itself the bridge.'},
  {val:'action',       label:'Action',           sub:'A behaviour that signalled repair without naming it — the doing was the apology.'},
  {val:'humor',        label:'Humor',            sub:'Lightness as a bridge — a shared laugh that re-established the bond.'},
];
const REPAIR_RECEPTION = [
  {val:'accepted',  label:'Accepted',     sub:'Met openly — the bridge held'},
  {val:'halfway',   label:'Met halfway',  sub:'Some opening, not fully there yet'},
  {val:'postponed', label:'Postponed',    sub:'Not now, but not no — asked to come back to it later'},
  {val:'deflected', label:'Deflected',    sub:'Turned aside — surface only, no real meeting'},
  {val:'refused',   label:'Refused',      sub:'Bridge declined — no opening'},
];
const REPAIR_AFTERMATH = [
  {val:'breakthrough', label:'Breakthrough', sub:'New understanding emerged — left closer than before the rupture'},
  {val:'closer',       label:'Closer',       sub:'Felt closer than before — the rupture became something'},
  {val:'baseline',     label:'Baseline',     sub:'Back to where things were — neutral, restored'},
  {val:'residue',      label:'Some residue', sub:'Mostly settled but something still lingers'},
  {val:'worse',        label:'Worse',        sub:'Repair attempt left it worse than before'},
];

// ── Attachment tags (repair) ─────────────────────────────────────────
// Optional, multi-select cues describing your INTERNAL posture during
// the repair itself — was it offered/received from a regulated place,
// or from anxiety/avoidance/disorganization. Used by the Attachment tab.
const REPAIR_ATTACHMENT_TAGS = [
  // Anxiety / hyperactivation
  {val:'reachedAnxiously',  axis:'anxiety',      label:'Reached anxiously',
    sub:'The repair came from urgent need rather than regulated reflection — couldn\'t wait for clarity, couldn\'t sit with the distance any longer. From inside, often feels like the discomfort of the unrepaired state is unbearable; reaching is what stops the feeling, not what addresses what happened.'},
  {val:'overExplained',     axis:'anxiety',      label:'Over-explained',
    sub:'Said too much — apologised too many times, justified too thoroughly, couldn\'t let your point sit. From inside, often feels like you have to keep speaking until they signal that it\'s enough; one apology never quite feels sufficient on its own.'},
  // Avoidance / deactivation
  {val:'glossedOver',       axis:'avoidance',    label:'Glossed over the substance',
    sub:'Surface peace without naming what actually happened — moved past the rupture without metabolising it, made things smooth without making them honest. From inside, often feels easier than naming the hard thing; if it doesn\'t get said out loud, maybe it can be left behind.'},
  {val:'wantedQuickMove',   axis:'avoidance',    label:'Wanted to move on quickly',
    sub:'Eager to be done with the discomfort — pushed through the repair fast, didn\'t linger in the difficult feelings. From inside, often feels like staying in the repair longer would just prolong something painful; getting out is the goal.'},
  // Secure / regulated
  {val:'stayedWithIt',      axis:'secure',       label:'Stayed with what happened',
    sub:'Actually metabolised the rupture — sat with the discomfort, let the conversation be hard, didn\'t rush to the resolution. From inside, requires the capacity to be in something difficult without needing it to stop right away; trusting that the repair will arrive when it\'s real.'},
  {val:'tookAccountability',axis:'secure',       label:'Took genuine accountability',
    sub:'Owned a real part of what happened without deflecting, without immediately balancing it with their part, without making your apology contingent on theirs. From inside, requires being able to feel the discomfort of being wrong without it threatening your sense of self.'},
  {val:'didntNeedToBeRight',axis:'secure',       label:'Repaired without needing to be right',
    sub:'Engaged in the repair while letting go of the meta-argument about whose version of events was correct. The bond mattered more than the agreement on what happened. From inside, requires the capacity to differentiate without rupture — knowing your own truth and reaching across anyway, without requiring them to validate it first.'},
  // Disorganized / contradictory
  {val:'repairedAndResented',axis:'disorganized', label:'Repaired and resented it',
    sub:'Offered the repair while feeling forced into it — gave and seethed at the same time. The words came out warm, the chest stayed cold. From inside, often feels like a kind of double bind; the repair is both genuine and not, and you can\'t cleanly call it either one.'},
  {val:'unsureIfReal',      axis:'disorganized', label:'Couldn\'t tell if it was real',
    sub:'Said the words, did the act, completed the form of repair — but couldn\'t feel whether it actually landed in you. From inside, often feels strange; you know the repair happened by external markers, but the internal sensation of reconnection is missing or unclear.'},
];

const TURNDOWN_TYPES = [
  {val:'interrupted',  label:'Timing',       sub:()=>`Genuine external cause — not ${P.pos} choice`},
  {val:'acknowledged', label:'Warm no',      sub:()=>`${P.Sub} saw it, declined warmly, offered understanding`},
  {val:'absent',       label:'Absent',       sub:()=>`${P.Sub} was emotionally elsewhere — disconnected`},
  {val:'declined',     label:'Declined',     sub:'Clear no, no warmth or explanation'},
  {val:'dismissive',   label:'Cold',         sub:()=>`Brushed off, minimised, or redirected without care`},
];
const TURNDOWN_SIGNIFICANCE = [
  {val:1, label:'Fleeting',  sub:'Low investment, casual desire'},
  {val:2, label:'Mild hope',        sub:'Some anticipation, easily let go'},
  {val:3, label:'Desired',   sub:'Real investment in the moment'},
  {val:4, label:'Strong',      sub:'Significant emotional energy invested'},
  {val:5, label:'Deep',     sub:'Highly invested, meant a lot'},
];
const TURNDOWN_IMPACT = [
  {val:1, label:'Barely', sub:'Little effect on sense of being desired'},
  {val:2, label:'Mild',        sub:'Small dent, faded quickly'},
  {val:3, label:'Notable',        sub:'Tangible effect on feeling wanted'},
  {val:4, label:'Cut deep',          sub:'Real impact on sense of being desired'},
  {val:5, label:'Deep',   sub:'Significant damage to feeling wanted and valued'},
];
// Significance and how-it-happened — both on 0.20→1.00 scale
const TD_SIG_M = {1:0.20, 2:0.40, 3:0.60, 4:0.80, 5:1.00};
const TD_HOW_M = {interrupted:0.20, acknowledged:0.40, absent:0.60, declined:0.80, dismissive:1.00};

// How I turned her down — same values as TURNDOWN_TYPES but from my perspective as decliner
const TD_MY_HOW = [
  {val:'acknowledged', label:'Acknowledged', sub:()=>`I saw ${P.pos} need, declined warmly and explained`},
  {val:'interrupted',  label:'Redirected',   sub:'I deflected to something else — timing or circumstances'},
  {val:'declined',     label:'Declined',     sub:'Clear no, without warmth or explanation'},
  {val:'dismissive',   label:'Dismissive',   sub:'I brushed it off, minimised, or redirected without care'},
  {val:'absent',       label:'Absent',       sub:()=>`I was emotionally elsewhere — ${P.sub} may not have felt seen`},
];

// Reasons I turned her down — diagnostic, not scored
const TD_MY_REASONS = [
  {val:'depleted',     label:'Depleted',           sub:'Tank is empty — physically or emotionally spent, nothing left to give'},
  {val:'disconnected', label:'Disconnected',       sub:'Not tired, no tension — just flat. Parallel lives, not present with each other'},
  {val:'unavailable',  label:'Unavailable',        sub:'External circumstance — tired, unwell, distracted. Nothing relational'},
  {val:'protective',   label:'Needed space',       sub:'Feeling crowded or consumed — needed room to breathe and be myself'},
  {val:'tension',      label:'Unresolved tension',  sub:'Something unspoken between us — residue, distance, or coolness'},
];

/* ── Bank scoring constants (single source of truth) ── */
const CARETAKER_SCALES = {
  ctPhysical:      ['None','Minimal','Moderate','Draining','Exhausting'],
  ctEmotional:     ['None','Mild','Moderate','Heavy','Severe'],
  ctCognitive:     ['None','Minimal','Moderate','Demanding','Intense'],
  ctTime:          ['Minutes','Less than an hour','About an hour','Couple hours','Many hours'],
  ctPredictability:['Always predictable','Usually','Sometimes','Rarely','Never predictable'],
};
const CARETAKER_LABELS = {
  ctPhysical:      'Physical energy cost',
  ctEmotional:     'Emotional energy cost',
  ctCognitive:     'Cognitive demand',
  ctTime:          'Typical duration',
  ctPredictability:'Predictability',
};
const CARETAKER_HINTS = {
  ctPhysical:      'How physically draining is this type of steadying?',
  ctEmotional:     'How much does it cost you emotionally?',
  ctCognitive:     'How much active thinking, holding and managing does it require?',
  ctTime:          'How long do these episodes typically run?',
  ctPredictability:'How often does this arrive without warning?',
};

const CARETAKER_OUTCOME = [
  {val:5, label:'Repaired', sub:'Significant positive shift — cost offset, possible net gain',  m:0.20},
  {val:4, label:'Resolved',     sub:'Clear resolution, regulated and settled — cost reduced',        m:0.40},
  {val:3, label:'Partial',      sub:'Some settling but incomplete — score as-is',                    m:0.60},
  {val:2, label:'Open',   sub:'No resolution, pattern likely to return — minor extra cost',    m:0.80},
  {val:1, label:'Worsened',     sub:()=>`Escalated or left ${P.obj} more dysregulated — cost increased`, m:1.00},
];

const STEADYING_INTENSITY = [
  {val:1, label:'Present',    sub:'Just showing up — calm presence, low demand'},
  {val:2, label:'Engaged',    sub:'Active listening, some emotional effort'},
  {val:3, label:'Support', sub:'Actively holding space, moderate emotional load'},
  {val:4, label:'Intensive',  sub:'Deep emotional labour, significant drain'},
  {val:5, label:'Crisis',     sub:'Full presence through acute distress — everything in'},
];
const STEAD_INTENSITY_M = {1:0.20, 2:0.40, 3:0.60, 4:0.80, 5:1.00};

const BANK_OUTCOME_M = {1:0.20, 2:0.40, 3:0.60, 4:0.80, 5:1.00};

// Caretaker scoring constants
// Time and drain each have a multiplier (M); time = 1/3 weight, drain = 2/3 weight
const PHYS_SCALES = {
  physIntentionality: ['Trivial','Low','Moderate','High','Significant'],
  physEnergy:         ['Minimal','Under 1 hour','1–2 hours','2–4 hours','4+ hours'],
  physDesire:         ['None','Low','Moderate','High','Significant'],
  physNovelty:        ['None','Low','Moderate','High','Significant'],
  physSetting:        ['None','Low','Moderate','High','Significant'],
};

const PHYS_LABELS = {
  physIntentionality: 'Effort',
  physEnergy:         'Time investment',
  physDesire:         'Emotional safety & comfort',
  physNovelty:        'Meaningfulness & connection',
  physSetting:        'Mutual responsiveness & presence',
};

const PHYS_HINTS = {
  physIntentionality: 'How much personal effort — emotional, physical, or logistical preparation — was anticipated or required from your partner.',
  physEnergy:         'How much time including buildup, duration, and wind down was anticipated or required.',
  physDesire:         'To what degree did you anticipate or experience a sense of emotional safety, trust, and freedom from pressure or judgement.',
  physNovelty:        'How personally meaningful or relationally connective did you anticipate or experience this to be — beyond just a physical release.',
  physSetting:        'How much focused mutual responsiveness, attunement, and presence from both partners was anticipated or required.',
};


const PHYSICAL_INTENSITY = [
  {val:1, label:'Detached',     desc:'Going through the motions'},
  {val:2, label:'Low',          desc:'Below average connection or energy'},
  {val:3, label:'Good',         desc:'Present, connected, satisfying'},
  {val:4, label:'Very good',    desc:'Dynamic, fun, fulfilling'},
  {val:5, label:'Fantastic',    desc:'Deeply connected, memorable'},
];

const DEFAULT_CHALLENGING_EMOTION_TAGS = [
  'Angry','Frustrated','Anxious','Apprehensive','Lonely','Disappointed','Ashamed','Embarrassed','Numb','Exhausted','Overwhelmed','Agitated','Run-down','Sleep-deprived'
];

const SAMPLE_PHYSICAL_TYPES = [
  {name:'Morning in Bed', description:'Slow morning, no alarms, nowhere to be',
   defaultSolo:false, physIntentionality:2, physEnergy:2, physDesire:4, physNovelty:2, physSetting:3,
   needsMap:{sexual:4,attraction:3,recreation:2,admiration:1,domestic:1,conversation:2,honesty:1,financial:1,family:1,affection:4}},
];
const SAMPLE_AFFECTION_TYPES = [
  {name:'Netflix Movie Night', description:'Pick a good romcom, get popcorn and cuddle on the couch',
   descEffort:1, descTime:3, descFinancial:1, descRarity:2, descPresence:2,
   needsMap:{sexual:1,recreation:3,affection:3,conversation:2,honesty:1,admiration:1,financial:1,domestic:2,family:1,attraction:1}},
  {name:'Ballard Farmers Market', description:'Drive to Ballard, browse the market, pat the dogs, grab lunch together',
   descEffort:2, descTime:4, descFinancial:2, descRarity:3, descPresence:3,
   needsMap:{sexual:1,recreation:4,affection:2,conversation:3,honesty:1,admiration:1,financial:2,domestic:2,family:1,attraction:2}},
  {name:'Picnic Dog Beach', description:'Pack a picnic, head to the beach with the dogs, eat outside, get wet and meet new dogs',
   descEffort:3, descTime:4, descFinancial:2, descRarity:3, descPresence:3,
   needsMap:{sexual:1,recreation:5,affection:2,conversation:3,honesty:1,admiration:1,financial:1,domestic:2,family:3,attraction:2}},
  {name:'Skein & Tipple', description:'Cocktails at the speakeasy, live music, friends and conversation',
   descEffort:2, descTime:4, descFinancial:3, descRarity:4, descPresence:4,
   needsMap:{sexual:1,recreation:5,affection:2,conversation:4,honesty:3,admiration:3,financial:3,domestic:1,family:1,attraction:4}},
];
const SAMPLE_RESTORE_TYPES = [
  {name:'Yoga', description:'Mat down, move slow, breathe it out',
   descEffort:2, descTime:2, descFinancial:1, descRarity:1,
   needsMap:{sexual:1,recreation:1,affection:1,conversation:1,honesty:1,admiration:1,financial:1,domestic:1,family:1,attraction:1,autonomy:4,belonging:1,challenge:1,competition:1,competence:2,escape:4,flow:4,identity:3,nature:1,sensory:3}},
  {name:'Sailing (practice)', description:'Practice sailing — upwind, downwind, starts and practice races',
   descEffort:5, descTime:4, descFinancial:3, descRarity:4,
   needsMap:{sexual:1,recreation:1,affection:1,conversation:1,honesty:1,admiration:1,financial:1,domestic:1,family:1,attraction:1,autonomy:4,belonging:3,challenge:5,competition:4,competence:5,escape:4,flow:3,identity:3,nature:5,sensory:1}},
  {name:'Writing (book)', description:'Working on the book — drafting, editing, finding the thread',
   descEffort:4, descTime:3, descFinancial:1, descRarity:1,
   needsMap:{sexual:1,recreation:1,affection:1,conversation:1,honesty:1,admiration:1,financial:1,domestic:1,family:1,attraction:1,autonomy:4,belonging:1,challenge:3,competition:1,competence:4,escape:3,flow:5,identity:5,nature:1,sensory:1}},
];
const CONNECTION_QUALITY = [
  {val:1, label:'Missed',     sub:'Present but no real connection — it just didn\'t happen'},
  {val:2, label:'Routine',   sub:'Present and caring but habitual, no real connection'},
  {val:3, label:'Warm',      sub:'Noticeably more present than routine'},
  {val:4, label:'Deep',       sub:'Genuinely present, warmth felt mutual — real connection'},
  {val:5, label:'Peak',      sub:'Deep closeness — a moment that stayed with you'},
];

// Social-specific quality scale — friend/family/community oriented. Phrased
// to cover activity-based connection (games, hikes, watching something) as
// well as conversation. Same scoring multipliers as CONNECTION_QUALITY (via
// BANK_OUTCOME_M); only the user-facing labels and copy differ.
const SOCIAL_QUALITY = [
  {val:1, label:'Surface',    sub:'Bodies in the same room, attention elsewhere'},
  {val:2, label:'Pleasant',   sub:'Easy company — going through the motions together'},
  {val:3, label:'Engaged',    sub:'Actually present — talking, playing, or in something together'},
  {val:4, label:'Real',       sub:'Genuine connection — laughing, into it, or saying real things'},
  {val:5, label:'Memorable',  sub:'A standout moment that stayed with you'},
];
const CONFLICT_RESOLUTION = [
  {val:'breakthrough',label:'Repaired',sub:'Genuine insight emerged — left closer than before the conflict',mult:0.20},
  {val:'resolved',    label:'Resolved',    sub:'Clear repair, restored sense of safety',                        mult:0.40},
  {val:'partial',     label:'Partial',     sub:'Some acknowledgment, but incomplete',                           mult:0.60},
  {val:'unresolved',  label:'Open',  sub:'No repair, lingering discomfort',                               mult:0.80},
  {val:'worsened',    label:'Worsened',    sub:'Escalation or additional hurt',                                 mult:1.00},
];
const EMOTION_TONES = [
  { val:'fear',       label:'Fear',       color:'var(--c-wobble)',   desc:'Perceived threat, anticipating harm',
    tags:['Anxious','Apprehensive','Nervous','Worried','Dread','Vigilant','Jumpy','Panicked','Terrified','Scared','Uneasy','Alarmed'] },
  { val:'anger',      label:'Anger',      color:'var(--c-conflict)', desc:'Boundary violation, blocked goal, injustice',
    tags:['Angry','Frustrated','Irritated','Annoyed','Resentful','Bitter','Contemptuous','Enraged','Furious','Indignant','Exasperated','Hostile'] },
  { val:'sadness',    label:'Sadness',    color:'#7ba8c4',           desc:'Loss, disappointment, unmet longing',
    tags:['Lonely','Disappointed','Melancholy','Discouraged','Hopeless','Despairing','Grieving','Heartbroken','Wistful','Sorrowful','Forlorn','Bereft'] },
  { val:'shame',      label:'Shame',      color:'#b87ba8',           desc:'Self-evaluation as flawed or unworthy',
    tags:['Ashamed','Embarrassed','Humiliated','Guilty','Exposed','Inadequate','Self-loathing','Mortified','Regretful','Defective','Worthless','Small'] },
  { val:'shutdown',   label:'Shutdown',   color:'var(--muted)',      desc:'Dorsal vagal collapse, disconnection',
    tags:['Numb','Exhausted','Dissociated','Depleted','Frozen','Disconnected','Empty','Foggy','Detached','Withdrawn','Collapsed','Absent'] },
  { val:'activation', label:'Activation', color:'var(--c-restore)',  desc:'Sympathetic mobilization, scattered energy',
    tags:['Overwhelmed','Agitated','Restless','Scattered','Frantic','Wired','Keyed-up','Racing','Buzzing','Frenzied','Spinning','Ungrounded'] },
  { val:'body',       label:'Body',       color:'#a88f6b',           desc:'Lingering physical or circumstantial states that drag your mood — illness, poor sleep, pain',
    tags:['Allergies','Digestive','Headache','Hormonal','Inflamed','Pain','Run-down','Sick','Sleep-deprived'] },
];
// Full preset lists per family — polyvagal state per tag.
// Used by the "Pre-fill" button in the library to bulk-add a family's tags.
const EMOTION_TONE_PRESETS = {
  shame: [
    {tag:'Ashamed',      pv:'mixed',      starred:true},
    {tag:'Embarrassed',  pv:'mixed',      starred:true},
    {tag:'Humiliated',   pv:'mixed'},
    {tag:'Guilty',       pv:'mixed'},
    {tag:'Exposed',      pv:'activated'},
    {tag:'Inadequate',   pv:'withdrawal'},
    {tag:'Self-loathing',pv:'mixed'},
    {tag:'Mortified',    pv:'mixed'},
    {tag:'Regretful',    pv:'mixed'},
    {tag:'Defective',    pv:'withdrawal'},
    {tag:'Worthless',    pv:'withdrawal'},
    {tag:'Small',        pv:'withdrawal'},
  ],
  shutdown: [
    {tag:'Numb',         pv:'withdrawal', starred:true},
    {tag:'Exhausted',    pv:'withdrawal', starred:true},
    {tag:'Dissociated',  pv:'withdrawal'},
    {tag:'Depleted',     pv:'withdrawal'},
    {tag:'Frozen',       pv:'withdrawal'},
    {tag:'Disconnected', pv:'withdrawal'},
    {tag:'Empty',        pv:'withdrawal'},
    {tag:'Foggy',        pv:'withdrawal'},
    {tag:'Detached',     pv:'withdrawal'},
    {tag:'Withdrawn',    pv:'withdrawal'},
    {tag:'Collapsed',    pv:'withdrawal'},
    {tag:'Absent',       pv:'withdrawal'},
  ],
  activation: [
    {tag:'Overwhelmed',  pv:'activated',  starred:true},
    {tag:'Agitated',     pv:'activated',  starred:true},
    {tag:'Restless',     pv:'activated'},
    {tag:'Scattered',    pv:'activated'},
    {tag:'Frantic',      pv:'activated'},
    {tag:'Wired',        pv:'activated'},
    {tag:'Keyed-up',     pv:'activated'},
    {tag:'Racing',       pv:'activated'},
    {tag:'Buzzing',      pv:'activated'},
    {tag:'Frenzied',     pv:'activated'},
    {tag:'Spinning',     pv:'activated'},
    {tag:'Ungrounded',   pv:'activated'},
  ],
  sadness: [
    {tag:'Lonely',      pv:'mixed',      starred:true},
    {tag:'Disappointed',pv:'mixed',      starred:true},
    {tag:'Melancholy',  pv:'withdrawal'},
    {tag:'Discouraged', pv:'withdrawal'},
    {tag:'Hopeless',    pv:'withdrawal'},
    {tag:'Despairing',  pv:'withdrawal'},
    {tag:'Grieving',    pv:'mixed'},
    {tag:'Heartbroken', pv:'mixed'},
    {tag:'Wistful',     pv:'mixed'},
    {tag:'Sorrowful',   pv:'mixed'},
    {tag:'Forlorn',     pv:'withdrawal'},
    {tag:'Bereft',      pv:'withdrawal'},
  ],
  anger: [
    {tag:'Angry',       pv:'activated', starred:true},
    {tag:'Frustrated',  pv:'activated', starred:true},
    {tag:'Irritated',   pv:'activated'},
    {tag:'Annoyed',     pv:'activated'},
    {tag:'Resentful',   pv:'mixed'},
    {tag:'Bitter',      pv:'mixed'},
    {tag:'Contemptuous',pv:'activated'},
    {tag:'Enraged',     pv:'activated'},
    {tag:'Furious',     pv:'activated'},
    {tag:'Indignant',   pv:'activated'},
    {tag:'Exasperated', pv:'activated'},
    {tag:'Hostile',     pv:'activated'},
  ],
  fear: [
    {tag:'Anxious',      pv:'activated', starred:true},
    {tag:'Apprehensive', pv:'activated', starred:true},
    {tag:'Nervous',      pv:'activated'},
    {tag:'Worried',      pv:'activated'},
    {tag:'Dread',        pv:'mixed'},
    {tag:'Vigilant',     pv:'activated'},
    {tag:'Jumpy',        pv:'activated'},
    {tag:'Panicked',     pv:'activated'},
    {tag:'Terrified',    pv:'activated'},
    {tag:'Scared',       pv:'activated'},
    {tag:'Uneasy',       pv:'activated'},
    {tag:'Alarmed',      pv:'activated'},
  ],
  body: [
    {tag:'Allergies',     pv:'mixed'},
    {tag:'Digestive',     pv:'mixed'},
    {tag:'Headache',      pv:'mixed'},
    {tag:'Hormonal',      pv:'mixed'},
    {tag:'Inflamed',      pv:'mixed'},
    {tag:'Pain',          pv:'mixed'},
    {tag:'Run-down',      pv:'withdrawal', starred:true},
    {tag:'Sick',          pv:'withdrawal'},
    {tag:'Sleep-deprived',pv:'withdrawal', starred:true},
  ],
};
// Maps individual tags to their emotion family val. Covers all canonical tags;
// user-added tags that don't appear here fall into "Other" in the library view.
const TAG_TO_EMOTION_TONE = {
  // Fear family
  'Anxiety':'fear','Fear':'fear','Apprehension':'fear',
  'Anxious':'fear','Apprehensive':'fear','Nervous':'fear','Worried':'fear','Dread':'fear',
  'Vigilant':'fear','Jumpy':'fear','Panicked':'fear','Terrified':'fear','Scared':'fear',
  'Uneasy':'fear','Alarmed':'fear',
  // Anger family
  'Anger':'anger',
  'Angry':'anger','Frustrated':'anger','Irritated':'anger','Annoyed':'anger','Resentful':'anger',
  'Bitter':'anger','Contemptuous':'anger','Enraged':'anger','Furious':'anger','Indignant':'anger',
  'Exasperated':'anger','Hostile':'anger',
  // Sadness family
  'Despair':'sadness','Grief':'sadness','Low mood':'sadness',
  'Lonely':'sadness','Disappointed':'sadness','Melancholy':'sadness','Discouraged':'sadness',
  'Hopeless':'sadness','Despairing':'sadness','Grieving':'sadness','Heartbroken':'sadness',
  'Wistful':'sadness','Sorrowful':'sadness','Forlorn':'sadness','Bereft':'sadness',
  // Shame family
  'Guilt':'shame','Shame':'shame',
  'Ashamed':'shame','Embarrassed':'shame','Humiliated':'shame','Guilty':'shame','Exposed':'shame',
  'Inadequate':'shame','Self-loathing':'shame','Mortified':'shame','Regretful':'shame',
  'Defective':'shame','Worthless':'shame','Small':'shame',
  // Shutdown family
  'Fatigue':'shutdown','Withdrawal':'shutdown',
  'Numb':'shutdown','Exhausted':'shutdown','Dissociated':'shutdown','Depleted':'shutdown',
  'Frozen':'shutdown','Disconnected':'shutdown','Empty':'shutdown','Foggy':'shutdown',
  'Detached':'shutdown','Withdrawn':'shutdown','Collapsed':'shutdown','Absent':'shutdown',
  // Activation family
  'Overwhelmed':'activation',
  'Agitated':'activation','Restless':'activation','Scattered':'activation','Frantic':'activation',
  'Wired':'activation','Keyed-up':'activation','Racing':'activation','Buzzing':'activation',
  'Frenzied':'activation','Spinning':'activation','Ungrounded':'activation',
  // Body family — the curated preset is in EMOTION_TONE_PRESETS.body, but
  // this map also includes earlier/legacy/common tags so they categorise
  // correctly if a user has them on the list.
  'Allergies':'body','Digestive':'body','Headache':'body','Hormonal':'body','Inflamed':'body',
  'Pain':'body','Run-down':'body','Sick':'body','Sleep-deprived':'body',
  'Achy':'body','In pain':'body','Nauseous':'body','Jet-lagged':'body','Hungover':'body',
  'Hangry':'body','Sore':'body','Dehydrated':'body','Overheated':'body','Sluggish':'body',
  'Ill':'body','Drained':'body','Heavy':'body','Bloated':'body',
};
// Polyvagal state mapping for challenging emotion tags.
// Covers all canonical tags; user-added tags default to 'mixed'.
const TAG_TO_POLYVAGAL = {
  // Legacy broad tags
  'Anger':'activated','Anxiety':'activated','Fear':'activated','Apprehension':'activated','Overwhelmed':'activated',
  'Despair':'withdrawal','Fatigue':'withdrawal','Low mood':'withdrawal','Withdrawal':'withdrawal',
  'Grief':'mixed','Guilt':'mixed','Shame':'mixed',
  // Fear family
  'Anxious':'activated','Apprehensive':'activated','Nervous':'activated','Worried':'activated',
  'Dread':'mixed','Vigilant':'activated','Jumpy':'activated','Panicked':'activated',
  'Terrified':'activated','Scared':'activated','Uneasy':'activated','Alarmed':'activated',
  // Anger family
  'Angry':'activated','Frustrated':'activated','Irritated':'activated','Annoyed':'activated',
  'Resentful':'mixed','Bitter':'mixed','Contemptuous':'activated','Enraged':'activated',
  'Furious':'activated','Indignant':'activated','Exasperated':'activated','Hostile':'activated',
  // Sadness family
  'Lonely':'mixed','Disappointed':'mixed','Melancholy':'withdrawal','Discouraged':'withdrawal',
  'Hopeless':'withdrawal','Despairing':'withdrawal','Grieving':'mixed','Heartbroken':'mixed',
  'Wistful':'mixed','Sorrowful':'mixed','Forlorn':'withdrawal','Bereft':'withdrawal',
  // Shame family
  'Ashamed':'mixed','Embarrassed':'mixed','Humiliated':'mixed','Guilty':'mixed','Exposed':'activated',
  'Inadequate':'withdrawal','Self-loathing':'mixed','Mortified':'mixed','Regretful':'mixed',
  'Defective':'withdrawal','Worthless':'withdrawal','Small':'withdrawal',
  // Shutdown family
  'Numb':'withdrawal','Exhausted':'withdrawal','Dissociated':'withdrawal','Depleted':'withdrawal',
  'Frozen':'withdrawal','Disconnected':'withdrawal','Empty':'withdrawal','Foggy':'withdrawal',
  'Detached':'withdrawal','Withdrawn':'withdrawal','Collapsed':'withdrawal','Absent':'withdrawal',
  // Activation family
  'Agitated':'activated','Restless':'activated','Scattered':'activated','Frantic':'activated',
  'Wired':'activated','Keyed-up':'activated','Racing':'activated','Buzzing':'activated',
  'Frenzied':'activated','Spinning':'activated','Ungrounded':'activated',
  // Body family (curated + legacy)
  'Allergies':'mixed','Digestive':'mixed','Headache':'mixed','Hormonal':'mixed',
  'Inflamed':'mixed','Pain':'mixed','Run-down':'withdrawal','Sick':'withdrawal',
  'Sleep-deprived':'withdrawal',
  'Achy':'mixed','In pain':'mixed','Nauseous':'mixed','Jet-lagged':'withdrawal',
  'Hungover':'withdrawal','Hangry':'activated','Sore':'mixed','Dehydrated':'mixed',
  'Overheated':'activated','Sluggish':'withdrawal','Ill':'withdrawal',
  'Drained':'withdrawal','Heavy':'withdrawal','Bloated':'mixed',
};
function tagToPolyvagal(tag) {
  if (S.tagPolyvagalOverrides && S.tagPolyvagalOverrides[tag]) return S.tagPolyvagalOverrides[tag];
  return TAG_TO_POLYVAGAL[tag] || 'mixed';
}
// Classify a wobble entry to its dominant polyvagal state
function entryPolyvagalState(e) {
  if (e.polyvagalState) return e.polyvagalState;
  const tags = Array.isArray(e.regulationEmotions) ? e.regulationEmotions : [];
  if (tags.length === 0) return 'mixed';
  const c = { activated: 0, withdrawal: 0, mixed: 0 };
  for (const t of tags) c[tagToPolyvagal(t)]++;
  return Object.entries(c).sort((a,b) => b[1]-a[1])[0][0];
}
// Dominant tone val for a wobble entry — null if no tags map to a known tone
function entryDominantTone(e) {
  const tags = Array.isArray(e.regulationEmotions) ? e.regulationEmotions : [];
  if (tags.length === 0) return null;
  const c = {};
  for (const t of tags) {
    const tv = (S.tagToneOverrides && S.tagToneOverrides[t]) || TAG_TO_EMOTION_TONE[t] || null;
    if (tv) c[tv] = (c[tv]||0) + 1;
  }
  const top = Object.entries(c).sort((a,b) => b[1]-a[1])[0];
  return top ? top[0] : null;
}

const CONFLICT_HORSEMEN = [
  { val:'criticism',     label:'Criticism',     desc:'Attacking character, not behavior' },
  { val:'contempt',      label:'Contempt',      desc:'Mockery, dismissal, superiority' },
  { val:'defensiveness', label:'Defensiveness', desc:'Counter-complaint instead of accountability' },
  { val:'stonewalling',  label:'Stonewalling',  desc:'Shutting down, going silent' },
];
const HORSEMEN_ANTIDOTE = {
  criticism:     'Try raising concerns as "I feel X when Y" — naming your feeling, not their flaw.',
  contempt:      'Even one repair attempt can shift the cycle. Contempt usually signals unheard needs.',
  defensiveness: 'Before defending, try finding what\'s valid in the complaint — even a small part.',
  stonewalling:  'A 20-minute physiological break before continuing helps both nervous systems settle.',
};

const RESTORE_IMMERSION = [
  {val:1, label:'Dipped',      sub:'Brief, low effort — barely touched it',              mult:0.20},
  {val:2, label:'Light',       sub:'Present but limited time or energy',                  mult:0.40},
  {val:3, label:'Engaged',     sub:'Real time and effort — properly into it',             mult:0.60},
  {val:4, label:'Deep',        sub:'Sustained, high energy, fully committed',             mult:0.80},
  {val:5, label:'Full',        sub:'Everything you had — extended, completely in it',     mult:1.00},
];
const RESTORE_QUALITY = [
  {val:1, label:'None',        sub:'No restoration — went through the motions',    mult:0.20},
  {val:2, label:'A little',    sub:'Slight uplift, barely noticeable',             mult:0.40},
  {val:3, label:'Some',        sub:'Partial recharge — some benefit, not full',    mult:0.60},
  {val:4, label:'Well',        sub:'Genuinely restored, noticeably recharged',      mult:0.80},
  {val:5, label:'Fully',       sub:'Completely recharged — tank full',             mult:1.00},
];
// Migrate old 3-tier restore quality (1=Light, 2=Good, 3=Excellent) to new 5-tier scale.
const RESTORE_NONE_TYPE = 'none';
const RESTORE_OBSTACLES = [
  {val:'fatigue',       label:'Fatigue',                    sub:'Too tired to engage'},
  {val:'emotional',     label:'Emotional drain',            sub:'Mentally or emotionally depleted'},
  {val:'time',          label:'Time constraint',            sub:'No time available'},
  {val:'interrupted',   label:'External interruption',      sub:'Something got in the way'},
  {val:'motivation',    label:'Motivation / mental resistance', sub:'Couldn\'t get started'},
  {val:'physical',      label:'Physical discomfort',        sub:'Unwell or physically off'},
  {val:'other',         label:'Other',                      sub:'Something else'},
];
const SOLO_CONTEXT = [
  {val:'anticipation', label:'Anticipation abandoned',   sub:'Was expecting shared intimacy, it didn\'t happen'},
  {val:'missed',       label:'Shared opportunity missed', sub:'Desire present, circumstances prevented it'},
  {val:'postturndown', label:'Post-turndown coping',     sub:'Directly following a turn-down'},
  {val:'stress',       label:'Stress relief',            sub:'Decompression, personal tension'},
  {val:'autonomous',   label:'Autonomous / habitual',    sub:'Independent of relationship context'},
];

const DEFAULT_CARETAKER_TYPES = [
  {
    name: 'Reassuring repeatedly',
    description: 'Giving the same validation multiple times as the loop keeps returning.',
    ctPhysical: 1, ctEmotional: 2, ctCognitive: 2, ctTime: 2, ctPredictability: 1,
    needsMap: {sexual:1,recreation:1,affection:2,conversation:4,honesty:3,admiration:1,financial:1,domestic:1,family:1,attraction:1},
    subtypes: [],
  },
  {
    name: 'Co-regulating',
    description: 'Being the steady presence whose nervous system borrows stability from.',
    ctPhysical: 1, ctEmotional: 3, ctCognitive: 2, ctTime: 2, ctPredictability: 2,
    needsMap: {sexual:1,recreation:1,affection:3,conversation:3,honesty:2,admiration:1,financial:1,domestic:1,family:1,attraction:1},
    subtypes: [],
  },
  {
    name: 'Grounding',
    description: 'Helping them return to the present when pulled into the past.',
    ctPhysical: 2, ctEmotional: 3, ctCognitive: 3, ctTime: 2, ctPredictability: 2,
    needsMap: {sexual:1,recreation:1,affection:3,conversation:4,honesty:3,admiration:1,financial:1,domestic:1,family:1,attraction:1},
    subtypes: [],
  },
  {
    name: 'Supporting through crisis',
    description: 'Actively present through acute distress — they need more than just presence.',
    ctPhysical: 2, ctEmotional: 5, ctCognitive: 4, ctTime: 4, ctPredictability: 3,
    needsMap: {sexual:1,recreation:1,affection:4,conversation:5,honesty:4,admiration:1,financial:1,domestic:1,family:2,attraction:1},
    subtypes: [],
  },
  {
    name: 'Processing together',
    description: 'Active reframes, meaning-making, helping them understand what happened.',
    ctPhysical: 1, ctEmotional: 4, ctCognitive: 4, ctTime: 3, ctPredictability: 2,
    needsMap: {sexual:1,recreation:1,affection:3,conversation:5,honesty:4,admiration:1,financial:1,domestic:1,family:1,attraction:1},
    subtypes: [],
  },
  {
    name: 'Repairing rupture',
    description: "Partner's withdrawn or shut down — doing the work of reaching back in.",
    ctPhysical: 1, ctEmotional: 4, ctCognitive: 3, ctTime: 3, ctPredictability: 3,
    needsMap: {sexual:1,recreation:1,affection:4,conversation:5,honesty:5,admiration:1,financial:1,domestic:1,family:1,attraction:1},
    subtypes: [],
  },
  {
    name: 'Holding through spirals',
    description: 'In the circular thinking loop together, waiting it out.',
    ctPhysical: 1, ctEmotional: 3, ctCognitive: 2, ctTime: 3, ctPredictability: 2,
    needsMap: {sexual:1,recreation:1,affection:3,conversation:4,honesty:3,admiration:1,financial:1,domestic:1,family:1,attraction:1},
    subtypes: [],
  },
];

// Pre-built steadying type templates — hidden, added via Developer toggle
const SAMPLE_CARETAKER_TYPES = DEFAULT_CARETAKER_TYPES;


// Legacy burnout types — used as fallback when no steadying type selected, and for old entries
const BURNOUT_TYPES = [
  {val:'reassurance', label:'Reassuring repeatedly',    sub:()=>`Giving the same validation multiple times as the loop keeps returning`},
  {val:'coregulate',  label:'Co-regulating',            sub:()=>`Being the steady presence ${P.pos} nervous system borrows stability from`},
  {val:'grounding',   label:'Grounding her',            sub:()=>`Helping ${P.obj} return to the present when pulled into the past`},
  {val:'crisis',      label:'Supporting through crisis', sub:()=>`Actively present through acute distress, ${P.sub} needs more than presence`},
  {val:'processing',  label:'Processing together',       sub:()=>`Active reframes, meaning-making, helping ${P.obj} understand what happened`},
  {val:'rupture',     label:'Repairing rupture',         sub:()=>`${P.Sub}'s withdrawn or shut down, I'm doing the work of reaching back in`},
  {val:'spiral',      label:'Holding through spirals',   sub:()=>`In the circular thinking loop with ${P.obj}, waiting it out`},
];
// Legacy key mapping for old entries
const BURNOUT_LEGACY = {
  'containment':  'coregulate',
  'flashback':    'grounding',
  'anxiety':      'spiral',
  'conflict-res': 'rupture',
  'listening':    'coregulate',
  'processing':   'processing',
};
function burnoutLabel(val) {
  const mapped = BURNOUT_LEGACY[val] || val;
  return BURNOUT_TYPES.find(t=>t.val===mapped) || BURNOUT_TYPES.find(t=>t.val===val) || {label: val, sub:''};
}
const DURATION_OPTIONS = [
  {v:'minutes',       s:'Minutes',          m:0.20},
  {v:'< 1 hour',      s:'Less than an hour',m:0.40},
  {v:'about an hour', s:'About an hour',    m:0.60},
  {v:'couple hours',  s:'Couple hours',     m:0.80},
  {v:'many hours',    s:'Many hours',       m:1.00},
];
const DRAIN_LEVELS = [
  {val:1,label:'Minimal',  sub:'Barely noticeable, handled easily',          m:0.20},
  {val:2,label:'Mild',     sub:'Noticeable but ok, recovered quickly',        m:0.40},
  {val:3,label:'Moderate', sub:'Left me somewhat depleted',                   m:0.60},
  {val:4,label:'Heavy',    sub:'Significantly drained, little left for myself',m:0.80},
  {val:5,label:'Severe',   sub:'Completely spent, needed recovery time',      m:1.00},
];
const CAT_COLORS = {
  physical:'#a8324e', affection:'#d6739c', libido:'#7c8ba8',
  conflict:'#dc3a3a', turndown:'#5f8ea8',  burnout:'#6b7d76',
  restore:'#4fa8c4', regulation:'#6c7884', repair:'#5fbe7e',
  notes:'#9cae9c', combined:'#7fb89a',
  social:'#e0a468', friction:'#9c5a4c',
};
const CAT_LABELS = {
  physical:'Intimacy',
  get affection(){ return S.relationshipMode === 'dating' ? 'Dating' : 'Bonding'; },
  get libido(){ return S.showPhysical ? 'Mood, Energy & Desire' : 'Mood & Energy'; },
  conflict:'Conflict', turndown:'Turn Down', notes:'Notes', burnout:'Steadying',
  restore:'Restorative', regulation:'Wobble', repair:'Repair', social:'Social',
  friction:'Friction',
};
const CAT_ICONS = {
  affection:'🩷', physical:'🌹', libido:'🌡️',
  conflict:'⛈️', turndown:'❄️', burnout:'💨', regulation:'🌪️',
  restore:'🌊', repair:'🤝', notes:'🌿', combined:'🔀',
  social:'🫂', friction:'🌧️',
};

// ── Friction constants (Social negative — Individual mode) ──
const FRICTION_IMPACT = [
  {val:1, label:'Brushed off',    sub:'Barely registered'},
  {val:2, label:'Annoying',       sub:'Mild residue, moved on quickly'},
  {val:3, label:'Stuck with me',  sub:'Replayed it, took a while to settle'},
  {val:4, label:'Hit hard',       sub:'Real hurt, lingered'},
  {val:5, label:'Cut deep',       sub:'Lasting damage to how you see this person/group'},
];
const FRICTION_INTENSITY = [
  {val:1, label:'Mild',    sub:'Felt it, kept moving'},
  {val:2, label:'Notable', sub:'Pulled focus for a bit'},
  {val:3, label:'Heavy',   sub:'Felt the weight throughout'},
  {val:4, label:'Hot',     sub:'Charged, hard to disengage'},
  {val:5, label:'Severe',  sub:'Overwhelming in the moment'},
];
const FRICTION_INTENSITY_M = {1:0.20, 2:0.40, 3:0.60, 4:0.80, 5:1.00};
const FRICTION_RESOLUTION = [
  {val:'cleared',     label:'Cleared',     sub:'Talked through, fully resolved',     m:0.20},
  {val:'softening',   label:'Softening',   sub:'Easing, but not finished',           m:0.40},
  {val:'still-rough', label:'Still rough', sub:'Open, unresolved, lingering',        m:0.60},
  {val:'distance',    label:'Distance',    sub:'Pulled away, gap remains',           m:0.80},
  {val:'deepened',    label:'Deepened',    sub:'Got worse, real damage',             m:1.00},
];
