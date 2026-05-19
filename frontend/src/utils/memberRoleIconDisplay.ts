import type { MemberRole } from '@/utils/memberProfiles';
import { safeCustomEmojiUrl } from '@/utils/customEmojiUrl';
import { safeImageUrl } from '@/utils/safeImageUrl';

/**
 * Safe `img` src for a guild role icon (upload, Twemoji URL, CDN URL, or raster data URL).
 * Empty string means no icon.
 */
export function memberRoleIconImgSrc(
  role: Pick<MemberRole, 'iconUrl' | 'iconEmojiId'> | null | undefined,
): string {
  if (!role) return '';
  const raw = (role.iconUrl ?? '').trim();
  if (!raw) return '';
  const rasterOrRemote = safeCustomEmojiUrl(raw);
  if (rasterOrRemote) return rasterOrRemote;
  return safeImageUrl(raw);
}
