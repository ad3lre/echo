import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';
import { getTwemojiSrc } from '@/utils/twemoji';

const DEFAULT_SHIELD_EMOJI = '🛡️';

/** Persisted icon for new rules and after clear — matches role icon storage (twemoji asset URL when available). */
export function defaultAutomodRuleIcon(): string {
  return getTwemojiSrc(DEFAULT_SHIELD_EMOJI) ?? DEFAULT_SHIELD_EMOJI;
}

/** Resolved image URL for the role-style icon picker `roleIconUrl` prop. */
export function automodRuleIconPickerUrl(
  stored: string | null | undefined,
): string {
  const raw = String(stored ?? '').trim();
  const shieldUrl = () => {
    const u = getTwemojiSrc(DEFAULT_SHIELD_EMOJI);
    return u ? safeImageUrl(u) : '';
  };
  if (!raw || raw === 'shield') return shieldUrl();
  if (isTrustedMediaUrl(raw)) return safeImageUrl(raw);
  const tw = getTwemojiSrc(raw);
  if (tw) return safeImageUrl(tw);
  return '';
}

/** Fallback glyph when the stored value is not displayable as an image. */
export function automodRuleIconGlyphFallback(
  stored: string | null | undefined,
): string {
  const raw = String(stored ?? '').trim();
  if (!raw || raw === 'shield') return DEFAULT_SHIELD_EMOJI;
  return raw;
}
