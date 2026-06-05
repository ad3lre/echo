/** Rotating placeholder lines shown under an empty title (Canva-style). */

export const PAPER_INSPIRATION_QUOTES = [
  'Start with a bold idea.',
  'Make it simple, but significant.',
  'Good design is good business.',
  'Tell your story in your own words.',
  'Every great document begins with a title.',
  'Clarity beats cleverness.',
  'Write like you speak.',
  'Focus on what matters most.',
] as const;

const QUOTE_STORAGE_PREFIX = 'echo-paper-inspiration-quote:';

export function pickPaperInspirationQuote(channelId: string): string {
  const list = PAPER_INSPIRATION_QUOTES;
  try {
    const key = `${QUOTE_STORAGE_PREFIX}${channelId}`;
    const stored = sessionStorage.getItem(key);
    if (stored && list.includes(stored as (typeof list)[number])) {
      return stored;
    }
    const picked = list[Math.floor(Math.random() * list.length)] ?? list[0];
    sessionStorage.setItem(key, picked);
    return picked;
  } catch {
    return list[Math.floor(Math.random() * list.length)] ?? list[0];
  }
}
