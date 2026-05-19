import { ref } from 'vue';

export type JoinServerConfirmPreview = {
  serverName: string;
  iconUrl?: string;
  memberCount?: number;
  subtitle?: string;
  isVoiceInvite?: boolean;
};

export function useJoinServerConfirmModal() {
  const isOpen = ref(false);
  const preview = ref<JoinServerConfirmPreview | null>(null);
  const joinBusy = ref(false);
  let resolvePending: ((confirmed: boolean) => void) | null = null;

  function requestJoinServerConfirm(
    next: JoinServerConfirmPreview,
  ): Promise<boolean> {
    preview.value = next;
    isOpen.value = true;
    return new Promise((resolve) => {
      resolvePending = resolve;
    });
  }

  function settle(confirmed: boolean) {
    const resolve = resolvePending;
    resolvePending = null;
    resolve?.(confirmed);
  }

  function onUpdate(open: boolean) {
    isOpen.value = open;
    if (!open) {
      settle(false);
      preview.value = null;
      joinBusy.value = false;
    }
  }

  function cancelJoinServerConfirmModal() {
    settle(false);
    isOpen.value = false;
    preview.value = null;
    joinBusy.value = false;
  }

  function confirmJoinServerFromModal() {
    if (!resolvePending) return;
    joinBusy.value = true;
    settle(true);
  }

  function finishJoinServerConfirmModal() {
    joinBusy.value = false;
    isOpen.value = false;
    preview.value = null;
  }

  return {
    isJoinServerConfirmModalOpen: isOpen,
    joinServerConfirmPreview: preview,
    joinServerConfirmBusy: joinBusy,
    requestJoinServerConfirm,
    onJoinServerConfirmModalUpdate: onUpdate,
    cancelJoinServerConfirmModal,
    confirmJoinServerFromModal,
    finishJoinServerConfirmModal,
  };
}
