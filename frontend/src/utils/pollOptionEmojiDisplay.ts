const POLL_CUSTOM_EMOJI = /^<a?:([^:>]+):([\w.-]{1,128})>$/;

export function parsePollOptionCustomEmojiToken(
  emoji: string,
): { id: string; name: string } | null {
  const m = emoji.trim().match(POLL_CUSTOM_EMOJI);
  if (!m) return null;
  return { id: m[2]!, name: m[1]! };
}
