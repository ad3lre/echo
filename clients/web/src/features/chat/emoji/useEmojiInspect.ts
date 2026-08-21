import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import { useServerStore } from '@/features/layout/server';
import { useServerEmojiLibrary } from '@/features/chat/emoji/useServerEmojiLibrary';
import { useUserEmojiLibrary } from '@/features/chat/emoji/useUserEmojiLibrary';
import {
  resolveEmojiInspectInfo,
  type EmojiInspectInfo,
} from '@/features/chat/emoji/resolveEmojiInspectInfo';
import {
  findEmojiInspectElement,
  parseEmojiInspectAnchor,
} from '@/features/chat/emoji/emojiInspectTarget';

export function useEmojiInspect(options: {
  rootRef: Ref<HTMLElement | null>;
  serverId: Ref<string | undefined>;
  customEmojiUrlById: Ref<ReadonlyMap<string, string>>;
}) {
  const serverStore = useServerStore();
  const serverEmojiLibrary = useServerEmojiLibrary(options.serverId);
  const userEmojiLibrary = useUserEmojiLibrary();

  const open = ref(false);
  const info = ref<EmojiInspectInfo | null>(null);
  const triggerRect = ref<DOMRect | null>(null);
  let lastAnchorEl: HTMLElement | null = null;

  const packNameByEmojiId = computed(() => {
    const m = new Map<string, string>();
    for (const pack of serverEmojiLibrary.packs.value) {
      for (const e of pack.emojis) {
        if (!m.has(e.id)) m.set(e.id, pack.name);
      }
    }
    for (const cat of userEmojiLibrary.pickerPackCategories.value) {
      for (const e of cat.emojis) {
        if (e.kind === 'custom' && e.id && !m.has(e.id)) {
          m.set(e.id, cat.name);
        }
      }
    }
    return m;
  });

  const resolveContext = computed(() => {
    const sid = options.serverId.value?.trim();
    const server = sid
      ? serverStore.servers.find((s) => s.id === sid)
      : undefined;
    return {
      serverId: sid,
      serverName: server?.name,
      emojiById: serverEmojiLibrary.emojiById.value,
      userEmojiById: userEmojiLibrary.emojiById.value,
      packNameByEmojiId: packNameByEmojiId.value,
      customEmojiUrlById: options.customEmojiUrlById.value,
    };
  });

  function close() {
    open.value = false;
    info.value = null;
    triggerRect.value = null;
    lastAnchorEl = null;
  }

  async function openFromElement(el: HTMLElement) {
    if (open.value && lastAnchorEl === el) {
      close();
      return;
    }
    const anchor = parseEmojiInspectAnchor(el);
    if (!anchor) return;
    const resolved = await resolveEmojiInspectInfo(
      anchor,
      resolveContext.value,
    );
    if (!resolved) return;
    lastAnchorEl = el;
    triggerRect.value = el.getBoundingClientRect();
    info.value = resolved;
    open.value = true;
  }

  function handleClick(e: MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-echo-emoji-inspect-card]')) return;
    const emojiEl = findEmojiInspectElement(target);
    if (!emojiEl) return;
    e.preventDefault();
    e.stopPropagation();
    void openFromElement(emojiEl);
  }

  function handleDocumentPointerDown(e: MouseEvent) {
    if (!open.value || e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-echo-emoji-inspect-card]')) return;
    const root = options.rootRef.value;
    if (root?.contains(target)) return;
    close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open.value) {
      e.preventDefault();
      close();
    }
  }

  let boundRoot: HTMLElement | null = null;

  watch(
    () => options.rootRef.value,
    (root, prev) => {
      prev?.removeEventListener('click', handleClick, true);
      boundRoot = root;
      root?.addEventListener('click', handleClick, true);
    },
    { immediate: true },
  );

  onUnmounted(() => {
    boundRoot?.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('mousedown', handleDocumentPointerDown);
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('mousedown', handleDocumentPointerDown);
  }

  return {
    open,
    info,
    triggerRect,
    close,
  };
}
