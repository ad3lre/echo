import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { COMPACT_SHELL_MEDIA_QUERY } from '@/config/compactShell';

const STORAGE_KEY_CHANNEL = 'echo-layout-channel-width';
const STORAGE_KEY_MEMBER = 'echo-layout-member-width';
const STORAGE_KEY_VOICE_SIDE = 'echo-layout-voice-side-width';
const STORAGE_KEY_MEMBER_LIST_SHOW_GUESTS = 'echo-member-list-show-guests';

const CHANNEL_MIN = 56;
const CHANNEL_MAX = 480;
/** Collapse channel list when resized narrower than this (px). */
const CHANNEL_COLLAPSE_AT = 180;
/**
 * When VC activities auto-narrow the channel column to free horizontal space,
 * do not go below this width (keeps full channel list mode; avoids bubble/collapse).
 */
const CHANNEL_ACTIVITY_OVERFLOW_FLOOR = 200;
/** Width below which we switch to bubble/narrow mode (icon-only view) */
const CHANNEL_BUBBLE_MODE_AT = 120;

const MEMBER_MIN = 80;
const MEMBER_MAX = 500;
const MEMBER_DEFAULT = 340;
/** Collapse when the panel would be too narrow to display search input without clipping. */
const MEMBER_COLLAPSE_AT = 220;

const VOICE_SIDE_DEFAULT = 360;
/** Lower bound while dragging; panel collapses below VOICE_SIDE_COLLAPSE_AT regardless. */
const VOICE_SIDE_MIN_DRAG = 260;
const VOICE_SIDE_MAX = 560;
/** Dragging to this threshold or below hides the panel (resets to default on expand). */
const VOICE_SIDE_COLLAPSE_AT = 360;

/** Guild mobile voice chat sheet: 0 hidden, 1 half viewport, 2 nearly full (above bottom bar). */
export type VoiceMobileSheetLevel = 0 | 1 | 2;

export function useLayout() {
  const channelPanelCollapsed = ref(false);
  const channelPanelBubbleMode = ref(false);
  const memberPanelCollapsed = ref(false);
  /** Guild member panel: show guest accounts in the roster (default hidden). */
  const memberListShowGuests = ref(false);
  /**
   * When true, the narrow viewport (`max-width: 972px`) auto-collapse must not hide
   * the member list — the user explicitly expanded it. Cleared when the user
   * collapses, drags the panel closed, the viewport leaves the narrow media query,
   * or AppLayout auto-collapses for insufficient main-area width.
   */
  const memberPanelAutoCollapseUserOverride = ref(false);
  const voiceSideChatCollapsed = ref(false);
  const voiceMobileSheetLevel = ref<VoiceMobileSheetLevel>(0);

  const channelPanelWidth = ref(288);
  const memberPanelWidth = ref(MEMBER_DEFAULT);
  const voiceSideChatWidth = ref(VOICE_SIDE_DEFAULT);
  /** Captured when a VC activity session starts; restored when activities fully close. */
  const vcActivitySessionChannelWidthSnapshot = ref<number | null>(null);

  onMounted(() => {
    try {
      const storedCh = localStorage.getItem(STORAGE_KEY_CHANNEL);
      const storedMb = localStorage.getItem(STORAGE_KEY_MEMBER);
      const storedVs = localStorage.getItem(STORAGE_KEY_VOICE_SIDE);
      if (storedCh) {
        const n = parseInt(storedCh, 10);
        if (!isNaN(n) && n >= CHANNEL_MIN && n <= CHANNEL_MAX) {
          channelPanelWidth.value = n;
        }
      }
      if (storedMb) {
        const n = parseInt(storedMb, 10);
        if (!isNaN(n) && n >= MEMBER_MIN && n <= MEMBER_MAX) {
          // Ensure server UI has enough room after expanded-profile layout changes.
          memberPanelWidth.value = Math.max(n, MEMBER_DEFAULT);
        }
      }
      if (storedVs) {
        const n = parseInt(storedVs, 10);
        if (!isNaN(n) && n >= VOICE_SIDE_COLLAPSE_AT && n <= VOICE_SIDE_MAX) {
          voiceSideChatWidth.value = n;
        }
      }
      const storedShowGuests = localStorage.getItem(
        STORAGE_KEY_MEMBER_LIST_SHOW_GUESTS,
      );
      if (storedShowGuests === '1' || storedShowGuests === 'true') {
        memberListShowGuests.value = true;
      }
    } catch {
      /* ignore */
    }
  });

  watch(memberListShowGuests, (show) => {
    try {
      localStorage.setItem(
        STORAGE_KEY_MEMBER_LIST_SHOW_GUESTS,
        show ? '1' : '0',
      );
    } catch {
      /* ignore */
    }
  });

  function persistWidths() {
    try {
      localStorage.setItem(
        STORAGE_KEY_CHANNEL,
        String(channelPanelWidth.value),
      );
      localStorage.setItem(STORAGE_KEY_MEMBER, String(memberPanelWidth.value));
      localStorage.setItem(
        STORAGE_KEY_VOICE_SIDE,
        String(voiceSideChatWidth.value),
      );
    } catch {
      /* ignore */
    }
  }

  /** Returns true when the pointer is a touchscreen — resize handles are skipped on coarse devices. */
  function isCoarsePointer(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(pointer: coarse)').matches
    );
  }

  /** Attaches drag resize listeners to document, locks cursor style, and tears down on mouseup. */
  function beginColumnResize(
    onMove: (e: MouseEvent) => void,
    onUp: () => void,
  ): void {
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function tearDownColumnResize(
    onMove: (e: MouseEvent) => void,
    onUp: () => void,
  ): void {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function startChannelResize(e: MouseEvent) {
    if (isCoarsePointer()) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = channelPanelWidth.value;

    function onMove(moveEvent: MouseEvent) {
      const delta = moveEvent.clientX - startX;
      const next = Math.max(CHANNEL_MIN, Math.min(CHANNEL_MAX, startW + delta));
      channelPanelWidth.value = next;
      // Enable bubble mode when narrow enough
      channelPanelBubbleMode.value = next <= CHANNEL_BUBBLE_MODE_AT;
      if (next <= CHANNEL_COLLAPSE_AT) {
        channelPanelCollapsed.value = true;
        channelPanelBubbleMode.value = false;
        channelPanelWidth.value = 288;
      }
    }

    function onUp() {
      tearDownColumnResize(onMove, onUp);
      persistWidths();
    }

    beginColumnResize(onMove, onUp);
  }

  function startMemberResize(e: MouseEvent) {
    if (isCoarsePointer()) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = memberPanelWidth.value;

    function onMove(moveEvent: MouseEvent) {
      // Dragging left increases width (member panel is on the right edge).
      const delta = startX - moveEvent.clientX;
      const next = Math.max(MEMBER_MIN, Math.min(MEMBER_MAX, startW + delta));
      memberPanelWidth.value = next;
      if (next <= MEMBER_COLLAPSE_AT) {
        memberPanelCollapsed.value = true;
        memberPanelWidth.value = MEMBER_DEFAULT;
        memberPanelAutoCollapseUserOverride.value = false;
      }
    }

    function onUp() {
      tearDownColumnResize(onMove, onUp);
      persistWidths();
    }

    beginColumnResize(onMove, onUp);
  }

  const gridTemplateColumns = computed(() => {
    if (channelPanelCollapsed.value) {
      return `96px 0px minmax(0, 1fr)`;
    }
    // Use exact pixel width for both normal and bubble modes
    const ch = `${channelPanelWidth.value}px`;
    return `96px ${ch} minmax(0, 1fr)`;
  });

  const mainContentColumns = computed(() => {
    if (memberPanelCollapsed.value) return 'minmax(0, 1fr)';
    return `minmax(0, 1fr) ${memberPanelWidth.value}px`;
  });

  function resetChannelWidth() {
    channelPanelWidth.value = 288;
    channelPanelBubbleMode.value = false;
    persistWidths();
  }

  function resetMemberWidth() {
    memberPanelWidth.value = MEMBER_DEFAULT;
    persistWidths();
  }

  function startVoiceSideChatResize(e: MouseEvent) {
    if (isCoarsePointer()) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = voiceSideChatWidth.value;

    function onMove(moveEvent: MouseEvent) {
      // Dragging left increases width (voice chat panel is on the right edge).
      const delta = startX - moveEvent.clientX;
      const next = Math.max(
        VOICE_SIDE_MIN_DRAG,
        Math.min(VOICE_SIDE_MAX, startW + delta),
      );
      if (next <= VOICE_SIDE_COLLAPSE_AT) {
        voiceSideChatCollapsed.value = true;
        voiceSideChatWidth.value = VOICE_SIDE_DEFAULT;
      } else {
        voiceSideChatCollapsed.value = false;
        voiceSideChatWidth.value = next;
      }
    }

    function onUp() {
      tearDownColumnResize(onMove, onUp);
      persistWidths();
    }

    beginColumnResize(onMove, onUp);
  }

  /** Returns the initial sheet level when opening voice chat (legacy; mobile uses full-screen overlay). */
  function voiceSheetLevelForOpen(): VoiceMobileSheetLevel {
    return 2;
  }

  function resetVoiceSideChatWidth() {
    voiceSideChatWidth.value = VOICE_SIDE_DEFAULT;
    voiceSideChatCollapsed.value = false;
    voiceMobileSheetLevel.value = voiceSheetLevelForOpen();
    persistWidths();
  }

  function expandVoiceSideChat() {
    voiceSideChatCollapsed.value = false;
    voiceSideChatWidth.value = VOICE_SIDE_DEFAULT;
    voiceMobileSheetLevel.value = voiceSheetLevelForOpen();
    persistWidths();
  }

  function toggleVoiceSideChat() {
    if (!voiceSideChatCollapsed.value) {
      voiceSideChatCollapsed.value = true;
      voiceMobileSheetLevel.value = 0;
    } else {
      voiceSideChatCollapsed.value = false;
      voiceSideChatWidth.value = VOICE_SIDE_DEFAULT;
      voiceMobileSheetLevel.value = voiceSheetLevelForOpen();
    }
    persistWidths();
  }

  /** Open voice chat from the call surface (mobile scroll-up gesture). */
  function bumpVoiceMobileChatFromCallScrollUp() {
    if (voiceMobileSheetLevel.value === 0) {
      voiceSideChatCollapsed.value = false;
      voiceSideChatWidth.value = VOICE_SIDE_DEFAULT;
      voiceMobileSheetLevel.value = 2;
    }
    persistWidths();
  }

  function bumpVoiceMobileChatFromCallScrollDown() {
    if (voiceMobileSheetLevel.value >= 1) {
      voiceSideChatCollapsed.value = true;
      voiceMobileSheetLevel.value = 0;
    }
    persistWidths();
  }

  watch(voiceSideChatCollapsed, (collapsed) => {
    if (collapsed) {
      voiceMobileSheetLevel.value = 0;
    } else if (voiceMobileSheetLevel.value === 0) {
      voiceMobileSheetLevel.value = voiceSheetLevelForOpen();
    }
  });

  let mediaQueryCleanup: (() => void) | null = null;
  onMounted(() => {
    try {
      const mqCompact = window.matchMedia(COMPACT_SHELL_MEDIA_QUERY);
      const mqNarrow = window.matchMedia('(max-width: 972px)');

      /**
       * Auto-collapse the member panel on narrow viewports unless the compact
       * shell is active (compact has its own panel visibility logic).
       */
      const syncMemberCollapse = () => {
        if (mqCompact.matches) return;
        if (!mqNarrow.matches) {
          memberPanelAutoCollapseUserOverride.value = false;
          return;
        }
        if (!memberPanelAutoCollapseUserOverride.value) {
          memberPanelCollapsed.value = true;
        }
      };

      syncMemberCollapse();

      /** Polyfill: `addEventListener` is standard; `addListener` is legacy Safari. */
      const addMqListener = (
        mq: MediaQueryList,
        fn: () => void,
      ): (() => void) => {
        if (typeof mq.addEventListener === 'function') {
          mq.addEventListener('change', fn);
          return () => mq.removeEventListener('change', fn);
        }
        mq.addListener(fn);
        return () => mq.removeListener(fn);
      };

      const offCompact = addMqListener(mqCompact, syncMemberCollapse);
      const offNarrow = addMqListener(mqNarrow, syncMemberCollapse);
      mediaQueryCleanup = () => {
        offCompact();
        offNarrow();
      };
    } catch {
      /* ignore */
    }
  });
  onUnmounted(() => {
    mediaQueryCleanup?.();
  });

  function markMemberPanelExpandedByUser() {
    memberPanelAutoCollapseUserOverride.value = true;
  }

  function markMemberPanelCollapsedByUser() {
    memberPanelAutoCollapseUserOverride.value = false;
  }

  function toggleChannelPanelBubbleMode() {
    if (channelPanelBubbleMode.value) {
      // Exit bubble mode
      channelPanelBubbleMode.value = false;
      channelPanelWidth.value = 240;
    } else {
      // Enter bubble mode
      channelPanelBubbleMode.value = true;
      channelPanelCollapsed.value = false;
      channelPanelWidth.value = 72;
    }
    persistWidths();
  }

  function beginVcActivitySessionChannelLayout() {
    if (vcActivitySessionChannelWidthSnapshot.value != null) return;
    vcActivitySessionChannelWidthSnapshot.value = channelPanelWidth.value;
  }

  function endVcActivitySessionChannelLayout() {
    if (vcActivitySessionChannelWidthSnapshot.value == null) return;
    channelPanelWidth.value = vcActivitySessionChannelWidthSnapshot.value;
    vcActivitySessionChannelWidthSnapshot.value = null;
    persistWidths();
  }

  /**
   * Narrows the channel column by one step so the main / VC activity column gains width.
   * Used when activity content still has vertical overflow. Returns false at floor or when collapsed.
   */
  function narrowChannelPanelForActivityOverflowStep(): boolean {
    if (channelPanelCollapsed.value) return false;
    if (channelPanelWidth.value <= CHANNEL_ACTIVITY_OVERFLOW_FLOOR)
      return false;
    channelPanelWidth.value = Math.max(
      CHANNEL_ACTIVITY_OVERFLOW_FLOOR,
      channelPanelWidth.value - 40,
    );
    persistWidths();
    return true;
  }

  return {
    channelPanelCollapsed,
    channelPanelBubbleMode,
    memberPanelCollapsed,
    memberListShowGuests,
    memberPanelAutoCollapseUserOverride,
    markMemberPanelExpandedByUser,
    markMemberPanelCollapsedByUser,
    voiceSideChatCollapsed,
    channelPanelWidth,
    memberPanelWidth,
    voiceSideChatWidth,
    gridTemplateColumns,
    mainContentColumns,
    startChannelResize,
    startMemberResize,
    startVoiceSideChatResize,
    resetChannelWidth,
    resetMemberWidth,
    resetVoiceSideChatWidth,
    expandVoiceSideChat,
    toggleVoiceSideChat,
    toggleChannelPanelBubbleMode,
    voiceMobileSheetLevel,
    bumpVoiceMobileChatFromCallScrollUp,
    bumpVoiceMobileChatFromCallScrollDown,
    CHANNEL_BUBBLE_MODE_AT,
    CHANNEL_COLLAPSE_AT,
    narrowChannelPanelForActivityOverflowStep,
    beginVcActivitySessionChannelLayout,
    endVcActivitySessionChannelLayout,
  };
}
