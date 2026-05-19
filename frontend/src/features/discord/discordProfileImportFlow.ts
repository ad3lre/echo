import {
  authDiscordOAuthStart,
  authPatchMe,
  type AuthPatchMeBody,
  type AuthUserPublic,
} from '@/api/authClient';
import { fetchMeDiscord, type MeDiscordResponse } from '@/api/meClient';

export const DISCORD_PROFILE_IMPORT_PROMPT_DONE_KEY =
  'echo_discord_profile_import_prompt_done';

export function markDiscordProfileImportPromptDone(): void {
  try {
    localStorage.setItem(DISCORD_PROFILE_IMPORT_PROMPT_DONE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function isDiscordProfileImportPromptDone(): boolean {
  try {
    return localStorage.getItem(DISCORD_PROFILE_IMPORT_PROMPT_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Echo stores new accounts with an SVG data URL generated from the display name. */
export function isLikelyEchoDefaultGeneratedPfp(
  pfp: string | undefined,
): boolean {
  const s = pfp?.trim() ?? '';
  return (
    s.startsWith('data:image/svg+xml,') &&
    // Same SVG namespace appears raw or percent-encoded in the fragment.
    (s.includes('www.w3.org/2000/svg') || s.includes('www.w3.org%2F2000%2Fsvg'))
  );
}

/**
 * True when the Echo profile still looks like a minimal / default account and
 * could benefit from pulling Discord display name, avatar, banner, and bio.
 *
 * Uses “customized” signals (non-default avatar URL, banner, bio, display ≠ username)
 * so finished accounts are not nagged just because their display name matches their handle.
 */
export function shouldOfferDiscordProfileImport(
  user: AuthUserPublic | null | undefined,
): boolean {
  if (!user || user.isGuest) return false;
  const dn = user.displayName?.trim() ?? '';
  const un = user.username?.trim() ?? '';
  const hasDistinctDisplay = !!dn && dn.toLowerCase() !== un.toLowerCase();
  const hasBioOrStatus = !!(user.bio?.trim() || user.customStatus?.trim());
  const hasBanner = !!user.bannerImage?.trim();
  const pfp = user.pfp?.trim() ?? '';
  const hasCustomAvatar = !!pfp && !isLikelyEchoDefaultGeneratedPfp(pfp);
  if (hasDistinctDisplay || hasBioOrStatus || hasBanner || hasCustomAvatar) {
    return false;
  }
  return true;
}

function discordAssetComparableKey(url: string): string {
  const t = url.trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    return `${u.hostname}${u.pathname}`;
  } catch {
    return t;
  }
}

function discordLinkedFieldsRoughlyMatch(
  discordUrl: string,
  echoUrl: string,
): boolean {
  if (!discordUrl.trim() || !echoUrl.trim()) return false;
  if (discordUrl === echoUrl) return true;
  return (
    discordAssetComparableKey(discordUrl) === discordAssetComparableKey(echoUrl)
  );
}

/**
 * True when the current Echo profile already reflects one or more linked Discord
 * fields, so the one-time import prompt should stay quiet even if the profile
 * remains otherwise sparse (for example, Discord has no banner/bio to import).
 */
export function hasImportedDiscordProfileFields(
  user: AuthUserPublic | null | undefined,
  state: MeDiscordResponse | null | undefined,
): boolean {
  if (!user || !state || !state.linked) return false;
  const avatarUrl = state.profile.avatarUrl?.trim() ?? '';
  const bannerUrl = state.profile.bannerUrl?.trim() ?? '';
  const displayName = state.profile.globalName?.trim() ?? '';
  const bio = state.profile.bio?.trim() ?? '';

  const userPfp = user.pfp?.trim() ?? '';
  const userBanner = user.bannerImage?.trim() ?? '';
  const userDisplayName = user.displayName?.trim() ?? '';
  const userBio = user.customStatus?.trim() ?? '';

  return (
    (avatarUrl !== '' && discordLinkedFieldsRoughlyMatch(avatarUrl, userPfp)) ||
    (bannerUrl !== '' &&
      discordLinkedFieldsRoughlyMatch(bannerUrl, userBanner)) ||
    (displayName !== '' && userDisplayName === displayName) ||
    (bio !== '' && userBio === bio.slice(0, 140))
  );
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns true when the account's `createdAt` is more than `maxAgeMs` in the
 * past. Missing / unparseable timestamps are treated as "not older" so we fail
 * open (older-than checks are used to hide affordances, not gate access).
 */
export function isAccountOlderThan(
  user: AuthUserPublic | null | undefined,
  maxAgeMs: number,
  now: number = Date.now(),
): boolean {
  const raw = user?.createdAt;
  if (!raw) return false;
  const createdAt = new Date(raw).getTime();
  if (!Number.isFinite(createdAt)) return false;
  return now - createdAt > maxAgeMs;
}

/**
 * True when the Echo account was created more than 24h ago. Used to scope the
 * "Import profile from Discord" affordance to fresh accounts on the main
 * Profile tab — the Discord settings tab exposes the same action regardless of
 * account age.
 */
export function isAccountOlderThanOneDay(
  user: AuthUserPublic | null | undefined,
  now: number = Date.now(),
): boolean {
  return isAccountOlderThan(user, ONE_DAY_MS, now);
}

function patchFromLinkedDiscord(
  state: Extract<MeDiscordResponse, { linked: true }>,
): AuthPatchMeBody | null {
  const patch: AuthPatchMeBody = {};
  const avatarUrl = state.profile.avatarUrl?.trim() ?? '';
  const bannerUrl = state.profile.bannerUrl?.trim() ?? '';
  const displayName = state.profile.globalName?.trim() ?? '';
  const bio = state.profile.bio?.trim() ?? '';
  if (avatarUrl) patch.pfp = avatarUrl;
  if (bannerUrl) patch.bannerImage = bannerUrl;
  if (displayName) patch.displayName = displayName;
  if (bio) patch.customStatus = bio.slice(0, 140);
  return Object.keys(patch).length > 0 ? patch : null;
}

export type DiscordProfileImportFlowResult =
  | { kind: 'success'; user: AuthUserPublic }
  | { kind: 'oauth_redirect'; authorizeUrl: string }
  | { kind: 'empty_patch' }
  | { kind: 'error'; message: string };

/**
 * Pulls Discord-linked profile fields into the authenticated Echo user via PATCH /auth/me.
 * If Discord is not linked yet, starts OAuth (caller should navigate to authorizeUrl).
 */
export async function runDiscordProfileImportFlow(): Promise<DiscordProfileImportFlowResult> {
  try {
    const state = await fetchMeDiscord();
    if (!state.linked) {
      const { authorizeUrl } = await authDiscordOAuthStart();
      return { kind: 'oauth_redirect', authorizeUrl };
    }
    const patch = patchFromLinkedDiscord(state);
    if (!patch) return { kind: 'empty_patch' };
    const { user } = await authPatchMe(patch);
    return { kind: 'success', user };
  } catch (e) {
    return {
      kind: 'error',
      message:
        e instanceof Error
          ? e.message
          : 'Could not import your Discord profile right now.',
    };
  }
}
