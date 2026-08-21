/** Normalize guess/secret for comparison (uppercase, collapse spaces). */
export function normalizeSkrigglesWord(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toUpperCase();
}

export type SkrigglesGuessMatch = 'exact' | 'close' | 'wrong';

export function classifySkrigglesGuess(
  guess: string,
  secret: string,
): SkrigglesGuessMatch {
  const g = normalizeSkrigglesWord(guess);
  const s = normalizeSkrigglesWord(secret);
  if (!g.length) return 'wrong';
  if (g === s) return 'exact';

  const gLen = g.length;
  const sLen = s.length;
  if (Math.abs(gLen - sLen) > 1) return 'wrong';

  if (g[0] === s[0] && gLen >= 3 && sLen >= 3) return 'close';

  const shorter = gLen <= sLen ? g : s;
  const longer = gLen <= sLen ? s : g;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (shorter[i] === longer[i]) matches++;
  }
  const overlap = matches / Math.max(shorter.length, 1);
  if (overlap >= 0.5) return 'close';

  return 'wrong';
}

export function wordHintForSecret(secret: string): string {
  const normalized = normalizeSkrigglesWord(secret);
  return normalized
    .split(' ')
    .map((word) => '_'.repeat(word.length))
    .join(' ');
}

export function wordHintWithFirstLetter(
  secret: string,
  revealed: boolean,
): string {
  if (!revealed) return wordHintForSecret(secret);
  const normalized = normalizeSkrigglesWord(secret);
  return normalized
    .split(' ')
    .map((word) => {
      if (!word.length) return '';
      return word[0]! + '_'.repeat(Math.max(0, word.length - 1));
    })
    .join(' ');
}
