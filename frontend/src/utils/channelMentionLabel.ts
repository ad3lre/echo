/**
 * Plain-text `#…` channel references cannot contain spaces; Echo uses dashes
 * (slug-style) so "My Channel" → `#My-Channel` in the serialized composer.
 */
export function channelMentionRefLabel(displayName: string): string {
  return displayName.trim().replace(/\s+/g, '-');
}
