import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { EchoBannedWordsConfig } from '@shared/types/bannedWords';
import { defaultBannedWordsConfig } from '@shared/types/bannedWords';
import {
  fetchEchoBannedWordsConfig,
  updateEchoBannedWordsConfig,
} from '@/api/echo/bannedWords';
import { EchoApiError } from '@/api/echo/transport';
import { isEchoGraphId } from '@/features/layout/ids/echoIds';

export const useServerBannedWordsStore = defineStore(
  'serverBannedWords',
  () => {
    const configByServer = shallowRef<Record<string, EchoBannedWordsConfig>>(
      {},
    );
    const loadingServerId = ref<string | null>(null);
    const saving = ref(false);
    const lastError = ref<string | null>(null);

    function configFor(serverId: string): EchoBannedWordsConfig {
      return (
        configByServer.value[serverId] ?? defaultBannedWordsConfig(serverId)
      );
    }

    async function load(serverId: string, _token: string): Promise<void> {
      lastError.value = null;
      if (!serverId || !isEchoGraphId(serverId)) return;
      loadingServerId.value = serverId;
      try {
        const { config } = await fetchEchoBannedWordsConfig('', serverId);
        configByServer.value = {
          ...configByServer.value,
          [serverId]: config,
        };
      } catch (e) {
        lastError.value =
          e instanceof EchoApiError
            ? e.message
            : 'Failed to load banned words config';
        throw e;
      } finally {
        if (loadingServerId.value === serverId) loadingServerId.value = null;
      }
    }

    async function save(
      serverId: string,
      _token: string,
      body: Partial<EchoBannedWordsConfig>,
    ): Promise<EchoBannedWordsConfig> {
      lastError.value = null;
      saving.value = true;
      try {
        const { config } = await updateEchoBannedWordsConfig(
          '',
          serverId,
          body,
        );
        configByServer.value = {
          ...configByServer.value,
          [serverId]: config,
        };
        return config;
      } catch (e) {
        lastError.value =
          e instanceof EchoApiError
            ? e.message
            : 'Failed to save banned words config';
        throw e;
      } finally {
        saving.value = false;
      }
    }

    return {
      configByServer,
      loadingServerId,
      saving,
      lastError,
      configFor,
      load,
      save,
    };
  },
);
