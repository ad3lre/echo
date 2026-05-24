import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import {
  fetchEchoVanityAvailability,
  type EchoVanityAvailabilityStatus,
} from '@/api/echo/serverLifecycle';
import {
  normalizeVanity,
  validateEchoVanityFormat,
} from '@/services/domain/serverSettings';
import { isEchoGraphId } from '@/utils/echoIds';

export type VanityAvailabilityUiState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'taken'
  | 'invalid'
  | 'current'
  | 'error';

const DEBOUNCE_MS = 350;

export function useVanityAvailabilityCheck(opts: {
  serverId: Ref<string | undefined>;
  accessToken: Ref<string>;
  vanityCode: Ref<string>;
  savedVanityCode: Ref<string>;
  enabled: Ref<boolean>;
}) {
  const uiState = ref<VanityAvailabilityUiState>('idle');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let requestSeq = 0;

  function clearTimer() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  function mapApiStatus(
    status: EchoVanityAvailabilityStatus,
  ): VanityAvailabilityUiState {
    if (status === 'available') return 'available';
    if (status === 'taken') return 'taken';
    if (status === 'invalid') return 'invalid';
    return 'current';
  }

  async function runCheck() {
    const sid = opts.serverId.value?.trim();
    const token = opts.accessToken.value.trim();
    if (!opts.enabled.value || !sid || !token || !isEchoGraphId(sid)) {
      uiState.value = 'idle';
      return;
    }

    const raw = opts.vanityCode.value;
    const normalized = normalizeVanity(raw);
    const saved = opts.savedVanityCode.value.trim().toLowerCase();

    if (normalized === saved) {
      uiState.value = normalized ? 'current' : 'idle';
      return;
    }

    const format = validateEchoVanityFormat(normalized || raw);
    if (format === false) {
      uiState.value = 'invalid';
      return;
    }
    if (format === 'empty') {
      uiState.value = 'available';
      return;
    }

    const seq = ++requestSeq;
    uiState.value = 'checking';
    try {
      const { status } = await fetchEchoVanityAvailability(
        token,
        sid,
        normalized,
      );
      if (seq !== requestSeq) return;
      uiState.value = mapApiStatus(status);
    } catch {
      if (seq !== requestSeq) return;
      uiState.value = 'error';
    }
  }

  function scheduleCheck() {
    clearTimer();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void runCheck();
    }, DEBOUNCE_MS);
  }

  watch(
    [opts.vanityCode, opts.savedVanityCode, opts.serverId, opts.enabled],
    () => scheduleCheck(),
    { immediate: true },
  );

  onUnmounted(() => {
    clearTimer();
    requestSeq++;
  });

  const statusMessage = computed(() => {
    switch (uiState.value) {
      case 'checking':
        return 'Checking availability…';
      case 'available':
        return 'This vanity URL is available';
      case 'taken':
        return 'That vanity URL is already in use';
      case 'invalid':
        return 'Use 3–32 characters: lowercase letters, numbers, and single hyphens';
      case 'current':
        return 'Current vanity URL';
      case 'error':
        return 'Could not check availability';
      default:
        return '';
    }
  });

  const statusTone = computed(() => {
    switch (uiState.value) {
      case 'available':
      case 'current':
        return 'ok' as const;
      case 'taken':
      case 'invalid':
      case 'error':
        return 'bad' as const;
      case 'checking':
        return 'pending' as const;
      default:
        return 'neutral' as const;
    }
  });

  return { uiState, statusMessage, statusTone };
}
