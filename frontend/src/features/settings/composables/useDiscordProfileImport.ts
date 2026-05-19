import { inject, ref } from 'vue';
import { useAuthSessionStore } from '@/stores/authSession';
import type { AuthUserPublic } from '@/api/authClient';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import { PLATFORM_KEY, type EchoPlatform } from '@/platform/keys';
import { sessionUserDisplayName } from '@/utils/memberProfiles';
import { normalizeBannerColorForForm } from '@/utils/profileBannerGradientFromImage';
import {
  markDiscordProfileImportPromptDone,
  runDiscordProfileImportFlow,
} from '@/features/discord/discordProfileImportFlow';
import { startOAuthFlow } from '@/platform/desktopBridge';

function workspaceVisualsFromAuthUser(user: AuthUserPublic) {
  return {
    pfp: user.pfp ?? '',
    name: sessionUserDisplayName(user.displayName, user.username),
    customStatus: user.customStatus,
    bio: user.bio ?? '',
    bannerImage: user.bannerImage,
    bannerColor: normalizeBannerColorForForm(user.bannerColor),
    bannerRefractionEnabled: user.bannerRefractionEnabled,
    bannerBlurEnabled: user.bannerBlurEnabled,
    bannerBlackoutEnabled: user.bannerBlackoutEnabled,
    bannerPositionY: user.bannerPositionY,
    status: user.status ?? '',
    timeZone: user.timeZone ?? null,
  };
}

export function useDiscordProfileImport() {
  const authSession = useAuthSessionStore();
  const echoPlatform = inject(PLATFORM_KEY, null) as EchoPlatform | null;
  const patchUserRowById = (
    echoPlatform?.workspace as WorkspaceStateApi | undefined
  )?.patchUserRowById;

  const busy = ref(false);
  const error = ref('');

  function syncWorkspaceFromAuthUser(user: AuthUserPublic) {
    if (!patchUserRowById) return;
    patchUserRowById(user.id, workspaceVisualsFromAuthUser(user));
  }

  /**
   * @returns `true` if profile was updated on Echo (not OAuth redirect).
   */
  async function importFromDiscord(options?: {
    /** When false, the one-time prompt can appear again if the profile stays sparse. Default true. */
    markOneTimePromptDone?: boolean;
  }): Promise<boolean> {
    if (busy.value) return false;
    busy.value = true;
    error.value = '';
    const markDone = options?.markOneTimePromptDone !== false;
    try {
      const r = await runDiscordProfileImportFlow();
      if (r.kind === 'oauth_redirect') {
        startOAuthFlow(r.authorizeUrl);
        return false;
      }
      if (r.kind === 'error') {
        error.value = r.message;
        return false;
      }
      if (r.kind === 'empty_patch') {
        error.value =
          'Your Discord profile does not have importable fields yet.';
        return false;
      }
      authSession.applyRestoredProfile(r.user);
      syncWorkspaceFromAuthUser(r.user);
      if (markDone) markDiscordProfileImportPromptDone();
      return true;
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Could not import right now.';
      return false;
    } finally {
      busy.value = false;
    }
  }

  return { busy, error, importFromDiscord, syncWorkspaceFromAuthUser };
}
