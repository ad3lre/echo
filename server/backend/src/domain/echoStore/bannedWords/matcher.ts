/**
 * Banned-words text matcher.
 *
 * Normalises input text (lowercase, common l33t-speak substitutions) then
 * checks for whole-word matches against the enabled wordlists + custom words.
 */

import type {
  BannedWordActionKind,
  BannedWordCategory,
  EchoBannedWordsConfig,
} from '../../../../../../contracts/types/bannedWords';
import { BANNED_WORD_CATEGORIES } from '../../../../../../contracts/types/bannedWords';
import { getWordlist } from './wordlists';

export type BannedWordMatch = {
  word: string;
  category: BannedWordCategory | 'custom';
  action: BannedWordActionKind;
};

const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

function normaliseText(text: string): string {
  let out = text.toLowerCase();
  for (const [k, v] of Object.entries(LEET_MAP)) {
    out = out.replaceAll(k, v);
  }
  return out;
}

function buildWordSet(
  config: EchoBannedWordsConfig,
): Map<
  string,
  { category: BannedWordCategory | 'custom'; action: BannedWordActionKind }
> {
  const map = new Map<
    string,
    { category: BannedWordCategory | 'custom'; action: BannedWordActionKind }
  >();

  for (const cat of BANNED_WORD_CATEGORIES) {
    const cc = config.categories[cat];
    if (!cc?.enabled) continue;
    for (const word of getWordlist(cat)) {
      if (!map.has(word)) {
        map.set(word, { category: cat, action: cc.action });
      }
    }
  }

  const customAction: BannedWordActionKind = 'block_message';
  for (const raw of config.customWords) {
    const w = raw.trim().toLowerCase();
    if (w && !map.has(w)) {
      map.set(w, { category: 'custom', action: customAction });
    }
  }

  return map;
}

/**
 * Check message content against the server's banned-words config.
 * Returns all matches found (may be empty).
 */
export function matchBannedWords(
  content: string,
  config: EchoBannedWordsConfig,
): BannedWordMatch[] {
  if (config.presetLevel === 'off') return [];

  const enabledAny =
    BANNED_WORD_CATEGORIES.some((c) => config.categories[c]?.enabled) ||
    config.customWords.length > 0;
  if (!enabledAny) return [];

  const wordSet = buildWordSet(config);
  if (wordSet.size === 0) return [];

  const normalised = normaliseText(content);
  const matches: BannedWordMatch[] = [];
  const seen = new Set<string>();

  for (const [word, meta] of wordSet) {
    if (seen.has(word)) continue;
    const idx = normalised.indexOf(word);
    if (idx === -1) continue;

    const before = idx > 0 ? normalised[idx - 1] : ' ';
    const after =
      idx + word.length < normalised.length
        ? normalised[idx + word.length]
        : ' ';
    const wordBoundaryBefore = /\W/.test(before);
    const wordBoundaryAfter = /\W/.test(after);

    if (wordBoundaryBefore && wordBoundaryAfter) {
      seen.add(word);
      matches.push({ word, category: meta.category, action: meta.action });
    }
  }

  return matches;
}

/**
 * Determine the most severe action from a set of matches.
 * Severity order: timeout_60m > timeout_5m > delete_message > block_message > warn_dm
 */
const ACTION_SEVERITY: Record<BannedWordActionKind, number> = {
  warn_dm: 0,
  block_message: 1,
  delete_message: 2,
  timeout_5m: 3,
  timeout_60m: 4,
};

export function mostSevereAction(
  matches: BannedWordMatch[],
): BannedWordActionKind | null {
  if (matches.length === 0) return null;
  let best = matches[0].action;
  for (const m of matches) {
    if (ACTION_SEVERITY[m.action] > ACTION_SEVERITY[best]) {
      best = m.action;
    }
  }
  return best;
}

/**
 * Quick check: does this action mean the message should be blocked pre-send?
 */
export function shouldBlockMessage(action: BannedWordActionKind): boolean {
  return action === 'block_message';
}
