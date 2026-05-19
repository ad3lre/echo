/**
 * Derives short search terms from recent chat text for the image search popout.
 */

const STOP = new Set([
  'the',
  'and',
  'for',
  'that',
  'this',
  'with',
  'you',
  'your',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'not',
  'but',
  'what',
  'when',
  'where',
  'which',
  'who',
  'how',
  'from',
  'they',
  'them',
  'their',
  'its',
  'our',
  'out',
  'all',
  'can',
  'get',
  'got',
  'just',
  'like',
  'one',
  'also',
  'into',
  'than',
  'then',
  'too',
  'very',
  'will',
  'would',
  'could',
  'should',
  'about',
  'there',
  'here',
  'some',
  'any',
  'more',
  'most',
  'other',
  'only',
  'been',
  'being',
  'because',
  'dont',
  'didnt',
  'doesnt',
  'wont',
  'cant',
  'im',
  'ive',
  'ill',
]);

const FALLBACK_SEEDS = [
  'landscape',
  'workspace',
  'coffee',
  'music',
  'city',
  'nature',
  'technology',
  'food',
  'travel',
  'architecture',
  'ocean',
  'forest',
];

export function extractChatImageSearchSeeds(
  messages: Iterable<{ content?: string }>,
  maxMessages = 48,
): string[] {
  const arr = [...messages];
  const recent = arr.slice(-maxMessages);
  const counts = new Map<string, number>();
  for (const m of recent) {
    const c = (m.content ?? '').trim();
    if (!c) continue;
    let t = c.replace(/https?:\/\/\S+/gi, ' ');
    t = t.replace(/<[@#][^>]*>/g, ' ');
    t = t.replace(/<a?:[^:>]+:\d+>/g, ' ');
    t = t.replace(/[#*_`~|[\]()]/g, ' ');
    t = t.toLowerCase();
    for (const raw of t.split(/\s+/)) {
      const w = raw.replace(/[^a-z0-9'-]/g, '');
      if (w.length < 3 || STOP.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 28)
    .map(([w]) => w);
}

export function pickImageSearchSeed(seeds: readonly string[]): string {
  const pool = seeds.length > 0 ? [...seeds] : [...FALLBACK_SEEDS];
  return pool[Math.floor(Math.random() * pool.length)]!;
}
