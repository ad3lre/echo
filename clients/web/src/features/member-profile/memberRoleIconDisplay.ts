import type { MemberRole } from '@/features/member-profile/memberProfiles';
import { safeCustomEmojiUrl } from '@/features/chat/emoji/customEmojiUrl';
import { safeImageUrl } from '@/features/layout/display/safeImageUrl';

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
