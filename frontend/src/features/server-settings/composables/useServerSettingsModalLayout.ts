import { computed, onUnmounted, ref, watch, type Ref } from 'vue';
import { COMPACT_SHELL_MEDIA_QUERY } from '@/config/compactShell';

const STORAGE_MODAL_W = 'echo-server-settings-modal-width';
const STORAGE_SIDEBAR_W = 'echo-server-settings-sidebar-width';

const MODAL_DEFAULT = 1210;
const MODAL_MIN = 520;
const MODAL_MAX = 1408;

const SIDEBAR_DEFAULT = 288;
/** Labeled nav can shrink this narrow; labels truncate aggressively before icon rail. */
const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 380;
/** Dragging the split narrower than this snaps to icon-only mode. */
const SIDEBAR_DRAG_COLLAPSE_AT = 172;

/** Prefer icon rail once the modal shell is this narrow (content pane needs room). */
const MODAL_INNER_AUTO_COLLAPSE_PX = 820;
const MODAL_INNER_AUTO_EXPAND_PX = 900;

/** Same band as member-list auto-collapse: desktop shell but left chrome stacks with main. */
const VIEWPORT_NAV_AUTO_COLLAPSE_MQ =
  '(min-width: 800px) and (max-width: 972px)';

function readCompactShellMatches(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia(COMPACT_SHELL_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

function coarsePointer(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function readStoredInt(
  key: string,
  fallback: number,
  lo: number,
  hi: number,
): number {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return fallback;
    return clamp(n, lo, hi);
  } catch {
    return fallback;
  }
}

function persistKey(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
}

function beginColResize(onMove: (e: MouseEvent) => void, onUp: () => void) {
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function endColResize(onMove: (e: MouseEvent) => void, onUp: () => void) {
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('mouseup', onUp);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

export function useServerSettingsModalLayout(opts: {
  modelValue: () => boolean;
  isCompactShell: () => boolean;
  modalShellRef: Ref<HTMLElement | null>;
}) {
  const modalWidth = ref(MODAL_DEFAULT);
  const sidebarWidth = ref(SIDEBAR_DEFAULT);
  /** User chose “Show section names” while auto would collapse. */
  const userPinnedLabelsOpen = ref(false);
  const viewportWantsCollapsedNav = ref(false);
  const modalInnerWantsCollapsedNav = ref(false);

  let ro: ResizeObserver | null = null;
  let mq: MediaQueryList | null = null;
  let offMq: (() => void) | null = null;

  const navCollapsed = computed(() => {
    if (opts.isCompactShell()) return false;
    const auto =
      viewportWantsCollapsedNav.value || modalInnerWantsCollapsedNav.value;
    if (!auto) return false;
    return !userPinnedLabelsOpen.value;
  });

  const showPreferIconRailShortcut = computed(
    () =>
      !opts.isCompactShell() &&
      !navCollapsed.value &&
      userPinnedLabelsOpen.value &&
      (viewportWantsCollapsedNav.value || modalInnerWantsCollapsedNav.value),
  );

  const modalWidthClamped = computed(() => {
    if (typeof window === 'undefined') return modalWidth.value;
    const cap = Math.min(
      MODAL_MAX,
      Math.max(MODAL_MIN, window.innerWidth - 16),
    );
    return clamp(modalWidth.value, MODAL_MIN, cap);
  });

  const sidebarWidthClamped = computed(() =>
    clamp(sidebarWidth.value, SIDEBAR_MIN, SIDEBAR_MAX),
  );

  function loadFromStorage() {
    modalWidth.value = readStoredInt(
      STORAGE_MODAL_W,
      MODAL_DEFAULT,
      MODAL_MIN,
      MODAL_MAX,
    );
    sidebarWidth.value = readStoredInt(
      STORAGE_SIDEBAR_W,
      SIDEBAR_DEFAULT,
      SIDEBAR_MIN,
      SIDEBAR_MAX,
    );
    if (typeof window !== 'undefined') {
      const cap = Math.min(
        MODAL_MAX,
        Math.max(MODAL_MIN, window.innerWidth - 16),
      );
      modalWidth.value = clamp(modalWidth.value, MODAL_MIN, cap);
    }
  }

  function syncViewportNavCollapse() {
    if (typeof window === 'undefined') return;
    if (readCompactShellMatches()) {
      viewportWantsCollapsedNav.value = false;
      return;
    }
    viewportWantsCollapsedNav.value = mq?.matches ?? false;
  }

  function syncModalInnerNavCollapse(entryWidth: number) {
    if (opts.isCompactShell()) {
      modalInnerWantsCollapsedNav.value = false;
      return;
    }
    if (entryWidth <= MODAL_INNER_AUTO_COLLAPSE_PX) {
      modalInnerWantsCollapsedNav.value = true;
    } else if (entryWidth >= MODAL_INNER_AUTO_EXPAND_PX) {
      modalInnerWantsCollapsedNav.value = false;
    }
  }

  function attachResizeObserver() {
    detachResizeObserver();
    const el = opts.modalShellRef.value;
    if (!el || typeof ResizeObserver === 'undefined') return;
    ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      if (w <= 40) return;
      syncModalInnerNavCollapse(w);
    });
    ro.observe(el);
    syncModalInnerNavCollapse(el.getBoundingClientRect().width);
  }

  function detachResizeObserver() {
    ro?.disconnect();
    ro = null;
  }

  function attachMq() {
    detachMq();
    if (typeof window === 'undefined') return;
    try {
      mq = window.matchMedia(VIEWPORT_NAV_AUTO_COLLAPSE_MQ);
      const fn = () => syncViewportNavCollapse();
      syncViewportNavCollapse();
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', fn);
        offMq = () => mq!.removeEventListener('change', fn);
      } else {
        mq.addListener(fn);
        offMq = () => mq!.removeListener(fn);
      }
    } catch {
      mq = null;
    }
  }

  function detachMq() {
    offMq?.();
    offMq = null;
    mq = null;
  }

  watch(
    () => opts.modelValue() && !opts.isCompactShell(),
    (active) => {
      if (active) {
        loadFromStorage();
        attachMq();
        queueMicrotask(() => attachResizeObserver());
      } else {
        detachResizeObserver();
        detachMq();
      }
    },
    { flush: 'post' },
  );

  watch(
    () =>
      [
        viewportWantsCollapsedNav.value,
        modalInnerWantsCollapsedNav.value,
      ] as const,
    ([v, m]) => {
      if (!v && !m) userPinnedLabelsOpen.value = false;
    },
  );

  watch(
    () => opts.isCompactShell(),
    (compact) => {
      if (compact) {
        detachResizeObserver();
        detachMq();
      } else if (opts.modelValue()) {
        attachMq();
        queueMicrotask(() => attachResizeObserver());
      }
    },
  );

  onUnmounted(() => {
    detachResizeObserver();
    detachMq();
  });

  function revealNavLabels() {
    userPinnedLabelsOpen.value = true;
  }

  function preferIconNav() {
    userPinnedLabelsOpen.value = false;
  }

  function startModalWidthResize(e: MouseEvent) {
    if (coarsePointer()) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = modalWidthClamped.value;

    function onMove(ev: MouseEvent) {
      const cap =
        typeof window !== 'undefined'
          ? Math.min(MODAL_MAX, window.innerWidth - 16)
          : MODAL_MAX;
      const delta = ev.clientX - startX;
      modalWidth.value = clamp(startW + delta, MODAL_MIN, cap);
    }

    function onUp() {
      endColResize(onMove, onUp);
      persistKey(STORAGE_MODAL_W, modalWidth.value);
      queueMicrotask(() => attachResizeObserver());
    }

    beginColResize(onMove, onUp);
  }

  function resetModalWidth() {
    modalWidth.value = MODAL_DEFAULT;
    persistKey(STORAGE_MODAL_W, modalWidth.value);
    queueMicrotask(() => attachResizeObserver());
  }

  function startSidebarResize(e: MouseEvent) {
    if (coarsePointer() || navCollapsed.value) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidthClamped.value;

    function onMove(ev: MouseEvent) {
      const delta = ev.clientX - startX;
      const next = clamp(startW + delta, SIDEBAR_MIN - 40, SIDEBAR_MAX);
      if (next < SIDEBAR_DRAG_COLLAPSE_AT) {
        sidebarWidth.value = SIDEBAR_DEFAULT;
        preferIconNav();
      } else {
        sidebarWidth.value = next;
      }
    }

    function onUp() {
      endColResize(onMove, onUp);
      if (!navCollapsed.value) {
        persistKey(STORAGE_SIDEBAR_W, sidebarWidth.value);
      }
    }

    beginColResize(onMove, onUp);
  }

  function resetSidebarWidth() {
    sidebarWidth.value = SIDEBAR_DEFAULT;
    persistKey(STORAGE_SIDEBAR_W, sidebarWidth.value);
  }

  return {
    modalWidth,
    modalWidthClamped,
    sidebarWidth,
    sidebarWidthClamped,
    navCollapsed,
    revealNavLabels,
    preferIconNav,
    startModalWidthResize,
    startSidebarResize,
    resetModalWidth,
    resetSidebarWidth,
    showPreferIconRailShortcut,
  };
}
