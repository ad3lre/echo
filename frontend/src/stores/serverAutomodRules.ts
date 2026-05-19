import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { AutomodEffectiveCapabilities, EchoAutomodRule } from '@shared/types/automod';
import {
  createEchoAutomodRule,
  deleteEchoAutomodRule,
  fetchEchoAutomodCapabilities,
  fetchEchoAutomodRules,
  reorderEchoAutomodRules,
  updateEchoAutomodRule,
} from '@/api/echo/automod';
import { EchoApiError } from '@/api/echo/transport';
import { isEchoGraphId } from '@/utils/echoIds';

export const useServerAutomodRulesStore = defineStore('serverAutomodRules', () => {
  const rulesByServer = shallowRef<Record<string, EchoAutomodRule[]>>({});
  const capabilitiesByServer = shallowRef<
    Record<string, AutomodEffectiveCapabilities | undefined>
  >({});
  const loadingServerId = ref<string | null>(null);
  const mutating = ref(false);
  const lastError = ref<string | null>(null);

  function setRules(serverId: string, rules: EchoAutomodRule[]) {
    rulesByServer.value = {
      ...rulesByServer.value,
      [serverId]: rules,
    };
  }

  function rulesFor(serverId: string): EchoAutomodRule[] {
    return rulesByServer.value[serverId] ?? [];
  }

  function capabilitiesFor(
    serverId: string,
  ): AutomodEffectiveCapabilities | undefined {
    return capabilitiesByServer.value[serverId];
  }

  async function load(serverId: string, token: string): Promise<void> {
    lastError.value = null;
    if (!serverId || !isEchoGraphId(serverId)) return;
    loadingServerId.value = serverId;
    try {
      const [cap, { rules }] = await Promise.all([
        fetchEchoAutomodCapabilities(token, serverId),
        fetchEchoAutomodRules(token, serverId),
      ]);
      capabilitiesByServer.value = {
        ...capabilitiesByServer.value,
        [serverId]: cap,
      };
      setRules(serverId, rules);
    } catch (e) {
      lastError.value =
        e instanceof EchoApiError ? e.message : 'Failed to load AutoMod rules';
      throw e;
    } finally {
      if (loadingServerId.value === serverId) loadingServerId.value = null;
    }
  }

  async function createRule(
    serverId: string,
    token: string,
    body: Parameters<typeof createEchoAutomodRule>[2],
  ): Promise<EchoAutomodRule> {
    lastError.value = null;
    mutating.value = true;
    try {
      const { rule } = await createEchoAutomodRule(token, serverId, body);
      const prev = rulesFor(serverId);
      setRules(serverId, [...prev, rule].sort((a, b) => a.position - b.position));
      return rule;
    } catch (e) {
      lastError.value =
        e instanceof EchoApiError ? e.message : 'Failed to create rule';
      throw e;
    } finally {
      mutating.value = false;
    }
  }

  async function saveRule(
    serverId: string,
    token: string,
    ruleId: string,
    patch: Parameters<typeof updateEchoAutomodRule>[3],
  ): Promise<EchoAutomodRule> {
    lastError.value = null;
    mutating.value = true;
    try {
      const { rule } = await updateEchoAutomodRule(token, serverId, ruleId, patch);
      const prev = rulesFor(serverId);
      setRules(
        serverId,
        prev.map((r) => (r.id === rule.id ? rule : r)),
      );
      return rule;
    } catch (e) {
      lastError.value =
        e instanceof EchoApiError ? e.message : 'Failed to save rule';
      throw e;
    } finally {
      mutating.value = false;
    }
  }

  async function removeRule(
    serverId: string,
    token: string,
    ruleId: string,
  ): Promise<void> {
    lastError.value = null;
    mutating.value = true;
    try {
      await deleteEchoAutomodRule(token, serverId, ruleId);
      const prev = rulesFor(serverId);
      setRules(
        serverId,
        prev.filter((r) => r.id !== ruleId),
      );
    } catch (e) {
      lastError.value =
        e instanceof EchoApiError ? e.message : 'Failed to delete rule';
      throw e;
    } finally {
      mutating.value = false;
    }
  }

  async function reorder(
    serverId: string,
    token: string,
    orderedIds: string[],
  ): Promise<void> {
    lastError.value = null;
    mutating.value = true;
    try {
      const { rules } = await reorderEchoAutomodRules(token, serverId, orderedIds);
      setRules(serverId, rules);
    } catch (e) {
      lastError.value =
        e instanceof EchoApiError ? e.message : 'Failed to reorder rules';
      throw e;
    } finally {
      mutating.value = false;
    }
  }

  async function patchRuleEnabled(
    serverId: string,
    token: string,
    ruleId: string,
    enabled: boolean,
  ): Promise<void> {
    await saveRule(serverId, token, ruleId, { enabled });
  }

  return {
    rulesByServer,
    capabilitiesByServer,
    loadingServerId,
    mutating,
    lastError,
    rulesFor,
    capabilitiesFor,
    load,
    createRule,
    saveRule,
    removeRule,
    reorder,
    patchRuleEnabled,
  };
});
