const ADJECTIVES = [
  'Quiet',
  'Swift',
  'Bright',
  'Calm',
  'Bold',
  'Gentle',
  'Clever',
  'Brave',
  'Lucky',
  'Cosmic',
  'Silver',
  'Golden',
  'Neon',
  'Crystal',
  'Velvet',
  'Silent',
  'Blue',
  'Iron',
  'Moss',
  'Amber',
  'Jade',
  'Crimson',
  'Frost',
  'Shadow',
  'Solar',
  'Wild',
  'Ancient',
  'Northern',
  'Summer',
  'Winter',
];

const NOUNS = [
  'Fox',
  'River',
  'Comet',
  'Meadow',
  'Owl',
  'Harbor',
  'Pebble',
  'Nova',
  'Echo',
  'Falcon',
  'Willow',
  'Atlas',
  'Sparrow',
  'Cedar',
  'Drift',
  'Traveler',
  'Wanderer',
  'Pathfinder',
  'Strider',
  'Seeker',
  'Raven',
  'Heron',
  'Lark',
  'Thistle',
  'Birch',
  'Summit',
  'Horizon',
];

/**
 * Random two-word alias assigned at guest mint (and backfilled on resume/refresh if missing).
 * Stored as `display_name` so member lists and chat use it instead of `guest_<snowflake>` usernames.
 */
export function randomGuestPlaceholderDisplayName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  return `${a} ${n}`;
}
