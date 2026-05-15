'use strict';

// Helper: returns user-visible label for the Bonding/Dating entry type
// based on relationship mode. Used wherever the label is rendered.
function bondingLabel() {
  return S.relationshipMode === 'dating' ? 'Dating' : 'Bonding';
}


/* ── State ──────────────────────────────────────────── */
const EMOTIONAL_NEEDS = [
  {val:'sexual',      icon:'💋', label:'Sexual Fulfillment',         hint:'The need for a satisfying sexual relationship — a partner who is genuinely enthusiastic, engaged, and makes you feel desired.'},
  {val:'recreation',  icon:'🎲', label:'Recreational Companionship', hint:'The need for a partner who shares in fun, hobbies, and leisure — doing enjoyable things together.'},
  {val:'affection',   icon:'🤗', label:'Affection',                  hint:'The need for warmth, tenderness, and non-sexual physical closeness — hugs, holding, and touch that communicates care and connection.'},
  {val:'conversation',icon:'💬', label:'Conversation',               hint:'The need for a partner who genuinely wants to talk with you — sharing thoughts, asking questions, and connecting through regular meaningful conversation.'},
  {val:'honesty',     icon:'🪟', label:'Honesty & Openness',         hint:'The need for a partner who is honest and authentic — openly sharing their true thoughts, feelings, and relevant information so you always know where you stand.'},
  {val:'admiration',  icon:'🏆', label:'Admiration',                 hint:'The need to be genuinely admired by your partner — to feel that they respect your judgment, believe in your abilities, and are proud of who you are.'},
  {val:'financial',   icon:'💰', label:'Financial Support',          hint:'The need for a partner who contributes income and manages money responsibly — reducing the financial pressure on you and pulling their weight in providing for the household.'},
  {val:'domestic',    icon:'🏠', label:'Domestic Support',           hint:'The need for a partner who manages the home well — cooking, cleaning, childcare, and the daily demands of family life — so the home feels like a refuge rather than another responsibility.'},
  {val:'family',      icon:'👨\u200d👩\u200d👧\u200d👦', label:'Family Commitment',          hint:'The need for a partner who is invested in family life — parenting, shared values, and building a future together.'},
  {val:'attraction',  icon:'✨', label:'Physical Attractiveness',    hint:'The need to feel proud of and attracted to how your partner looks — that she makes an effort with her appearance for herself and for you.'},
];

const EN_DEFAULTS = {
  male:   ['sexual','recreation','attraction','domestic','admiration','conversation','honesty','financial','family','affection'],
  female: ['affection','conversation','honesty','financial','family','domestic','attraction','admiration','recreation','sexual'],
};
const PN_DEFAULTS = {
  male:   ['competence','autonomy','challenge','flow','escape','competition','identity','belonging','nature','sensory'],
  female: ['belonging','identity','sensory','nature','flow','escape','autonomy','competence','challenge','competition'],
};

const PERSONAL_NEEDS = [
  {val:'autonomy',     icon:'🗝️', label:'Autonomy',        hint:'The need to do things on your own terms — freedom from demands, obligations, and the pressure of other people\'s expectations.'},
  {val:'belonging',    icon:'👥', label:'Belonging',        hint:'The need to feel part of a group, community, or place — to be known, accepted, and valued by others beyond your relationship.'},
  {val:'challenge',    icon:'🧗', label:'Challenge / Edge', hint:'The need to be pushed — risk, difficulty, the possibility of failure, and the feeling of being at your limit.'},
  {val:'competition',  icon:'🏁', label:'Competition',      hint:'The need to measure yourself against others — competing, performing, and striving against a benchmark or opponent.'},
  {val:'competence',   icon:'🎯', label:'Competence',       hint:'The need to do things well — developing skill, experiencing mastery, and feeling capable and effective.'},
  {val:'escape',       icon:'🏖️', label:'Escape',           hint:'The need for psychological relief from daily demands — detachment from worries, responsibilities, and the pressures of ordinary life.'},
  {val:'flow',         icon:'🎼', label:'Flow',             hint:'The need for deep absorption — where self-consciousness disappears, time distorts, and you are fully and effortlessly in it.'},
  {val:'identity',     icon:'🌱', label:'Identity',         hint:'The need to connect with who you are outside your relational roles — your own sense of self, values, and place in the world.'},
  {val:'nature',       icon:'🌲', label:'Nature',           hint:'The need for immersion in the natural world — water, weather, wildlife, open space, and physical landscape.'},
  {val:'sensory',      icon:'🛁', label:'Aesthetic Pleasure', hint:'The need for a pleasant physical environment — atmosphere, comfort, sounds, tastes, warmth, and aesthetic surroundings.'},
];

const RESTORE_NEEDS = [...EMOTIONAL_NEEDS, ...PERSONAL_NEEDS];

const S = {
  today:         dateStr(new Date()),
  selectedDate:  dateStr(new Date()),
  calYear:       new Date().getFullYear(),
  calMonth:      new Date().getMonth(),
  dayEntries:    [],
  allEntries:    [],
  modal:         null,
  activeTab:     'home',   // 'home' | 'log' | 'insights' | 'needs' | 'library' | 'config'
  calFilters:    new Set(), // categories hidden on calendar — empty = show all
  loveBankWindow: 7,       // days shown in love bank chart: 1, 3, 7, 30, 60
  gaugeMode:      'relational', // which gauge to show: relational | personal | combined
  needsSort:      'fill',  // 'fill' | 'rank'
  needsTab:       'en',    // 'en' | 'pn'
  libBondingExpanded: false,
  libIntimacyExpanded: false,
  libRestoreExpanded: false,
  libSteadyingExpanded: false,
  libWobbleExpanded: false,
  libWhomExpanded: false,
  libLandscapeExpanded: false,
  libBondingForm: {},
  libIntimacyForm: {},
  libRestoreForm: {},
  libSteadyingForm: {},
  libWobbleForm: {},
  libWhomForm: {},
  expandedNotes:  new Set(), // entry IDs with notes expanded
  _confirmDeleteId: null,   // entry ID pending inline delete confirmation
  needsRanking:   ['sexual','attraction','recreation','admiration','domestic','conversation','honesty','financial','family','affection'], // male default
  personalNeedsRanking: ['competence','escape','autonomy','challenge','flow','competition','identity','belonging','nature','sensory'], // male default
  partnerPronouns: 'she', // 'she' | 'he' | 'they'
  userPronouns:    'he', // 'she' | 'he' | 'they'
  showCaretaker:   true,  // show/hide Caretaker entry type in the picker
  showRegulation:  true,  // show/hide Regulation entry type in the picker
  showPhysical:    true,  // show/hide Physical intimacy entry type in the picker
  showRepair:      false, // show/hide Repair entry type in the picker
  showAttachment:  false, // show/hide Attachment tab in the tab bar
  attachmentRefExpanded: false, // collapsible reference layer on Attachment tab
  horsemenExpanded:  false, // remember if user regularly uses the horsemen section
  tagPolyvagalOverrides: {}, // per-tag polyvagal state overrides; keys are tag names
  tagToneOverrides:   {}, // per-tag tone overrides for custom/renamed tags
  showDebug:         false, // show scoring debug panels in forms
  showCardPoints:    false, // show point values inline on entry cards
  useExperimentalScoring: true, // Lifetime-sum scoring with per-event lifespan decay
  calcStartDate:     '',    // DEBUG: YYYY-MM-DD — ignore entries before this date for all calculations (empty = no filter)
  needs2Ratings:     {},    // EN calibration playground: { needVal: rating (9/7/5/3/1) } — not yet wired to scoring
  needs2Order:       null,  // Array of need.val in user-visible order (post-quiz, manually reorderable)
  needs2Hits:        {},    // Raw selection counts per need from the last quiz, for debug visibility
  needsQuiz:         null,  // Transient quiz state for the Needs tab EN calibration (live answers + tie-breaker progress)
  needsHits:         {},    // Saved hit counts from the last Needs-tab EN calibration (debug visibility)
  needsPnQuiz:       null,  // Transient quiz state for the Needs tab PN calibration
  needsPnHits:       {},    // Saved hit counts from the last Needs-tab PN calibration
  needs2Sort:        'default', // 'default' | 'rank' — sort mode on the Needs2 calibration panel
  showQuickDelete:   false, // show × button on entry cards
  relationshipMode:  'partner', // 'partner' | 'dating' — controls Bonding form shape and labels
  weights: {
    decay:       0.05,
    stable7:     40,
    thriving7:   80,
    cap7:        240,
    calStable:   11,
    calThriving: 25,

    // Forecast temperature-change thresholds (Δ between today and tomorrow)
    // |Δ| < fcTouch → about the same · ≥ fcTouch → a touch · ≥ fcWarm → warmer · ≥ fcMuch → much warmer
    fcTouch:     1,
    fcWarm:      4,
    fcMuch:      8,

    // Experimental scoring model (lifetime sum with per-event lifespan decay)
    lifespanSlope:    0.5,   // days of lifespan per point of score
    lifespanFloor:    1.5,   // minimum lifespan even for tiny events
    decayPower:       2,     // shape of the fade — higher = sharper cliff at lifespan
    cutoffMultiplier: 2.5,   // hard zero past this many lifespans (kills the long tail)

    confR:       {resolved:0.40, partial:0.60, unresolved:0.80, worsened:1.00, breakthrough:0.20},

  },
  physicalTypes: [],
  affectionTypes:[],
  caretakerTypes: [],
  restoreTypes:  [],
  challengingEmotionTags: [],
  whomList: [],
  form:          {},
};

// ── Pronoun helper ───────────────────────────────────
// P = partner pronouns, U = user pronouns
// .sub  = subject  (she / he / they)
// .obj  = object   (her / him / them)
// .pos  = possessive (her / his / their)
// .ref  = reflexive  (herself / himself / themselves)
// .Sub  = capitalised subject
const PRONOUN_MAP = {
  she:  { sub:'she', obj:'her',  pos:'her',   ref:'herself',    Sub:'She'  },
  he:   { sub:'he',  obj:'him',  pos:'his',   ref:'himself',    Sub:'He'   },
  they: { sub:'they',obj:'them', pos:'their', ref:'themselves', Sub:'They' },
  // 'any' is used in dating mode when the user dates people of varying
  // pronouns. Resolves to they/them at render time so any reference to
  // a specific person reads naturally.
  any:  { sub:'they',obj:'them', pos:'their', ref:'themselves', Sub:'They' },
};
const P = new Proxy({}, {
  get(_, key) { return (PRONOUN_MAP[S.partnerPronouns || 'she'] || PRONOUN_MAP.she)[key] || ''; }
});
const U = new Proxy({}, {
  get(_, key) { return (PRONOUN_MAP[S.userPronouns || 'he'] || PRONOUN_MAP.he)[key] || ''; }
});
