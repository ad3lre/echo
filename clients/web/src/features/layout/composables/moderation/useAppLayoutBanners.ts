import { ref, watch, onUnmounted } from 'vue';
import type { WorkspaceStateApi } from '@/features/layout/echoWorkspace/useEchoWorkspace';

export function useAppLayoutBanners(workspace: WorkspaceStateApi) {
  const showApiFetchErrorBanner = ref(false);
  let apiFetchErrorHideTimer: ReturnType<typeof setTimeout> | null = null;

  watch(
    () => workspace.apiError.value,
    (msg) => {
      if (apiFetchErrorHideTimer) {
        clearTimeout(apiFetchErrorHideTimer);
        apiFetchErrorHideTimer = null;
      }
      if (!msg) {
        showApiFetchErrorBanner.value = false;
        return;
      }
      showApiFetchErrorBanner.value = true;
      apiFetchErrorHideTimer = setTimeout(() => {
        showApiFetchErrorBanner.value = false;
        apiFetchErrorHideTimer = null;
      }, 3000);
    },
  );

  onUnmounted(() => {
    if (apiFetchErrorHideTimer) clearTimeout(apiFetchErrorHideTimer);
  });

  return { showApiFetchErrorBanner };
}
