/**
 * Builds secondary search terms for the "main 500" Unicode emoji used in chat:
 * all of Smileys & Emotion + the first slice of People & Body (total 500).
 * Output: frontend/src/data/emoji-secondary-aliases.json
 *
 * Run: node scripts/build-emoji-secondary-aliases.js
 */
const fs = require('fs');
const path = require('path');

const dataPath = path.resolve(
  __dirname,
  '../node_modules/unicode-emoji-json/data-by-group.json',
);
const outputPath = path.resolve(
  __dirname,
  '../frontend/src/data/emoji-secondary-aliases.json',
);

const STOP = new Set([
  'face',
  'with',
  'and',
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'for',
  'to',
  'without',
]);

/** Extra tokens users often type instead of the CLDR name. */
const WORD_EXPANSION = {
  grinning: ['happy', 'joy', 'smile'],
  beaming: ['happy', 'grin', 'smile'],
  smiling: ['happy', 'positive', 'nice'],
  laughing: ['lol', 'haha', 'funny', 'comedy'],
  tears: ['cry', 'sad'],
  crying: ['sad', 'upset', 'sob', 'bawling'],
  loudly: ['sob', 'bawling'],
  winking: ['flirt', 'wink'],
  kissing: ['kiss', 'love', 'romance'],
  blowing: ['kiss'],
  melting: ['dissolve', 'dead', 'heat'],
  upside: ['silly', 'sarcasm'],
  slightly: ['smile', 'neutral'],
  heart: ['love'],
  hearts: ['love'],
  star: ['wow', 'amazing'],
  stuck: ['fan', 'celebrity'],
  partying: ['party', 'celebration', 'birthday'],
  sunglasses: ['cool', 'chill', 'bright'],
  nerd: ['geek', 'glasses'],
  monocle: ['fancy', 'posh'],
  confused: ['huh', 'unsure'],
  worried: ['nervous', 'anxious'],
  astonished: ['shocked', 'gasp'],
  flushed: ['embarrassed', 'shy'],
  pleading: ['puppy', 'cute', 'please'],
  fearful: ['scared', 'fright'],
  screaming: ['scared', 'horror'],
  weary: ['tired', 'exhausted'],
  yawning: ['sleepy', 'bored'],
  steam: ['angry', 'huff'],
  enraged: ['mad', 'furious'],
  horns: ['devil', 'evil', 'mischief'],
  skull: ['death', 'dead', 'danger'],
  clown: ['silly', 'joke'],
  ghost: ['spooky', 'boo'],
  alien: ['ufo', 'space'],
  robot: ['bot', 'machine'],
  monkey: ['see', 'hear', 'speak'],
  poo: ['poop', 'crap', 'turd'],
  hundred: ['perfect', 'score', 'exam'],
  anger: ['mad'],
  dizzy: ['stars', 'woozy'],
  speech: ['talk', 'chat', 'say'],
  thought: ['think', 'idea'],
  waving: ['hello', 'hi', 'bye'],
  vulcan: ['spock', 'trek'],
  ok: ['okay', 'nice', 'perfect'],
  victory: ['peace', 'v'],
  crossed: ['luck', 'hope'],
  love: ['ily', 'heart'],
  call: ['phone'],
  middle: ['rude', 'flip'],
  clapping: ['applause', 'bravo'],
  raising: ['celebrate', 'hooray'],
  folded: ['please', 'pray', 'thanks'],
  writing: ['note', 'pen'],
  selfie: ['camera', 'photo'],
  flexed: ['strong', 'gym', 'workout'],
  mechanical: ['prosthetic', 'bionic'],
  ear: ['hear', 'deaf'],
  brain: ['smart', 'think'],
  bone: ['skeleton', 'halloween'],
  baby: ['infant', 'child'],
  person: ['someone', 'human'],
  man: ['male', 'guy'],
  woman: ['female', 'girl'],
  blond: ['hair'],
  beard: ['facial hair'],
  old: ['elder', 'senior'],
  frowning: ['sad'],
  tipping: ['sassy', 'hair flip'],
  deaf: ['sign'],
  bowing: ['sorry', 'thanks'],
  facepalming: ['doh', 'oops'],
  shrugging: ['dunno', 'whatever', 'idk'],
  health: ['doctor', 'nurse', 'medical'],
  student: ['school', 'study'],
  teacher: ['school'],
  farmer: ['farm'],
  cook: ['chef', 'kitchen'],
  mechanic: ['wrench', 'repair'],
  scientist: ['lab', 'research'],
  technologist: ['code', 'dev', 'laptop'],
  singer: ['mic', 'music'],
  artist: ['paint'],
  pilot: ['plane', 'fly'],
  astronaut: ['space', 'rocket'],
  firefighter: ['fire'],
  police: ['cop', 'law'],
  detective: ['spy', 'investigate'],
  guard: ['security'],
  construction: ['helmet', 'build'],
  crown: ['king', 'queen', 'royal'],
  turban: ['sikh'],
  tuxedo: ['formal', 'wedding'],
  veil: ['wedding', 'bride'],
  pregnant: ['baby bump'],
  santa: ['christmas', 'xmas'],
  superhero: ['hero', 'comic'],
  supervillain: ['villain', 'bad'],
  mage: ['wizard', 'magic'],
  fairy: ['wings'],
  vampire: ['dracula', 'fangs'],
  merperson: ['mermaid'],
  zombie: ['undead'],
  massage: ['spa', 'relax'],
  haircut: ['salon', 'barber'],
  walking: ['stroll'],
  kneeling: ['proposal'],
  cane: ['blind', 'accessibility'],
  wheelchair: ['accessibility', 'a11y'],
  running: ['jog', 'sprint'],
  dancing: ['dance', 'party'],
  bathing: ['bath', 'tub'],
  family: ['kids', 'parents'],
  handshake: ['deal', 'agree'],
  nail: ['manicure'],
  footprints: ['steps', 'walk'],
  dog: ['puppy', 'pet', 'woof'],
  cat: ['kitten', 'pet', 'meow'],
  wave: ['ocean', 'beach'],
};

/** High-signal overrides (Discord / Slack habits). */
const PER_SLUG = {
  rolling_on_the_floor_laughing: ['rofl', 'lmao', 'lol', 'dying'],
  face_with_tears_of_joy: ['lol', 'lmao', 'haha', 'funny'],
  loudly_crying_face: ['sob', 'bawling', 'sad'],
  slightly_smiling_face: ['smile', 'nice', 'friendly'],
  upside_down_face: ['silly', 'sarcastic'],
  melting_face: ['dead', 'heat', 'summer'],
  smiling_face_with_hearts: ['love', 'crush'],
  smiling_face_with_heart_eyes: ['love', 'crush', 'beautiful'],
  face_blowing_a_kiss: ['love', 'xo'],
  face_with_raised_eyebrow: ['suspicious', 'really'],
  neutral_face: ['meh', 'blank'],
  expressionless_face: ['blank', 'meh'],
  unamused_face: ['unimpressed', 'side eye'],
  face_with_rolling_eyes: ['annoyed', 'sigh'],
  thinking_face: ['hmm', 'wonder'],
  zipper_mouth_face: ['quiet', 'secret'],
  nauseated_face: ['sick', 'gross'],
  sneezing_face: ['cold', 'flu'],
  hot_face: ['sweat', 'heatwave'],
  cold_face: ['freeze', 'winter'],
  exploding_head: ['mind blown', 'wow'],
  face_with_symbols_on_mouth: ['cursing', 'swearing'],
  skull: ['dead', 'bones'],
  pile_of_poo: ['poop', 'crap', 'shit'],
  thumbs_up: ['yes', 'ok', 'like', 'approve', 'upvote', 'yup', 'agree', '+1'],
  thumbs_down: ['no', 'nope', 'dislike', 'downvote', 'boo', '-1'],
  folded_hands: ['please', 'pray', 'thanks', 'hope'],
  flexed_biceps: ['strong', 'muscle', 'gym', 'lift'],
  person_shrugging: ['idk', 'dunno', 'whatever'],
  person_facepalming: ['doh', 'fail'],
  eyes: ['see', 'look', 'peek'],
  zzz: ['sleep', 'snore', 'tired', 'bored'],
  boy: ['kid', 'son', 'child'],
  eye: ['look', 'see', 'watch'],
  leg: ['limb'],
  elf: ['fantasy', 'ears'],
};

function tokenizeWords(s) {
  return s
    .toLowerCase()
    .split(/[\s_]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

function buildAliases(entry) {
  const slug = entry.slug;
  const name = entry.name || '';
  const out = new Set(PER_SLUG[slug] || []);

  for (const w of tokenizeWords(slug + ' ' + name)) {
    const exp = WORD_EXPANSION[w];
    if (exp) exp.forEach((x) => out.add(x));
  }

  /** Light n-gram hints from the display name (users often remember a noun). */
  for (const w of tokenizeWords(name)) {
    if (w.length >= 4) out.add(w);
  }

  const list = [...out].filter(Boolean);
  list.sort();
  return list.slice(0, 14);
}

const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
const smileys = raw.find((c) => c.slug === 'smileys_emotion');
const people = raw.find((c) => c.slug === 'people_body');
if (!smileys || !people) {
  console.error('Missing expected emoji groups');
  process.exit(1);
}

const MAIN_500 = [
  ...smileys.emojis,
  ...people.emojis.slice(0, 500 - smileys.emojis.length),
];

if (MAIN_500.length !== 500) {
  console.error('Expected 500 emojis, got', MAIN_500.length);
  process.exit(1);
}

const result = {};
for (const e of MAIN_500) {
  result[e.slug] = buildAliases(e);
}

const dir = path.dirname(outputPath);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 0) + '\n', 'utf-8');
console.log(
  'Wrote',
  outputPath,
  '(' + Object.keys(result).length + ' slugs, avg aliases',
  (Object.values(result).reduce((a, b) => a + b.length, 0) / 500).toFixed(1) +
    ')',
);
