/** Pure channel display-name helper — kept out of `icons.ts` so callers avoid the SVG barrel. */
export function getChannelDisplayName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed === 'self-assignable-roles') return 'Self-assignable roles';
  return trimmed;
}
