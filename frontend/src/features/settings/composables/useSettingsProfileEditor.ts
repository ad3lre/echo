import { computed, inject, nextTick, ref, watch, type Ref } from 'vue';
import {
  AuthApiError,
  authPatchMe,
  type AuthPatchMeBody,
  type AuthUserPublic,
} from '@/api/authClient';
import { uploadUserProfileBrandingFile } from '@/api/echoClient';
import { fetchMeDiscord } from '@/api/meClient';
import {
  isAccountOlderThanOneDay,
  markDiscordProfileImportPromptDone,
  runDiscordProfileImportFlow,
  shouldOfferDiscordProfileImport,
} from '@/features/discord/discordProfileImportFlow';
import type { WorkspaceStateApi } from '@/composables/useEchoWorkspace';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import { PLATFORM_KEY, type EchoPlatform } from '@/platform/keys';
import {
  extractUploadErrorMessage,
  isValidBrandingImageFile,
} from '@/services/domain/brandingUploads';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import { UIErrorBus } from '@/utils/uiErrorBus';
import {
  readBlobAsDataUrl,
  uploadBrandingAssetWithInlineFallback,
} from '@/services/orchestration/brandingUploadFallback';
import { useAuthSessionStore } from '@/stores/authSession';
import { startOAuthFlow } from '@/platform/desktopBridge';
import type { LocalProfilePatch } from '@/utils/localProfilePersistence';
import {
  overwriteLocalProfileFromAuthUser,
  saveLocalProfile,
} from '@/utils/localProfilePersistence';
import {
  deriveProfileBannerGradientFromImageSource,
  normalizeBannerColorForForm,
} from '@/utils/profileBannerGradientFromImage';
import { sessionUserDisplayName } from '@/utils/memberProfiles';
import {
  describeEchoUsernameFieldIssue,
  validateRegistrationUsername,
} from '@shared/usernamePolicy';

type UserLike =
  | {
      id: string;
      name: string;
      pfp?: string;
      bio?: string;
      bannerImage?: string;
      bannerColor?: string;
      bannerRefractionEnabled?: boolean;
      bannerBlurEnabled?: boolean;
      bannerBlackoutEnabled?: boolean;
      bannerPositionY?: number;
    }
  | null
  | undefined;

type MutableProfileFields = Pick<
  NonNullable<UserLike>,
  | 'pfp'
  | 'bio'
  | 'bannerImage'
  | 'bannerColor'
  | 'bannerRefractionEnabled'
  | 'bannerBlurEnabled'
  | 'bannerBlackoutEnabled'
  | 'bannerPositionY'
>;

function applyProfilePatch(
  u: NonNullable<UserLike>,
  patch: Partial<MutableProfileFields>,
): void {
  Object.assign(u, patch);
}

type SettingsFormLike = {
  displayName: string;
  username: string;
  pfp: string;
  customStatus: string;
  bio: string;
  bannerColor: string;
  bannerImage: string;
  bannerRefractionEnabled: boolean;
  bannerBlurEnabled: boolean;
  bannerBlackoutEnabled: boolean;
  bannerPositionY: number;
};

type ProfileEditSnapshot = {
  displayName: string;
  username: string;
  customStatus: string;
  bio: string;
  pfp: string;
  bannerImage: string;
  bannerColor: string;
  bannerRefractionEnabled: boolean;
  bannerBlurEnabled: boolean;
  bannerBlackoutEnabled: boolean;
  bannerPositionY: number;
};

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

export function useSettingsProfileEditor(
  form: SettingsFormLike,
  currentUser: Ref<UserLike>,
) {
  const authSession = useAuthSessionStore();
  const echoPlatform = inject(PLATFORM_KEY, null) as EchoPlatform | null;
  const patchUserRowById = (
    echoPlatform?.workspace as WorkspaceStateApi | undefined
  )?.patchUserRowById;

  function patchWorkspaceUser(
    partial: LocalProfilePatch & { name?: string; status?: string },
  ) {
    const id = currentUser.value?.id;
    if (!id || !patchUserRowById) return;
    patchUserRowById(id, partial);
  }

  function syncWorkspaceFromAuthUser(user: AuthUserPublic) {
    if (!patchUserRowById) return;
    patchUserRowById(user.id, workspaceVisualsFromAuthUser(user));
  }

  function syncPfpToAuthBackend(pfp: string) {
    const id = currentUser.value?.id;
    if (!id) return;
    saveLocalProfile(id, { pfp });
    if (authSession.backendUser?.id === id) {
      authSession.backendUser.pfp = pfp;
    }
    patchWorkspaceUser({ pfp });
  }

  function syncBannerToAuthBackend() {
    const id = currentUser.value?.id;
    if (!id || authSession.backendUser?.id !== id) return;
    const patch: LocalProfilePatch = {
      bannerImage: form.bannerImage || undefined,
      bannerColor: form.bannerColor,
      bannerRefractionEnabled: form.bannerRefractionEnabled,
      bannerBlurEnabled: form.bannerBlurEnabled,
      bannerBlackoutEnabled: form.bannerBlackoutEnabled,
      bannerPositionY: form.bannerPositionY,
    };
    saveLocalProfile(id, patch);
    authSession.backendUser.bannerImage = form.bannerImage || undefined;
    authSession.backendUser.bannerColor = form.bannerColor;
    authSession.backendUser.bannerRefractionEnabled =
      form.bannerRefractionEnabled;
    authSession.backendUser.bannerBlurEnabled = form.bannerBlurEnabled;
    authSession.backendUser.bannerBlackoutEnabled = form.bannerBlackoutEnabled;
    authSession.backendUser.bannerPositionY = form.bannerPositionY;
    patchWorkspaceUser(patch);
  }

  const isEditingName = ref(false);
  const isEditingUsername = ref(false);
  const isEditingBio = ref(false);
  const isProfileLocked = ref(true);
  /** Last server-known branding URLs — avoids re-submitting legacy/default pfps that fail stored-media validation. */
  const serverBaselinePfp = ref('');
  const serverBaselineBannerImage = ref('');

  function trimBranding(s: string | undefined | null): string {
    return (s ?? '').trim();
  }

  function emitProfileSaveFailure(err: unknown, fallback: string): void {
    const fromAuth = err instanceof AuthApiError ? err.message.trim() : '';
    const fromExtract = extractUploadErrorMessage(err);
    const msg = fromAuth || fromExtract || fallback;
    UIErrorBus.emit({
      context: 'settings.profile_save',
      severity: 'error',
      userMessage: msg,
    });
    dispatchAppToast(msg, 'warning');
  }

  watch(
    () => ({
      locked: isProfileLocked.value,
      uid: authSession.backendUser?.id,
      cuId: currentUser.value?.id,
      pfp: authSession.backendUser?.pfp,
      bannerImage: authSession.backendUser?.bannerImage,
    }),
    (st) => {
      if (!st.uid || st.uid !== st.cuId || !st.locked) return;
      const auth = authSession.backendUser;
      if (!auth) return;
      serverBaselinePfp.value = auth.pfp ?? '';
      serverBaselineBannerImage.value = auth.bannerImage ?? '';
    },
    { immediate: true },
  );

  /** Serializes PATCH /me so rapid banner effect toggles cannot apply stale responses. */
  let profilePersistTail: Promise<boolean> = Promise.resolve(true);
  const bannerEffectsPersisting = ref(false);
  let bannerEffectsPersistInFlight = 0;

  function trackBannerEffectsPersist<T>(promise: Promise<T>): Promise<T> {
    bannerEffectsPersistInFlight++;
    bannerEffectsPersisting.value = true;
    return promise.finally(() => {
      bannerEffectsPersistInFlight--;
      bannerEffectsPersisting.value = bannerEffectsPersistInFlight > 0;
    });
  }

  async function persistProfileToServer(): Promise<boolean> {
    const execute = async (): Promise<boolean> => {
      const u = currentUser.value;
      if (!u?.id) return false;

      const usernameTrim = form.username.trim();
      let normalizedUsername: string | undefined;
      if (usernameTrim.length > 0) {
        const vr = validateRegistrationUsername(form.username);
        if (!vr.ok) {
          const msg =
            describeEchoUsernameFieldIssue(form.username) ??
            'Username is not valid. Fix it before saving.';
          UIErrorBus.emit({
            context: 'settings.profile_username',
            severity: 'error',
            userMessage: msg,
          });
          dispatchAppToast(msg, 'warning');
          return false;
        }
        normalizedUsername = vr.normalizedUsername;
      }

      const patch: AuthPatchMeBody = {};

      const displayTrim = form.displayName.trim();
      if (displayTrim.length > 0) {
        patch.displayName = displayTrim;
      }
      if (normalizedUsername !== undefined) {
        patch.username = normalizedUsername;
      }
      patch.customStatus = form.customStatus.trim().slice(0, 140);
      patch.bio = form.bio.trim().slice(0, 280);

      patch.bannerColor = form.bannerColor;
      patch.bannerRefractionEnabled = form.bannerRefractionEnabled;
      patch.bannerBlurEnabled = form.bannerBlurEnabled;
      patch.bannerBlackoutEnabled = form.bannerBlackoutEnabled;
      patch.bannerPositionY = form.bannerPositionY;

      const authId = authSession.backendUser?.id;
      const auth = authSession.backendUser;
      const useBrandingDiff =
        authSession.isAuthenticated &&
        authId &&
        authId === u.id &&
        auth &&
        !echoSyncCapabilities.isMockDataMode;

      if (useBrandingDiff) {
        if (trimBranding(form.pfp) !== trimBranding(serverBaselinePfp.value)) {
          const t = trimBranding(form.pfp);
          patch.pfp = t.length === 0 ? '' : form.pfp;
        }
        if (
          trimBranding(form.bannerImage) !==
          trimBranding(serverBaselineBannerImage.value)
        ) {
          const t = trimBranding(form.bannerImage);
          patch.bannerImage = t.length === 0 ? '' : form.bannerImage;
        }
      } else {
        patch.pfp = form.pfp || undefined;
        patch.bannerImage = form.bannerImage || undefined;
      }

      /** Only PATCH when the row being edited is the logged-in account (avoid saving mock u1 onto a real user). */
      if (
        authSession.isAuthenticated &&
        authId &&
        authId === u.id &&
        !echoSyncCapabilities.isMockDataMode
      ) {
        try {
          const { user } = await authPatchMe(patch);
          if (authSession.backendUser)
            Object.assign(authSession.backendUser, user);
          overwriteLocalProfileFromAuthUser(user);
          syncWorkspaceFromAuthUser(user);
          syncBioToLocalAndWorkspace();
          serverBaselinePfp.value = user.pfp ?? '';
          serverBaselineBannerImage.value = user.bannerImage ?? '';
          applyAuthUserToForm(user);
          syncCurrentUserFromAuthUser(user);
          return true;
        } catch (e) {
          emitProfileSaveFailure(
            e,
            'Could not save profile. Your changes may not sync to other devices.',
          );
          return false;
        }
      }
      saveLocalProfile(u.id, {
        pfp: patch.pfp,
        bio: patch.bio,
        bannerImage: patch.bannerImage,
        bannerColor: patch.bannerColor,
        bannerRefractionEnabled: patch.bannerRefractionEnabled,
        bannerBlurEnabled: patch.bannerBlurEnabled,
        bannerBlackoutEnabled: patch.bannerBlackoutEnabled,
        bannerPositionY: patch.bannerPositionY,
      });
      const rowPatch = Object.fromEntries(
        Object.entries({
          pfp: patch.pfp,
          bio: patch.bio,
          bannerImage: patch.bannerImage,
          bannerColor: patch.bannerColor,
          bannerRefractionEnabled: patch.bannerRefractionEnabled,
          bannerBlurEnabled: patch.bannerBlurEnabled,
          bannerBlackoutEnabled: patch.bannerBlackoutEnabled,
          bannerPositionY: patch.bannerPositionY,
        }).filter(([, v]) => v !== undefined),
      ) as LocalProfilePatch;
      if (Object.keys(rowPatch).length > 0) patchWorkspaceUser(rowPatch);
      syncBioToLocalAndWorkspace();
      return true;
    };

    const result = profilePersistTail.then(execute, execute);
    profilePersistTail = result.then(
      () => true,
      () => false,
    );
    return result;
  }

  function syncBioToLocalAndWorkspace() {
    const id = currentUser.value?.id;
    if (!id) return;
    const bio = form.bio.trim().slice(0, 280);
    saveLocalProfile(id, { bio });
    patchWorkspaceUser({ bio });
    if (currentUser.value) {
      (currentUser.value as { bio?: string }).bio = bio;
    }
  }
  const profileCardRef = ref<HTMLElement | null>(null);
  const showResetConfirm = ref(false);
  const profileEditSnapshot = ref<ProfileEditSnapshot | null>(null);
  const bannerEditSnapshot = ref<{
    bannerImage?: string;
    bannerColor?: string;
    bannerRefractionEnabled: boolean;
    bannerBlurEnabled: boolean;
    bannerBlackoutEnabled: boolean;
    pfp?: string;
  } | null>(null);
  const discordImportBusy = ref(false);
  const discordImportError = ref('');
  const discordLinked = ref(false);
  const discordImportEnabled = ref(false);

  const discordProfileImportRecommended = computed(() => {
    const user = authSession.backendUser;
    if (!shouldOfferDiscordProfileImport(user)) return false;
    // Once an account has been around for more than a day we stop nudging the
    // import button on the main Profile tab. The Discord settings tab still
    // exposes the same action for users who want it later.
    if (isAccountOlderThanOneDay(user)) return false;
    return true;
  });

  const usernameFieldIssue = computed(() =>
    describeEchoUsernameFieldIssue(form.username),
  );

  function applyAuthUserToForm(user: AuthUserPublic) {
    form.displayName = sessionUserDisplayName(user.displayName, user.username);
    form.username = user.username;
    form.pfp = user.pfp ?? '';
    form.customStatus = user.customStatus ?? '';
    form.bio = user.bio?.trim() ?? '';
    form.bannerImage = user.bannerImage ?? '';
    form.bannerColor = normalizeBannerColorForForm(user.bannerColor);
    form.bannerRefractionEnabled = user.bannerRefractionEnabled ?? false;
    form.bannerBlurEnabled = user.bannerBlurEnabled ?? false;
    form.bannerBlackoutEnabled = user.bannerBlackoutEnabled ?? false;
    form.bannerPositionY =
      typeof user.bannerPositionY === 'number' &&
      Number.isFinite(user.bannerPositionY)
        ? Math.max(0, Math.min(100, user.bannerPositionY))
        : 50;
    serverBaselinePfp.value = user.pfp ?? '';
    serverBaselineBannerImage.value = user.bannerImage ?? '';
  }

  function syncCurrentUserFromAuthUser(user: AuthUserPublic) {
    if (!currentUser.value || currentUser.value.id !== user.id) return;
    currentUser.value.name = sessionUserDisplayName(
      user.displayName,
      user.username,
    );
    applyProfilePatch(currentUser.value, {
      pfp: user.pfp ?? '',
      bio: user.bio ?? '',
      bannerImage: user.bannerImage,
      bannerColor: normalizeBannerColorForForm(user.bannerColor),
      bannerRefractionEnabled: user.bannerRefractionEnabled,
      bannerBlurEnabled: user.bannerBlurEnabled,
      bannerBlackoutEnabled: user.bannerBlackoutEnabled,
      bannerPositionY: user.bannerPositionY,
    });
  }

  async function refreshDiscordImportState() {
    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode) {
      discordImportEnabled.value = false;
      discordLinked.value = false;
      return;
    }
    discordImportEnabled.value = true;
    try {
      const state = await fetchMeDiscord();
      discordLinked.value = state.linked === true;
    } catch {
      discordLinked.value = false;
    }
  }

  async function importProfileFromDiscord() {
    if (discordImportBusy.value) return;
    if (!authSession.isAuthenticated || echoSyncCapabilities.isMockDataMode)
      return;
    discordImportError.value = '';
    discordImportBusy.value = true;
    try {
      const r = await runDiscordProfileImportFlow();
      if (r.kind === 'oauth_redirect') {
        startOAuthFlow(r.authorizeUrl);
        return;
      }
      if (r.kind === 'error') {
        discordImportError.value = r.message;
        return;
      }
      if (r.kind === 'empty_patch') {
        discordImportError.value =
          'Your Discord profile does not have importable fields yet.';
        return;
      }
      const { user } = r;
      authSession.applyRestoredProfile(user);
      syncWorkspaceFromAuthUser(user);
      applyAuthUserToForm(user);
      syncCurrentUserFromAuthUser(user);
      markDiscordProfileImportPromptDone();
    } catch (err) {
      discordImportError.value =
        err instanceof Error
          ? err.message
          : 'Could not import your Discord profile right now.';
    } finally {
      discordImportBusy.value = false;
    }
  }

  async function toggleEdit() {
    const nextLocked = !isProfileLocked.value;
    if (!nextLocked && currentUser.value) {
      const auth = authSession.backendUser;
      if (auth?.id === currentUser.value.id) {
        serverBaselinePfp.value = auth.pfp ?? '';
        serverBaselineBannerImage.value = auth.bannerImage ?? '';
      }
      bannerEditSnapshot.value = {
        bannerImage: currentUser.value.bannerImage,
        bannerColor: normalizeBannerColorForForm(currentUser.value.bannerColor),
        bannerRefractionEnabled:
          currentUser.value.bannerRefractionEnabled ?? false,
        bannerBlurEnabled: currentUser.value.bannerBlurEnabled ?? false,
        bannerBlackoutEnabled: currentUser.value.bannerBlackoutEnabled ?? false,
        pfp: currentUser.value.pfp,
      };
      profileEditSnapshot.value = {
        displayName: form.displayName,
        username: form.username,
        customStatus: form.customStatus,
        bio: form.bio,
        pfp: form.pfp || '',
        bannerImage: form.bannerImage || '',
        bannerColor: form.bannerColor,
        bannerRefractionEnabled: form.bannerRefractionEnabled,
        bannerBlurEnabled: form.bannerBlurEnabled,
        bannerBlackoutEnabled: form.bannerBlackoutEnabled,
        bannerPositionY: form.bannerPositionY,
      };
    }
    if (nextLocked && currentUser.value) {
      const issue = usernameFieldIssue.value;
      if (issue) {
        UIErrorBus.emit({
          context: 'settings.profile_username',
          severity: 'error',
          userMessage: issue,
        });
        dispatchAppToast(issue, 'warning');
        return;
      }
      const u = currentUser.value;
      const nextPfp = form.pfp || u.pfp || '';
      applyProfilePatch(u, {
        bannerImage: form.bannerImage || undefined,
        bannerColor: form.bannerColor,
        bannerRefractionEnabled: form.bannerRefractionEnabled,
        bannerBlurEnabled: form.bannerBlurEnabled,
        bannerBlackoutEnabled: form.bannerBlackoutEnabled,
        pfp: nextPfp,
      });
      bannerEditSnapshot.value = null;
      profileEditSnapshot.value = null;
      const saved = await persistProfileToServer();
      if (!saved) {
        const auth = authSession.backendUser;
        if (auth?.id === u.id) {
          applyAuthUserToForm(auth);
          syncCurrentUserFromAuthUser(auth);
        }
        return;
      }
    }
    isProfileLocked.value = nextLocked;
    isEditingName.value = false;
    isEditingUsername.value = false;
    isEditingBio.value = false;
  }

  function handleReset() {
    showResetConfirm.value = true;
  }

  function confirmReset() {
    const snap = profileEditSnapshot.value;
    if (!snap) {
      showResetConfirm.value = false;
      return;
    }
    const revertPfp =
      bannerEditSnapshot.value?.pfp ?? currentUser.value?.pfp ?? '';
    form.displayName = snap.displayName;
    form.username = snap.username;
    form.customStatus = snap.customStatus;
    form.bio = snap.bio;
    form.bannerColor = snap.bannerColor;
    form.bannerImage = snap.bannerImage;
    form.bannerRefractionEnabled = snap.bannerRefractionEnabled;
    form.bannerBlurEnabled = snap.bannerBlurEnabled;
    form.bannerBlackoutEnabled = snap.bannerBlackoutEnabled;
    form.bannerPositionY = snap.bannerPositionY;
    form.pfp = snap.pfp || revertPfp;
    if (currentUser.value) {
      (currentUser.value as { bio?: string }).bio = snap.bio;
      applyProfilePatch(currentUser.value, {
        bannerImage: snap.bannerImage || undefined,
        bannerColor: snap.bannerColor,
        bannerRefractionEnabled: snap.bannerRefractionEnabled,
        bannerBlurEnabled: snap.bannerBlurEnabled,
        bannerBlackoutEnabled: snap.bannerBlackoutEnabled,
        bannerPositionY: snap.bannerPositionY,
        pfp: snap.pfp || revertPfp,
      });
      syncPfpToAuthBackend(snap.pfp || revertPfp);
      syncBannerToAuthBackend();
    }
    bannerEditSnapshot.value = null;
    profileEditSnapshot.value = null;
    showResetConfirm.value = false;
    isProfileLocked.value = true;
    isEditingName.value = false;
    isEditingUsername.value = false;
    isEditingBio.value = false;

    const uid = currentUser.value?.id;
    if (uid) {
      syncBioToLocalAndWorkspace();
      const resetPatch = {
        pfp: snap.pfp || revertPfp,
        bio: snap.bio,
        bannerImage: snap.bannerImage,
        bannerColor: snap.bannerColor,
        bannerRefractionEnabled: snap.bannerRefractionEnabled,
        bannerBlurEnabled: snap.bannerBlurEnabled,
        bannerBlackoutEnabled: snap.bannerBlackoutEnabled,
        bannerPositionY: snap.bannerPositionY,
      };
      // Reset means "discard unsaved edits", not "push defaults to server".
      // Restore local/session mirrors to the snapshot we started editing from.
      saveLocalProfile(uid, resetPatch);
      patchWorkspaceUser(resetPatch);
      if (authSession.backendUser?.id === uid) {
        authSession.backendUser.pfp = resetPatch.pfp;
        authSession.backendUser.bio = resetPatch.bio;
        authSession.backendUser.bannerImage =
          resetPatch.bannerImage || undefined;
        authSession.backendUser.bannerColor = resetPatch.bannerColor;
        authSession.backendUser.bannerRefractionEnabled =
          resetPatch.bannerRefractionEnabled;
        authSession.backendUser.bannerBlurEnabled =
          resetPatch.bannerBlurEnabled;
        authSession.backendUser.bannerBlackoutEnabled =
          resetPatch.bannerBlackoutEnabled;
        authSession.backendUser.bannerPositionY = resetPatch.bannerPositionY;
      }
    }
  }

  function closeFieldEditors() {
    isEditingName.value = false;
    isEditingUsername.value = false;
    isEditingBio.value = false;
  }

  function startEditingName() {
    if (isProfileLocked.value) return;
    isEditingName.value = true;
    isEditingUsername.value = false;
    isEditingBio.value = false;
    void nextTick();
  }
  function startEditingUsername() {
    if (isProfileLocked.value) return;
    isEditingUsername.value = true;
    isEditingName.value = false;
    isEditingBio.value = false;
    void nextTick();
  }
  function startEditingBio() {
    if (isProfileLocked.value) return;
    isEditingBio.value = true;
    isEditingName.value = false;
    isEditingUsername.value = false;
    void nextTick();
  }

  async function onBannerFileChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!isValidBrandingImageFile(file)) return;
    if (input) input.value = '';
    try {
      form.bannerImage =
        !echoSyncCapabilities.isMockDataMode && authSession.isAuthenticated
          ? await uploadBrandingAssetWithInlineFallback({
              file,
              upload: () =>
                uploadUserProfileBrandingFile('', 'user_banner', file),
            })
          : await readBlobAsDataUrl(file);
      syncBannerToAuthBackend();
      void persistProfileToServer();
    } catch (e) {
      const detail = extractUploadErrorMessage(e);
      dispatchAppToast(
        detail
          ? `Could not upload profile banner: ${detail}`
          : 'Could not upload profile banner.',
        'warning',
      );
    }
  }

  function removeBannerImage() {
    if (isProfileLocked.value) return;
    if (!String(form.bannerImage ?? '').trim()) return;
    form.bannerImage = '';
    form.bannerPositionY = 50;
    syncBannerToAuthBackend();
    void persistProfileToServer();
  }

  async function applyBannerGradientFromAvatarSource(
    source: File | Blob | string,
  ) {
    if (
      typeof source !== 'string' &&
      'type' in source &&
      source.type &&
      !source.type.startsWith('image/')
    ) {
      return;
    }
    try {
      form.bannerColor =
        await deriveProfileBannerGradientFromImageSource(source);
    } catch {
      /* keep existing bannerColor */
    }
  }

  async function onAvatarFileChange(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!isValidBrandingImageFile(file)) return;
    if (input) input.value = '';
    try {
      form.pfp =
        !echoSyncCapabilities.isMockDataMode && authSession.isAuthenticated
          ? await uploadBrandingAssetWithInlineFallback({
              file,
              upload: () =>
                uploadUserProfileBrandingFile('', 'user_avatar', file),
            })
          : await readBlobAsDataUrl(file);
      await applyBannerGradientFromAvatarSource(file);
      syncPfpToAuthBackend(form.pfp);
      void persistProfileToServer();
    } catch (e) {
      const detail = extractUploadErrorMessage(e);
      dispatchAppToast(
        detail
          ? `Could not upload profile photo: ${detail}`
          : 'Could not upload profile photo.',
        'warning',
      );
    }
  }

  /** Banner refraction lives outside “Edit Profile”; toggling while locked must PATCH + sync session + local cache. */
  function toggleAndPersistBannerRefraction() {
    form.bannerRefractionEnabled = !form.bannerRefractionEnabled;
    if (!currentUser.value) return;
    syncBannerToAuthBackend();
    void trackBannerEffectsPersist(persistProfileToServer());
  }

  function toggleAndPersistBannerBlur() {
    form.bannerBlurEnabled = !form.bannerBlurEnabled;
    if (!currentUser.value) return;
    syncBannerToAuthBackend();
    void trackBannerEffectsPersist(persistProfileToServer());
  }

  function toggleAndPersistBannerBlackout() {
    form.bannerBlackoutEnabled = !form.bannerBlackoutEnabled;
    if (!currentUser.value) return;
    syncBannerToAuthBackend();
    void trackBannerEffectsPersist(persistProfileToServer());
  }

  function onDocumentPointerDown(e: PointerEvent) {
    if (isProfileLocked.value) return;
    const el = profileCardRef.value;
    const target = e.target as Node | null;
    if (!el || !target) return;
    if (!el.contains(target)) closeFieldEditors();
  }

  watch(
    () => form.pfp,
    () => {
      if (!currentUser.value) return;
      if (isProfileLocked.value) return;
      applyProfilePatch(currentUser.value, { pfp: form.pfp });
      syncPfpToAuthBackend(form.pfp);
    },
  );

  watch(
    () =>
      [
        form.bannerImage,
        form.bannerColor,
        form.bannerRefractionEnabled,
        form.bannerBlurEnabled,
        form.bannerBlackoutEnabled,
        form.bannerPositionY,
      ] as const,
    () => {
      if (!currentUser.value) return;
      if (isProfileLocked.value) {
        applyProfilePatch(currentUser.value, {
          bannerRefractionEnabled: form.bannerRefractionEnabled,
          bannerBlurEnabled: form.bannerBlurEnabled,
          bannerBlackoutEnabled: form.bannerBlackoutEnabled,
        });
        return;
      }
      applyProfilePatch(currentUser.value, {
        bannerImage: form.bannerImage || undefined,
        bannerColor: form.bannerColor,
        bannerRefractionEnabled: form.bannerRefractionEnabled,
        bannerBlurEnabled: form.bannerBlurEnabled,
        bannerBlackoutEnabled: form.bannerBlackoutEnabled,
        bannerPositionY: form.bannerPositionY,
      });
      syncBannerToAuthBackend();
    },
  );

  watch(
    () => authSession.isAuthenticated,
    () => {
      void refreshDiscordImportState();
    },
    { immediate: true },
  );

  return {
    usernameFieldIssue,
    isEditingName,
    isEditingUsername,
    isEditingBio,
    isProfileLocked,
    profileCardRef,
    showResetConfirm,
    bannerEditSnapshot,
    toggleEdit,
    handleReset,
    confirmReset,
    closeFieldEditors,
    startEditingName,
    startEditingUsername,
    startEditingBio,
    onBannerFileChange,
    removeBannerImage,
    onAvatarFileChange,
    onDocumentPointerDown,
    bannerEffectsPersisting,
    toggleAndPersistBannerRefraction,
    toggleAndPersistBannerBlur,
    toggleAndPersistBannerBlackout,
    discordImportBusy,
    discordImportError,
    discordLinked,
    discordImportEnabled,
    discordProfileImportRecommended,
    importProfileFromDiscord,
    syncBannerToAuthBackend,
    persistProfileToServer,
  };
}
