import { ref } from 'vue';

export function useAccountLock() {
  const isAccountLocked = ref(true);
  const autoOpenEmailEditorAfterUnlock = ref(false);

  return {
    isAccountLocked,
    autoOpenEmailEditorAfterUnlock,
  };
}
