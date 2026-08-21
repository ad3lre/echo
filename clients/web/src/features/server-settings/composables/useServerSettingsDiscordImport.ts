import { computed, ref, watch, type Ref } from 'vue';
import { useAuthSessionStore } from '@/features/auth/authSession';
import {
  fetchEchoDiscordImportState,
  postEchoDiscordImportRefreshFromExport,
  postEchoDiscordImportStep,
  type EchoDiscordImportState,
} from '@/api/echoClient';
import { dispatchAppToastDetail } from '@/features/layout/failures/controllerMissingAction';

export function useServerSettingsDiscordImport(options: {
  serverId: Ref<string>;
  canManageServer: Ref<boolean>;
  onWorkspaceRefresh?: () => void | Promise<void>;
}) {
  const { serverId, canManageServer, onWorkspaceRefresh } = options;
  const authSession = useAuthSessionStore();

  const state = ref<EchoDiscordImportState | null>(null);
  const loading = ref(false);
  const activeStep = ref<'metadata' | 'roles' | 'members' | 'channels' | null>(
    null,
  );
  const refreshFromExportBusy = ref(false);
  const localError = ref('');

  const metadataReady = computed(() => state.value?.metadataImported === true);
  const rolesReady = computed(() => state.value?.rolesImported === true);
  const membersReady = computed(() => state.value?.membersImported === true);
  const channelsReady = computed(() => state.value?.channelsImported === true);

  async function refreshState() {
    const token = authSession.accessToken?.trim() ?? '';
    if (
      !authSession.isAuthenticated ||
      !serverId.value ||
      !canManageServer.value
    ) {
      state.value = null;
      loading.value = false;
      localError.value = '';
      return;
    }
    loading.value = true;
    try {
      const result = await fetchEchoDiscordImportState(token, serverId.value);
      state.value = result.state;
      localError.value = '';
    } catch (error) {
      state.value = null;
      localError.value =
        error instanceof Error
          ? error.message
          : 'We couldn’t load import status. Try again in a moment.';
    } finally {
      loading.value = false;
    }
  }

  async function runStep(step: 'metadata' | 'roles' | 'members' | 'channels') {
    const token = authSession.accessToken?.trim() ?? '';
    if (
      !authSession.isAuthenticated ||
      activeStep.value ||
      !canManageServer.value
    ) {
      return;
    }
    activeStep.value = step;
    localError.value = '';
    try {
      let opts = undefined as { force?: boolean } | undefined;
      if (step === 'channels') {
        const confirmed = window.confirm(
          'Importing channels will replace existing categories/channels. This will remove existing channel messages. Continue?',
        );
        if (!confirmed) {
          activeStep.value = null;
          return;
        }
        opts = { force: true };
      }
      const result = await postEchoDiscordImportStep(
        token,
        serverId.value,
        step,
        opts,
      );
      state.value = result.state;
      await onWorkspaceRefresh?.();
    } catch (error) {
      await refreshState();
      const msg =
        error instanceof Error
          ? error.message
          : 'Something went wrong during import. Try again.';
      localError.value = msg;
      dispatchAppToastDetail({
        message: msg,
        severity: 'error',
        durationMs: 7200,
      });
    } finally {
      activeStep.value = null;
    }
  }

  async function refreshFromExport() {
    const token = authSession.accessToken?.trim() ?? '';
    if (
      !authSession.isAuthenticated ||
      refreshFromExportBusy.value ||
      activeStep.value ||
      !canManageServer.value
    ) {
      return;
    }
    if (!channelsReady.value) {
      localError.value =
        'Finish importing channels first, then you can refresh from the latest export.';
      return;
    }
    const confirmed = window.confirm(
      'Refresh from the latest Discord export on disk? This updates server name, icon, banner, and the imported emoji pack, then replaces all categories and channels to match the export. All messages in server channels will be removed. Continue?',
    );
    if (!confirmed) return;
    refreshFromExportBusy.value = true;
    localError.value = '';
    try {
      const result = await postEchoDiscordImportRefreshFromExport(
        token,
        serverId.value,
      );
      state.value = result.state;
      await onWorkspaceRefresh?.();
    } catch (error) {
      await refreshState();
      const msg =
        error instanceof Error
          ? error.message
          : 'Refresh from export failed. Try again.';
      localError.value = msg;
      dispatchAppToastDetail({
        message: msg,
        severity: 'error',
        durationMs: 7200,
      });
    } finally {
      refreshFromExportBusy.value = false;
    }
  }

  watch(
    () =>
      [
        serverId.value,
        canManageServer.value,
        authSession.isAuthenticated,
      ] as const,
    () => {
      void refreshState();
    },
    { immediate: true },
  );

  return {
    state,
    loading,
    activeStep,
    refreshFromExportBusy,
    localError,
    metadataReady,
    rolesReady,
    membersReady,
    channelsReady,
    refreshState,
    runStep,
    refreshFromExport,
  };
}
