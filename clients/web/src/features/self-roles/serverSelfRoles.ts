import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type {
  EchoSelfRolesConfig,
  EchoSelfRolesPanel,
} from '@shared/types/selfAssignableRoles';
import {
  fetchEchoSelfRolesConfig,
  fetchEchoSelfRolesPanel,
  patchEchoSelfRolesConfig,
  postEchoSelfRoleToggle,
} from '@/api/echoClient';
import { EchoApiError } from '@/api/echo/transport';

export const useServerSelfRolesStore = defineStore('serverSelfRoles', () => {
  const configByServer = shallowRef<Record<string, EchoSelfRolesConfig>>({});
  const panelByServer = shallowRef<Record<string, EchoSelfRolesPanel>>({});
  const loading = ref(false);
  const mutating = ref(false);
  const lastError = ref<string | null>(null);

  function configFor(serverId: string): EchoSelfRolesConfig | undefined {
    return configByServer.value[serverId];
  }

  function panelFor(serverId: string): EchoSelfRolesPanel | undefined {
    return panelByServer.value[serverId];
  }

  async function loadConfig(serverId: string, token: string): Promise<void> {
    lastError.value = null;
    loading.value = true;
    try {
      const config = await fetchEchoSelfRolesConfig(token, serverId);
      configByServer.value = { ...configByServer.value, [serverId]: config };
    } catch (e) {
      if (e instanceof EchoApiError) lastError.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function saveConfig(
    serverId: string,
    token: string,
    updates: Partial<EchoSelfRolesConfig>,
  ): Promise<EchoSelfRolesConfig | null> {
    lastError.value = null;
    mutating.value = true;
    try {
      const config = await patchEchoSelfRolesConfig(token, serverId, updates);
      configByServer.value = { ...configByServer.value, [serverId]: config };
      return config;
    } catch (e) {
      if (e instanceof EchoApiError) lastError.value = e.message;
      return null;
    } finally {
      mutating.value = false;
    }
  }

  async function loadPanel(serverId: string, token: string): Promise<void> {
    lastError.value = null;
    try {
      const panel = await fetchEchoSelfRolesPanel(token, serverId);
      panelByServer.value = { ...panelByServer.value, [serverId]: panel };
    } catch (e) {
      if (e instanceof EchoApiError) lastError.value = e.message;
    }
  }

  async function toggleRole(
    serverId: string,
    token: string,
    roleId: string,
    assign: boolean,
  ): Promise<boolean> {
    lastError.value = null;
    mutating.value = true;
    try {
      const panel = await postEchoSelfRoleToggle(
        token,
        serverId,
        roleId,
        assign,
      );
      if (panel) {
        panelByServer.value = { ...panelByServer.value, [serverId]: panel };
      } else {
        await loadPanel(serverId, token);
      }
      return true;
    } catch (e) {
      if (e instanceof EchoApiError) lastError.value = e.message;
      return false;
    } finally {
      mutating.value = false;
    }
  }

  return {
    configByServer,
    panelByServer,
    loading,
    mutating,
    lastError,
    configFor,
    panelFor,
    loadConfig,
    saveConfig,
    loadPanel,
    toggleRole,
  };
});
