import { ref } from 'vue';

export function useAppLayoutLeaveServerModal(deps: {
  leaveServer: (serverId: string, currentUserId?: string) => void;
  currentUserId: () => string | undefined;
}) {
  const isOpen = ref(false);
  const serverName = ref('');
  const variant = ref<'confirm' | 'ownerBlocked'>('confirm');
  const targetId = ref<string | null>(null);

  function openOwnerBlocked() {
    targetId.value = null;
    variant.value = 'ownerBlocked';
    serverName.value = '';
    isOpen.value = true;
  }

  function openConfirm(payload: { serverId: string; serverName: string }) {
    targetId.value = payload.serverId;
    variant.value = 'confirm';
    serverName.value = payload.serverName;
    isOpen.value = true;
  }

  function onUpdate(open: boolean) {
    isOpen.value = open;
    if (!open) targetId.value = null;
  }

  function confirm() {
    const sid = targetId.value;
    if (!sid) return;
    deps.leaveServer(sid, deps.currentUserId());
    isOpen.value = false;
    targetId.value = null;
  }

  return {
    isLeaveServerModalOpen: isOpen,
    leaveServerModalServerName: serverName,
    leaveServerModalVariant: variant,
    openLeaveServerOwnerBlockedModal: openOwnerBlocked,
    openLeaveServerConfirmModal: openConfirm,
    onLeaveServerModalUpdate: onUpdate,
    confirmLeaveServerFromModal: confirm,
  };
}
