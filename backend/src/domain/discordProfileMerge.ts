import type { AuthStore } from '../auth/store';
import type { AuthUser } from '../auth/types';
import {
  MAX_REGISTER_DISPLAY_NAME_LENGTH,
  validateDisplayName,
} from '../auth/accountPolicy';
import type { DiscordMeApi, DiscordNormalizedV1 } from './discordNormalized';
import type pg from 'pg';
import { mirrorDiscordImportAvatarToEcho } from '../services/discordImportAvatarMirror';

/** Match accountPolicy CONTROL_CHARS_RE — strip before Echo validation. */
// eslint-disable-next-line no-control-regex -- intentional sanitization
const DISCORD_IMPORT_STRIP_CONTROLS = /[\u0000-\u001f\u007f]/g;

/**
 * Discord names can exceed Echo’s display cap or use reserved strings; never let that fail OAuth.
 */
function safeDiscordDisplayNameForEcho(me: DiscordMeApi): string | null {
  const rawGlobal =
    typeof me.global_name === 'string'
      ? me.global_name.replace(DISCORD_IMPORT_STRIP_CONTROLS, '').trim()
      : '';
  const rawUser =
    typeof me.username === 'string'
      ? me.username.replace(DISCORD_IMPORT_STRIP_CONTROLS, '').trim()
      : '';

  const tryName = (s: string): string | null => {
    if (!s) return null;
    const truncated = s.slice(0, MAX_REGISTER_DISPLAY_NAME_LENGTH);
    const v = validateDisplayName(truncated, '');
    return v.ok ? v.displayName : null;
  };

  return tryName(rawGlobal) ?? tryName(rawUser);
}

/**
 * Guests: safe profile import into auth_users. Registered users: no automatic overwrite of core identity.
 *
 * Discord email is intentionally not written via `updateUserProfile` — that path always throws
 * `EMAIL_CHANGE_REQUIRES_VERIFICATION`. The OAuth callback stores a pending upgrade email via
 * `setGuestPendingEmail` instead.
 */
export async function applyDiscordProfileMerge(params: {
  store: AuthStore;
  user: AuthUser;
  me: DiscordMeApi;
  normalized: DiscordNormalizedV1;
  pool?: pg.Pool | null;
}): Promise<'full' | 'partial'> {
  const { store, user, me, normalized, pool = null } = params;
  if (!user.isGuest) {
    return 'partial';
  }

  const safeDisplay = safeDiscordDisplayNameForEcho(me);

  const patch: Parameters<AuthStore['updateUserProfile']>[1] = {};
  if (safeDisplay) {
    patch.displayName = safeDisplay;
  }
  if (normalized.avatarUrl || normalized.avatarHash !== null) {
    const mirrored = await mirrorDiscordImportAvatarToEcho(
      pool,
      user.id,
      normalized.discordUserId,
      normalized.avatarHash,
    );
    if (mirrored) patch.pfp = mirrored;
  }
  if (normalized.bannerUrl) {
    patch.bannerImage = normalized.bannerUrl;
  }
  if (normalized.bio && normalized.bio.trim()) {
    patch.customStatus = normalized.bio.trim().slice(0, 140);
  }

  if (Object.keys(patch).length > 0) {
    await store.updateUserProfile(user.id, patch);
  }

  return 'full';
}
