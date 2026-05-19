import { ref } from 'vue';
import type { EchoApplicationFormDto } from '@/api/echo/types';

export type ServerApplicationModalPayload = {
  serverId: string;
  serverName?: string;
  iconUrl?: string;
  source: 'invite' | 'directory';
  inviteToken?: string;
  applicationForm: EchoApplicationFormDto;
};

export function useServerApplicationModal() {
  const isOpen = ref(false);
  const payload = ref<ServerApplicationModalPayload | null>(null);
  const busy = ref(false);
  let resolvePending: ((v: 'submitted' | 'cancelled') => void) | null = null;

  function requestServerApplicationModal(
    p: ServerApplicationModalPayload,
  ): Promise<'submitted' | 'cancelled'> {
    payload.value = p;
    isOpen.value = true;
    return new Promise((resolve) => {
      resolvePending = resolve;
    });
  }

  function settle(v: 'submitted' | 'cancelled') {
    const r = resolvePending;
    resolvePending = null;
    r?.(v);
  }

  function onUpdate(open: boolean) {
    isOpen.value = open;
    if (!open) {
      if (resolvePending) settle('cancelled');
      payload.value = null;
      busy.value = false;
    }
  }

  function confirmSubmittedFromModal() {
    busy.value = false;
    settle('submitted');
    isOpen.value = false;
    payload.value = null;
  }

  function finishServerApplicationModal() {
    busy.value = false;
    isOpen.value = false;
    payload.value = null;
  }

  return {
    isServerApplicationModalOpen: isOpen,
    serverApplicationPayload: payload,
    serverApplicationBusy: busy,
    requestServerApplicationModal,
    onServerApplicationModalUpdate: onUpdate,
    confirmSubmittedFromModal,
    finishServerApplicationModal,
  };
}
