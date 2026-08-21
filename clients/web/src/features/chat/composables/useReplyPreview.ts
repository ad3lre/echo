export function truncateForReply(text: string, maxLen = 50): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLen
    ? normalized
    : normalized.slice(0, maxLen) + '…';
}
