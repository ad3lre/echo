import type { Ref } from 'vue';
import { uploadServerBrandingFile } from '@/api/echoClient';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  ECHO_BRANDING_UPLOAD_MAX_BYTES,
  extractUploadErrorMessage,
  isValidBrandingImageFile,
} from '@/features/server-settings/domain/brandingUploads';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import {
  readBlobAsDataUrl,
  uploadBrandingAssetWithInlineFallback,
} from '@/features/server-settings/brandingUploadFallback';
import { useAuthSessionStore } from '@/features/auth/authSession';

interface UseServerBrandingUploadsOptions {
  serverId: Ref<string | undefined>;
  bannerPreviewUrl: Ref<string>;
  iconPreviewUrl: Ref<string>;
  getServerBannerImageUrl: (id: string) => string;
  getServerIconImageUrl: (id: string) => string;
  applyServerBannerImageUrl: (id: string, url: string) => void;
  applyServerIconImageUrl: (id: string, url: string) => void;
  commitServerBannerImageUrl: (
    id: string,
    url: string,
    prevUrl: string,
  ) => void | Promise<void>;
  commitServerIconImageUrl: (
    id: string,
    url: string,
    prevUrl: string,
  ) => void | Promise<void>;
}

function revokeBlobUrl(url: string | null | undefined) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

export function useServerBrandingUploads(
  options: UseServerBrandingUploadsOptions,
) {
  const {
    serverId,
    bannerPreviewUrl,
    iconPreviewUrl,
    getServerBannerImageUrl,
    getServerIconImageUrl,
    applyServerBannerImageUrl,
    applyServerIconImageUrl,
    commitServerBannerImageUrl,
    commitServerIconImageUrl,
  } = options;

  const authSession = useAuthSessionStore();
  let bannerUploadGen = 0;
  let iconUploadGen = 0;
  let activeBannerBlobUrl: string | null = null;
  let activeIconBlobUrl: string | null = null;

  function cancelBrandingUploadPreviews() {
    bannerUploadGen++;
    iconUploadGen++;
    revokeBlobUrl(activeBannerBlobUrl);
    revokeBlobUrl(activeIconBlobUrl);
    activeBannerBlobUrl = null;
    activeIconBlobUrl = null;
  }

  function rollbackBannerIfStill(
    sid: string,
    blobUrl: string,
    prevBanner: string,
  ) {
    if (getServerBannerImageUrl(sid) === blobUrl) {
      applyServerBannerImageUrl(sid, prevBanner);
    }
  }

  function rollbackIconIfStill(sid: string, blobUrl: string, prevIcon: string) {
    if (getServerIconImageUrl(sid) === blobUrl) {
      applyServerIconImageUrl(sid, prevIcon);
    }
  }

  async function onServerBannerFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const bannerTooLarge = file.size > ECHO_BRANDING_UPLOAD_MAX_BYTES;
    if (!isValidBrandingImageFile(file)) {
      dispatchAppToast(
        bannerTooLarge
          ? 'Server banner must be 25 MiB or smaller.'
          : 'Server banner must be an image file (PNG, JPEG, WebP, or GIF).',
        'warning',
      );
      input.value = '';
      return;
    }
    if (!serverId.value) return;
    input.value = '';

    const sid = serverId.value;
    const gen = ++bannerUploadGen;
    const prevBanner = getServerBannerImageUrl(sid);

    revokeBlobUrl(activeBannerBlobUrl);
    const blobUrl = URL.createObjectURL(file);
    activeBannerBlobUrl = blobUrl;
    bannerPreviewUrl.value = blobUrl;
    applyServerBannerImageUrl(sid, blobUrl);

    const token = authSession.accessToken ?? '';
    let url = '';
    try {
      url =
        !echoSyncCapabilities.isMockDataMode && authSession.isAuthenticated
          ? await uploadBrandingAssetWithInlineFallback({
              file,
              upload: () =>
                uploadServerBrandingFile(token, sid, 'server_banner', file),
            })
          : await readBlobAsDataUrl(file);
    } catch (e) {
      const detail = extractUploadErrorMessage(e);
      dispatchAppToast(
        detail
          ? `Could not upload server banner: ${detail}`
          : 'Could not upload server banner.',
        'warning',
      );
    }

    const stale = serverId.value !== sid || gen !== bannerUploadGen;
    if (stale) {
      rollbackBannerIfStill(sid, blobUrl, prevBanner);
      if (gen === bannerUploadGen) {
        bannerPreviewUrl.value = '';
      }
      if (activeBannerBlobUrl === blobUrl) {
        revokeBlobUrl(blobUrl);
        activeBannerBlobUrl = null;
      }
      return;
    }

    if (!url) {
      rollbackBannerIfStill(sid, blobUrl, prevBanner);
      bannerPreviewUrl.value = '';
      revokeBlobUrl(blobUrl);
      activeBannerBlobUrl = null;
      return;
    }

    bannerPreviewUrl.value = '';
    revokeBlobUrl(blobUrl);
    activeBannerBlobUrl = null;
    applyServerBannerImageUrl(sid, url);
    try {
      await commitServerBannerImageUrl(sid, url, prevBanner);
    } catch {
      /* commit handler rolls back + toasts */
    }
  }

  async function onServerIconFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const iconTooLarge = file.size > ECHO_BRANDING_UPLOAD_MAX_BYTES;
    if (!isValidBrandingImageFile(file)) {
      dispatchAppToast(
        iconTooLarge
          ? 'Server icon must be 25 MiB or smaller.'
          : 'Server icon must be an image file (PNG, JPEG, WebP, or GIF).',
        'warning',
      );
      input.value = '';
      return;
    }
    if (!serverId.value) return;
    input.value = '';

    const sid = serverId.value;
    const gen = ++iconUploadGen;
    const prevIcon = getServerIconImageUrl(sid);

    revokeBlobUrl(activeIconBlobUrl);
    const blobUrl = URL.createObjectURL(file);
    activeIconBlobUrl = blobUrl;
    iconPreviewUrl.value = blobUrl;
    applyServerIconImageUrl(sid, blobUrl);

    const token = authSession.accessToken ?? '';
    let url = '';
    try {
      url =
        !echoSyncCapabilities.isMockDataMode && authSession.isAuthenticated
          ? await uploadBrandingAssetWithInlineFallback({
              file,
              upload: () =>
                uploadServerBrandingFile(token, sid, 'server_icon', file),
            })
          : await readBlobAsDataUrl(file);
    } catch (e) {
      const detail = extractUploadErrorMessage(e);
      dispatchAppToast(
        detail
          ? `Could not upload server icon: ${detail}`
          : 'Could not upload server icon.',
        'warning',
      );
    }

    const stale = serverId.value !== sid || gen !== iconUploadGen;
    if (stale) {
      rollbackIconIfStill(sid, blobUrl, prevIcon);
      if (gen === iconUploadGen) {
        iconPreviewUrl.value = '';
      }
      if (activeIconBlobUrl === blobUrl) {
        revokeBlobUrl(blobUrl);
        activeIconBlobUrl = null;
      }
      return;
    }

    if (!url) {
      rollbackIconIfStill(sid, blobUrl, prevIcon);
      iconPreviewUrl.value = '';
      revokeBlobUrl(blobUrl);
      activeIconBlobUrl = null;
      return;
    }

    iconPreviewUrl.value = '';
    revokeBlobUrl(blobUrl);
    activeIconBlobUrl = null;
    applyServerIconImageUrl(sid, url);
    try {
      await commitServerIconImageUrl(sid, url, prevIcon);
    } catch {
      /* commit handler rolls back + toasts */
    }
  }

  return {
    onServerBannerFileChange,
    onServerIconFileChange,
    cancelBrandingUploadPreviews,
  };
}
