import { onMounted, onUnmounted, watch } from 'vue';
import { consumeEchoWordleNextDayReminder } from '@/features/voice/wordline/echoWordleAccountStore';

export function useEchoWordleNextDayReminder(deps: {
  storageKey: () => string;
  /** Re-run when this changes (e.g. auth user switch). */
  watchSource: () => unknown;
  dispatchAppToast: (message: string, tone?: 'info' | 'warning') => void;
}) {
  const run = () => {
    if (!consumeEchoWordleNextDayReminder(deps.storageKey())) return;
    deps.dispatchAppToast('A new Wordline daily is ready.', 'info');
  };

  onMounted(() => {
    run();
    window.addEventListener('focus', run);
  });

  onUnmounted(() => {
    window.removeEventListener('focus', run);
  });

  watch(deps.watchSource, run);
}
