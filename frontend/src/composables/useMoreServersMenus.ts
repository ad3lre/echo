import {
  ref,
  computed,
  watch,
  nextTick,
  onMounted,
  onUnmounted,
  type ComputedRef,
} from 'vue';
import type { MoreServersMockServer } from '@/composables/useMoreServers';

export type WidgetFolderContextMenu =
  | { target: 'server'; serverId: string; left: number; top: number }
  | { target: 'folder'; folderId: string; left: number; top: number };

/**
 * Card "…" action menu + right-click context menu for the More-servers
 * panel: open/close state, viewport-aware positioning, and outside-click /
 * scroll lifecycle. Extracted from MoreServersPanel.vue.
 */
export function useMoreServersMenus(deps: {
  serverById: ComputedRef<Map<string, MoreServersMockServer>>;
}) {
  const { serverById } = deps;

  const openMenuId = ref<string | null>(null);
  const cardMenuTriggerRef = ref<HTMLElement | null>(null);
  const cardMenuPosition = ref<{ left: number; top: number } | null>(null);
  const contextMenu = ref<WidgetFolderContextMenu | null>(null);

  const CARD_MENU_WIDTH = 200;
  const CARD_MENU_EST_HEIGHT = 320;
  const CARD_MENU_GAP = 6;

  const openMenuServer = computed(() => {
    const id = openMenuId.value;
    if (!id) return null;
    return serverById.value.get(id) ?? null;
  });

  const cardMenuStyle = computed(() => {
    const p = cardMenuPosition.value;
    if (!p) return {};
    return { left: `${p.left}px`, top: `${p.top}px` };
  });

  function syncCardMenuPosition() {
    const el = cardMenuTriggerRef.value;
    if (!el || !openMenuId.value) {
      cardMenuPosition.value = null;
      return;
    }
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = r.right - CARD_MENU_WIDTH;
    left = Math.max(8, Math.min(left, vw - CARD_MENU_WIDTH - 8));
    let top = r.top - CARD_MENU_GAP - CARD_MENU_EST_HEIGHT;
    if (top < 8) top = r.bottom + CARD_MENU_GAP;
    top = Math.max(8, Math.min(top, vh - CARD_MENU_EST_HEIGHT - 8));
    cardMenuPosition.value = { left, top };
  }

  function setCardMenuTriggerRef(serverId: string, el: unknown) {
    if (openMenuId.value !== serverId) return;
    cardMenuTriggerRef.value = (el as HTMLElement | null) ?? null;
  }

  function onCardMenuScrollOrResize() {
    if (openMenuId.value) syncCardMenuPosition();
  }

  const contextMenuStyle = computed(() => {
    const m = contextMenu.value;
    if (!m) return {};
    const vw = typeof window !== 'undefined' ? window.innerWidth : 800;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 600;
    const left = Math.max(8, Math.min(m.left, vw - 220));
    const top = Math.max(8, Math.min(m.top, vh - 320));
    return { left: `${left}px`, top: `${top}px` };
  });

  function closeContextMenu() {
    contextMenu.value = null;
  }

  function openServerContextMenu(server: MoreServersMockServer, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    openMenuId.value = null;
    contextMenu.value = {
      target: 'server',
      serverId: server.id,
      left: e.clientX,
      top: e.clientY,
    };
  }

  function openFolderContextMenu(folderId: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    openMenuId.value = null;
    contextMenu.value = {
      target: 'folder',
      folderId,
      left: e.clientX,
      top: e.clientY,
    };
  }

  function onDocPointerDown(ev: MouseEvent) {
    const t = ev.target;
    if (!(t instanceof Node)) return;
    const ctxEl = document.querySelector('[data-more-servers-folder-menu]');
    if (ctxEl && !ctxEl.contains(t)) closeContextMenu();
    if (!openMenuId.value) return;
    const cardEl = document.querySelector('[data-more-servers-card-menu]');
    const trigger = cardMenuTriggerRef.value;
    if (cardEl && !cardEl.contains(t) && trigger && !trigger.contains(t)) {
      openMenuId.value = null;
      cardMenuPosition.value = null;
    }
  }

  watch(openMenuId, (id) => {
    if (id) {
      void nextTick(() => syncCardMenuPosition());
      window.addEventListener('scroll', onCardMenuScrollOrResize, true);
      window.addEventListener('resize', onCardMenuScrollOrResize);
    } else {
      cardMenuPosition.value = null;
      window.removeEventListener('scroll', onCardMenuScrollOrResize, true);
      window.removeEventListener('resize', onCardMenuScrollOrResize);
    }
  });

  onMounted(() => {
    document.addEventListener('pointerdown', onDocPointerDown, true);
  });
  onUnmounted(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    window.removeEventListener('scroll', onCardMenuScrollOrResize, true);
    window.removeEventListener('resize', onCardMenuScrollOrResize);
  });

  function toggleMenu(id: string) {
    closeContextMenu();
    const next = openMenuId.value === id ? null : id;
    openMenuId.value = next;
    if (!next) cardMenuPosition.value = null;
  }

  return {
    openMenuId,
    cardMenuPosition,
    contextMenu,
    openMenuServer,
    cardMenuStyle,
    contextMenuStyle,
    setCardMenuTriggerRef,
    closeContextMenu,
    openServerContextMenu,
    openFolderContextMenu,
    toggleMenu,
  };
}
