import { defineStore } from 'pinia';
import type { InstancePolicyPublic } from '@shared/instancePolicy';
import { fetchInstancePolicyPublic } from '@/services/instancePolicyClient';

export const useInstancePolicyStore = defineStore('instancePolicy', {
  state: () => ({
    loaded: false,
    policy: null as InstancePolicyPublic | null,
  }),
  getters: {
    guestAccountsEnabled(state): boolean {
      return state.policy?.guest.enabled === true;
    },
    registrationDisabled(state): boolean {
      return state.policy?.registration.disabled === true;
    },
    voiceRegions(state) {
      return state.policy?.regions.voice ?? { default: 'auto', available: [] };
    },
  },
  actions: {
    async load(): Promise<void> {
      const policy = await fetchInstancePolicyPublic();
      this.policy = policy;
      this.loaded = true;
    },
  },
});
