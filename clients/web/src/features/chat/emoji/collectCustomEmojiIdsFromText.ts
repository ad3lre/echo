import { findAllIdTokenMatches } from '@/features/layout/ids/idTokens';

/** Collect unique custom emoji snowflake ids from message text / tokens. */
export function collectCustomEmojiIdsFromText(text: string): string[] {
  const out = new Set<string>();
  for (const { token } of findAllIdTokenMatches(text)) {
    if (token.kind !== 'emoji') continue;
    const id = token.id.trim();
    if (id) out.add(id);
  }
  return Array.from(out);
}

export function collectCustomEmojiIdsFromTexts(
  texts: Iterable<string>,
): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const id of collectCustomEmojiIdsFromText(text)) out.add(id);
  }
  return Array.from(out);
}
