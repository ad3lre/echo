import { defineStore } from 'pinia';
import { ref } from 'vue';

const STORAGE_KEY = 'echo-dm-inbox-manual-order-v1';

export const useDmInboxManualOrderStore = defineStore(
  'dmInboxManualOrder',
  () => {
    const keyOrder = ref<string[]>([]);

    function loadFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          keyOrder.value = [];
          return;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
          keyOrder.value = [];
          return;
        }
        keyOrder.value = parsed.filter(
          (x): x is string => typeof x === 'string' && x.length > 0,
        );
      } catch {
        keyOrder.value = [];
      }
    }

    function persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(keyOrder.value));
      } catch {
        /* quota / private mode */
      }
    }

    function setOrderFromKeys(next: string[]) {
      keyOrder.value = next;
      persist();
    }

    loadFromStorage();

    return {
      keyOrder,
      loadFromStorage,
      setOrderFromKeys,
    };
  },
);
