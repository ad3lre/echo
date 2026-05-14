import type { Ref } from 'vue';
import { uploadServerBrandingFile } from '@/api/echoClient';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import {
  extractUploadErrorMessage,
  isValidBrandingImageFile,
} from '@/services/domain/brandingUploads';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import {
  readBlobAsDataUrl,
  uploadBrandingAssetWithInlineFallback,
} from '@/services/orchestration/brandingUploadFallback';
import { useAuthSessionStore } from '@/stores/authSession';

interface UseServerBrandingUploadsOptions {
  serverId: Ref<string | undefined>;
  bannerPreviewUrl: Ref<string>;
  iconPreviewUrl: Ref<string>;
  updateServerBannerImageUrl: (id: string, url: string) => void;
  updateServerImageUrl: (id: string, url: string) => void;
}

export function useServerBrandingUploads(
  options: UseServerBrandingUploadsOptions,
) {
  const {
    serverId,
    bannerPreviewUrl,
    iconPreviewUrl,
    updateServerBannerImageUrl,
    updateServerImageUrl,
  } = options;

  const authSession = useAuthSessionStore();
  async function onServerBannerFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!isValidBrandingImageFile(file)) return;
    if (!serverId.value) return;

    const token = authSession.accessToken ?? '';
    let url = '';
    try {
      url =
        !echoSyncCapabilities.isMockDataMode && authSession.isAuthenticated
          ? await uploadBrandingAssetWithInlineFallback({
              file,
              upload: () =>
                uploadServerBrandingFile(
                  token,
                  serverId.value!,
                  'server_banner',
                  file,
                ),
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
    if (!url) {
      input.value = '';
      return;
    }
    bannerPreviewUrl.value = url;
    updateServerBannerImageUrl(serverId.value, url);
    input.value = '';
  }

  async function onServerIconFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!isValidBrandingImageFile(file)) return;
    if (!serverId.value) return;

    const token = authSession.accessToken ?? '';
    let url = '';
    try {
      url =
        !echoSyncCapabilities.isMockDataMode && authSession.isAuthenticated
          ? await uploadBrandingAssetWithInlineFallback({
              file,
              upload: () =>
                uploadServerBrandingFile(
                  token,
                  serverId.value!,
                  'server_icon',
                  file,
                ),
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
    if (!url) {
      input.value = '';
      return;
    }
    iconPreviewUrl.value = url;
    updateServerImageUrl(serverId.value, url);
    input.value = '';
  }

  return {
    onServerBannerFileChange,
    onServerIconFileChange,
  };
}
