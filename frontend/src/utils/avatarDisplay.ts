import { icons } from '@/assets/icons';
import { userAvatars, userAvatarsHiRes } from '@/assets/userAvatars';
import { isTrustedMediaUrl, safeImageUrl } from '@/utils/safeImageUrl';

type AvatarKey = keyof typeof userAvatars;

/**
 * URL for large avatar surfaces (DM call tiles, etc.): uses bundled hi-res assets when we know the user id.
 */
export function avatarUrlForCallDisplay(
  pfpUrl: string,
  userId?: string | null,
): string {
  if (userId && userId in userAvatarsHiRes) {
    return userAvatarsHiRes[userId as AvatarKey];
  }
  const match = Object.entries(userAvatars).find(([, url]) => url === pfpUrl);
  if (match) {
    const id = match[0] as AvatarKey;
    return userAvatarsHiRes[id] ?? pfpUrl;
  }
  return pfpUrl;
}

/**
 * Avatar URL for voice/DM call tiles: hi-res when known, bundled default when missing,
 * then sanitized for `<img>` (avoids invisible 1×1 when `pfp` is empty or non-URL).
 */
export function resolveCallTileAvatarUrl(
  pfp: string | undefined,
  userId: string,
): string {
  const base = pfp?.trim() || icons.usersAvatar;
  const displayCandidate = avatarUrlForCallDisplay(base, userId);
  // Avoid transparent 1x1 fallback in call tiles when backend `pfp` is malformed.
  const safeCandidate = isTrustedMediaUrl(displayCandidate)
    ? displayCandidate
    : icons.usersAvatar;
  return safeImageUrl(safeCandidate);
}
