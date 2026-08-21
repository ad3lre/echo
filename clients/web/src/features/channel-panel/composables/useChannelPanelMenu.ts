import { onMounted, onUnmounted, ref, type Ref } from 'vue';

export function useChannelPanelMenu(serverMenuRef: Ref<HTMLElement | null>) {
  const isServerMenuOpen = ref(false);

  function toggleServerMenu() {
    isServerMenuOpen.value = !isServerMenuOpen.value;
  }

  function closeServerMenu() {
    isServerMenuOpen.value = false;
  }

  function onDocumentClick(e: MouseEvent) {
    const target = e.target as Node;
    if (serverMenuRef.value && !serverMenuRef.value.contains(target)) {
      closeServerMenu();
    }
  }

  onMounted(() => {
    document.addEventListener('click', onDocumentClick);
  });

  onUnmounted(() => {
    document.removeEventListener('click', onDocumentClick);
  });

  return {
    isServerMenuOpen,
    toggleServerMenu,
    closeServerMenu,
  };
}
