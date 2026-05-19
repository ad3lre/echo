import { nextTick, onMounted, onUnmounted, ref, type Ref } from 'vue';
import type { MessageWithAuthor } from '@shared/types';
import {
  getPopoutAnchorRect,
  type PopoutAnchorRect,
} from '@/utils/memberProfiles';

/** Template ref may be a DOM node or a Vue component instance (`$el`). */
function resolveElementRef(el: unknown): Element | null {
  if (el instanceof Element) return el;
  if (
    typeof el === 'object' &&
    el !== null &&
    '$el' in el &&
    (el as { $el: unknown }).$el instanceof Element
  ) {
    return (el as { $el: Element }).$el;
  }
  return null;
}

interface UseMessageBubbleUiOptions {
  message: Ref<MessageWithAuthor & { channelName?: string }>;
  menuOpen: Ref<boolean>;
  menuRef: Ref<HTMLElement | null>;
  triggerRef: Ref<HTMLElement | null>;
  editFormRef: Ref<HTMLElement | null>;
  isEditing: Ref<boolean>;
  cancelEdit: () => void;
  setMenuPositionFromRect: (rect: DOMRect) => void;
  setMenuPositionFromPoint: (x: number, y: number) => void;
  fitMenuToViewport: (el: HTMLElement | null) => void;
  reactTriggerRef: Ref<HTMLElement | null>;
  onGoToChannel?: (channelId: string) => void;
  onOpenProfile?: (userId: string, anchorRect: PopoutAnchorRect | null) => void;
}

export function useMessageBubbleUi(options: UseMessageBubbleUiOptions) {
  const {
    message,
    menuOpen,
    menuRef,
    triggerRef,
    editFormRef,
    isEditing,
    cancelEdit,
    setMenuPositionFromRect,
    setMenuPositionFromPoint,
    fitMenuToViewport,
    reactTriggerRef,
    onGoToChannel,
    onOpenProfile,
  } = options;

  const reactionPopoverOpen = ref(false);
  const reactionTriggerRect = ref<DOMRect | null>(null);
  const mediaRevealed = ref(false);
  const poppingEmojiKey = ref<string | null>(null);
  const poppingQuickEmoji = ref<string | null>(null);
  let poppingTimer: ReturnType<typeof setTimeout> | null = null;

  function resetForMessageChange() {
    mediaRevealed.value = false;
    menuOpen.value = false;
    reactionPopoverOpen.value = false;
  }

  async function toggleMenu(anchorEvent?: MouseEvent) {
    menuOpen.value = !menuOpen.value;
    if (menuOpen.value) {
      await nextTick();
      let rect: DOMRect | undefined = resolveElementRef(
        triggerRef.value,
      )?.getBoundingClientRect();
      const fromClick =
        anchorEvent?.currentTarget instanceof HTMLElement
          ? anchorEvent.currentTarget.getBoundingClientRect()
          : null;
      if (fromClick && fromClick.width > 0 && fromClick.height > 0) {
        rect = fromClick;
      }
      if (rect && rect.width > 0 && rect.height > 0) {
        setMenuPositionFromRect(rect);
      } else if (anchorEvent) {
        setMenuPositionFromPoint(anchorEvent.clientX, anchorEvent.clientY);
      }
      await nextTick();
      requestAnimationFrame(() => {
        fitMenuToViewport(menuRef.value);
      });
    }
  }

  async function openContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    menuOpen.value = true;
    await nextTick();
    setMenuPositionFromPoint(e.clientX, e.clientY);
    await nextTick();
    requestAnimationFrame(() => {
      fitMenuToViewport(menuRef.value);
    });
  }

  async function openReactionPopover() {
    menuOpen.value = false;
    await nextTick();
    reactionTriggerRect.value =
      resolveElementRef(reactTriggerRef.value)?.getBoundingClientRect() ?? null;
    reactionPopoverOpen.value = true;
  }

  async function openReactionPopoverFromPill(e: MouseEvent) {
    menuOpen.value = false;
    await nextTick();
    const el = e.currentTarget as HTMLElement;
    reactionTriggerRect.value = el?.getBoundingClientRect() ?? null;
    reactionPopoverOpen.value = true;
  }

  function triggerPop(key: string, duration = 400) {
    if (poppingTimer) clearTimeout(poppingTimer);
    poppingEmojiKey.value = key;
    poppingTimer = setTimeout(() => {
      poppingEmojiKey.value = null;
      poppingTimer = null;
    }, duration);
  }

  function triggerQuickPop(emoji: string) {
    poppingQuickEmoji.value = emoji;
    setTimeout(() => {
      poppingQuickEmoji.value = null;
    }, 400);
  }

  function handleReactionClick(
    emoji: string,
    onReact?: (emoji: string) => void,
  ) {
    const key = message.value.id ? `${message.value.id}-${emoji}` : emoji;
    triggerPop(key);
    onReact?.(emoji);
  }

  function handleQuickReact(emoji: string, onReact?: (emoji: string) => void) {
    triggerQuickPop(emoji);
    onReact?.(emoji);
    menuOpen.value = false;
  }

  function handleContentInteraction(e: MouseEvent | KeyboardEvent) {
    const userLink = (e.target as HTMLElement).closest('[data-mention-user]');
    if (userLink) {
      const uid = userLink.getAttribute('data-user-id');
      if (uid && onOpenProfile) {
        e.preventDefault();
        if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ')
          return;
        onOpenProfile(uid, getPopoutAnchorRect(userLink, 'chat-name'));
      }
      return;
    }
    const link = (e.target as HTMLElement).closest('[data-mention-channel]');
    if (!link) return;
    e.preventDefault();
    if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ')
      return;
    const channelId = link.getAttribute('data-channel-id');
    if (channelId) onGoToChannel?.(channelId);
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as Node;
    const tEl = target instanceof Element ? target : null;
    // Teleported to `body` — `menuRef` is never a DOM ancestor of the menu, so
    // treat clicks inside the menu as inside (otherwise mousedown closes before
    // `click` runs, e.g. "View reactions" never fires).
    if (tEl?.closest?.('[data-echo-message-context-menu]')) return;
    const menuEl = resolveElementRef(menuRef.value);
    const triggerEl = resolveElementRef(triggerRef.value);
    if (menuEl?.contains(target) || triggerEl?.contains(target)) return;
    menuOpen.value = false;
    const editEl = resolveElementRef(editFormRef.value);
    if (isEditing.value && editEl && !editEl.contains(target)) {
      if ((target as Element).closest?.('[data-chat-insert-ui]')) return;
      cancelEdit();
    }
  }

  onMounted(() => {
    document.addEventListener('mousedown', handleClickOutside);
  });

  onUnmounted(() => {
    document.removeEventListener('mousedown', handleClickOutside);
    if (poppingTimer) clearTimeout(poppingTimer);
  });

  return {
    menuOpen,
    reactionPopoverOpen,
    reactionTriggerRect,
    mediaRevealed,
    poppingEmojiKey,
    poppingQuickEmoji,
    resetForMessageChange,
    toggleMenu,
    openContextMenu,
    openReactionPopover,
    openReactionPopoverFromPill,
    handleReactionClick,
    handleQuickReact,
    handleContentInteraction,
  };
}
