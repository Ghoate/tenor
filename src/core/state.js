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

// Social Needs — the relational needs an individual can have outside a
// romantic/partner context (friends, family, community, casual ties).
// Sources noted per item so the framework is traceable:
//   support, companionship, advice, help → Cohen & Wills (1985) social support typology
//   community                            → Baumeister & Leary (1995) "Need to belong"; Maslow
//   validation                           → Weiss (1974) "reassurance of worth"
//   play                                 → Stuart Brown (2009); PERMA positive-emotion pillar
//   intimacy                             → Reis & Shaver (1988) intimacy process model
//   growth                               → Weiss (1974) "guidance"; mentorship literature
//   meaning                              → Schwartz values theory (universalism/benevolence); Vaillant Grant Study
const SOCIAL_NEEDS = [
  {val:'support',       icon:'🫂', label:'Emotional Support',         hint:'Being heard, understood, comforted in hard moments — people you can talk to when things are heavy.'},
  {val:'companionship', icon:'🚶', label:'Companionship',             hint:'Doing things together — shared time as its own reward, no particular purpose required.'},
  {val:'community',     icon:'🌳', label:'Belonging',                 hint:'Being part of a group with a shared identity — feeling you fit somewhere and are known there.'},
  {val:'validation',    icon:'🪞', label:'Validation',                hint:'Being seen and appreciated for who you are — recognition that you matter, as you are.'},
  {val:'play',          icon:'🎲', label:'Play & Lightness',          hint:'Laughter, fun, recreation with others — moments that are simply enjoyable, not productive.'},
  {val:'intimacy',      icon:'🤝', label:'Intimacy & Vulnerability',  hint:'Being deeply known — sharing private parts of yourself with people who hold them carefully.'},
  {val:'advice',        icon:'💡', label:'Advice & Perspective',      hint:'Hearing other viewpoints — input on decisions or situations from people whose judgment you value.'},
  {val:'help',          icon:'🛠️', label:'Practical Help',             hint:'Tangible assistance — rides, money, hands-on help with tasks. People who show up when you need something done.'},
  {val:'growth',        icon:'⛰️', label:'Challenge & Growth',        hint:'People who push you, sharpen you, or hold you accountable — connections that ask you to be more.'},
  {val:'meaning',       icon:'🕯️', label:'Shared Meaning',            hint:'Connection through shared purpose or values — causes, beliefs, things you both think matter.'},
];

const SN_DEFAULTS = {
  general: ['support','companionship','community','validation','play','intimacy','advice','help','growth','meaning'],
};

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
  gaugeMode:      'relational', // which gauge to show: relational | personal | combined
  needsSort:      'fill',  // 'fill' | 'rank'
  needsTab:       'en',    // 'en' | 'pn'
  libBondingExpanded: false,
  libSocialExpanded: false,
  libIntimacyExpanded: false,
  libRestoreExpanded: false,
  libSteadyingExpanded: false,
  libWobbleExpanded: false,
  libLandscapeExpanded: false,
  libBondingForm: {},
  libSocialForm: {},
  libIntimacyForm: {},
  libRestoreForm: {},
  libSteadyingForm: {},
  libWobbleForm: {},
  expandedNotes:  new Set(), // entry IDs with notes expanded
  _confirmDeleteId: null,   // entry ID pending inline delete confirmation
  needsRanking:   ['sexual','attraction','recreation','admiration','domestic','conversation','honesty','financial','family','affection'], // male default
  personalNeedsRanking: ['competence','escape','autonomy','challenge','flow','competition','identity','belonging','nature','sensory'], // male default
  socialNeedsRanking: [...SN_DEFAULTS.general], // Individual mode only — replaces Love Needs ranking
  socialTypes:       [],  // User-defined Social activity types (Individual mode parallel to affectionTypes)
  partnerPronouns: 'she', // 'she' | 'he' | 'they'
  userPronouns:    'he', // 'she' | 'he' | 'they'
  showCaretaker:   true,  // show/hide Caretaker entry type in the picker
  showRegulation:  true,  // show/hide Regulation entry type in the picker
  showPhysical:    true,  // show/hide Physical intimacy entry type in the picker
  showBonding:     true,  // show/hide Bonding entry type (and Combined) in the picker
  showConflict:    true,  // show/hide Conflict entry type in the picker
  trackSocialAxis: false, // Partner/Dating mode: track Social as a 3rd axis (rel + soc + per). Off by default.
  showObservations: false,// Show Observations + Correlations sections on the Insights tab. Off by default.
  showCheckIn:      false,// Show Daily Check-In (mood/energy/desire) entry type. Off by default — when off, day capacity defaults to neutral (1.0).
  showSoloIntimacy: false,// Show solo intimacy option in the physical form + library. Off by default (solo scores 0 and isn't chart-visible).
  showRepair:      false, // show/hide Repair entry type in the picker
  showAttachment:  false, // show/hide Attachment tab in the tab bar
  attachmentRefExpanded: false, // collapsible reference layer on Attachment tab
  horsemenExpanded:  false, // remember if user regularly uses the horsemen section
  homeForecastExpanded: false, // 7-day forecast section on home page — transient, collapsed by default and reset on every visit
  tagPolyvagalOverrides: {}, // per-tag polyvagal state overrides; keys are tag names
  tagToneOverrides:   {}, // per-tag tone overrides for custom/renamed tags
  showDebug:         false, // show scoring debug panels in forms
  showCardPoints:    false, // show point values inline on entry cards
  calcStartDate:     '',    // DEBUG: YYYY-MM-DD — ignore entries before this date for all calculations (empty = no filter)
  needsQuiz:         null,  // Transient quiz state for the Needs tab EN calibration (live answers + tie-breaker progress)
  needsHits:         {},    // Saved hit counts from the last Needs-tab EN calibration (debug visibility)
  needsPnQuiz:       null,  // Transient quiz state for the Needs tab PN calibration
  needsPnHits:       {},    // Saved hit counts from the last Needs-tab PN calibration
  needsSnQuiz:       null,  // Transient quiz state for the Needs tab SN calibration (Individual mode)
  needsSnHits:       {},    // Saved hit counts from the last Needs-tab SN calibration
  showQuickDelete:   false, // show × button on entry cards
  relationshipMode:  'partner', // 'partner' | 'dating' — controls Bonding form shape and labels
  weights: {
    stable7:     30,
    thriving7:   60,
    cap7:        150,
    calStable:   11,
    calThriving: 25,

    // Lifetime-sum scoring (per-event exponential fade)
    // Anchored on +100 → 63 days and +2 → 3 days. Slope/floor derived from those anchors.
    expT_Slope:       0.6122,
    expT_Floor:       1.7755,

    // Percent-chart per-DOW probability recency. Each day in the window is weighted by an
    // exponential decay with this half-life. Recent days dominate, older days fade but still
    // count, so weekly patterns stay visible across longer history.
    //   ~7d  = recent week dominates · ~14d = balanced · ~28d = gentle fade
    dowHalfLife:      14,

    confR:       {resolved:0.40, partial:0.60, unresolved:0.80, worsened:1.00, breakthrough:0.20},

  },
  physicalTypes: [],
  affectionTypes:[],
  caretakerTypes: [],
  restoreTypes:  [],
  challengingEmotionTags: [],
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
