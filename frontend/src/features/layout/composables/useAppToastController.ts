import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  unref,
  watch,
  type Ref,
} from 'vue';
import { storeToRefs } from 'pinia';
import { icons } from '@/assets/icons';
import { useSimpleContextMenu } from '@/composables/useSimpleContextMenu';
import {
  subscribeAppToasts,
  dispatchAppToast,
  ECHO_CHAT_COMPOSER_FOCUS_EVENT,
  type AppToastSeverity,
  type AppToastAction,
  type AppToastDetail,
} from '@/utils/controllerMissingAction';
import { sendEchoToastQuickReply } from '@/features/layout/echoToastQuickReplyBridge';
import type { EchoToastQuickReplyPayload } from '@/features/layout/echoToastQuickReplyBridge';
import {
  appToastBottomInsetCss,
  buildAppToastBarTimedPositionStyle,
  buildAppToastShellPositionStyle,
  computeVisualViewportToastInsets,
  shouldAppToastClearBottomChrome,
} from '@/features/layout/appToastShellPosition';
import {
  canOpenToastMessageContextMenu,
  resolveToastMessagePrimaryAction,
  shouldHideToastPrimaryActionForQuickReply,
  shouldOpenToastMessageContextMenu,
} from '@/features/layout/composables/toastMessageContextMenu';
import { useCallRingtoneStore } from '@/stores/callRingtone';
import { shouldDismissIncomingChatToastForDmContext } from '@/features/layout/incomingChatToastDmDismiss';
import {
  resolveAppToastClickExtendMs,
  resolveAppToastReplyExtendMs,
  shouldExtendAppToastOnClick,
} from '@/features/layout/appToastDismissTimer';

export type AppToastLayoutContext = {
  echoChatBottomChromeInsetPx: Ref<number>;
  useCompactTriPaneShell: Ref<boolean>;
  useCompactGuildSplitShell: Ref<boolean>;
  useCompactDmShell: Ref<boolean>;
  hasGuildChannelChrome: Ref<boolean>;
  isDmUiContext: Ref<boolean>;
  activeChannelId: Ref<string>;
  isDmThreadSurface: Ref<boolean>;
  findChannelFormat: (
    channelId: string,
  ) => { messageFormatTemplate?: string; messageFormatHard?: boolean } | null;
  declineIncomingCall: () => void | Promise<void>;
};

type ActiveAppToast = AppToastDetail & {
  severity: AppToastSeverity;
  durationMs: number;
  actions: AppToastAction[];
  variant: 'default' | 'incoming_call' | 'incoming_chat_message';
  showAutoDismissProgress?: boolean;
};

export function useAppToastController(
  layoutContext: AppToastLayoutContext,
  quickReplyComposerRef?: Ref<{
    getReplyPayload?: () => EchoToastQuickReplyPayload;
  } | null>,
) {
  const appToast = ref<ActiveAppToast | null>(null);
  const toastQuickReplyText = ref('');
  const appToastProgressEpoch = ref(0);
  let appToastClearTimer: ReturnType<typeof setTimeout> | null = null;
  let appToastBaseDurationMs = 0;
  let toastQuickReplyBaseline = '';
  const {
    menuOpen: appToastContextMenuOpen,
    menuRef: appToastContextMenuRef,
    menuPosition: appToastContextMenuPosition,
    openAtEvent: openAppToastContextMenuAtEvent,
    closeMenu: closeAppToastContextMenu,
  } = useSimpleContextMenu();
  let unsubscribeAppToastsFn: (() => void) | null = null;

  const callRingtoneStore = useCallRingtoneStore();
  const { muted: ringtoneMuted } = storeToRefs(callRingtoneStore);

  const appToastIsRich = computed(
    () =>
      appToast.value?.variant === 'incoming_call' ||
      appToast.value?.variant === 'incoming_chat_message',
  );

  /** Compact timed bar toasts (system updates, etc.) — not message/call rich toasts. */
  const appToastIsBarTimed = computed(
    () => appToast.value?.variant === 'default',
  );

  const appToastProgressVisible = computed(() => {
    const t = appToast.value;
    return (
      !!t &&
      t.showAutoDismissProgress === true &&
      t.durationMs > 0 &&
      t.variant !== 'incoming_call'
    );
  });

  const appToastLinearProgressVisible = computed(
    () => appToastProgressVisible.value && !appToastIsRich.value,
  );

  const appToastCircularProgressVisible = computed(
    () =>
      appToastProgressVisible.value &&
      appToast.value?.variant === 'incoming_chat_message',
  );

  const appToastContainerClass = computed(() => {
    const t = appToast.value;
    if (!t) return 'app-toast-glass';
    const severityClassByKey: Record<AppToastSeverity, string> = {
      success: 'app-toast-glass--success',
      info: 'app-toast-glass--info',
      warning: 'app-toast-glass--warning',
      error: 'app-toast-glass--error',
    };
    return [
      'app-toast-glass',
      'relative',
      severityClassByKey[t.severity],
      t.variant === 'incoming_call' || t.variant === 'incoming_chat_message'
        ? 'app-toast-incoming-call'
        : '',
    ]
      .filter(Boolean)
      .join(' ');
  });

  const appToastLeadingIconSrc = computed(() => {
    const t = appToast.value;
    if (!t) return icons.more;
    const custom = t.leadingIconSrc?.trim();
    if (custom) return custom;
    if (t.variant === 'incoming_chat_message') return icons.messageFilled;
    switch (t.severity) {
      case 'success':
        return icons.friendAdded;
      case 'warning':
        return icons.notificationsOff;
      case 'error':
        return icons.banUser;
      case 'info':
      default:
        return icons.more;
    }
  });

  const chatComposerFocusedForToast = ref(false);

  watch(appToast, (v) => {
    if (!v) {
      toastQuickReplyText.value = '';
      toastQuickReplyBaseline = '';
      closeAppToastContextMenu();
      return;
    }
    if (v.quickReplyChannelId?.trim()) {
      void nextTick(() => {
        if (appToast.value?.quickReplyChannelId?.trim()) {
          toastQuickReplyBaseline = toastQuickReplyText.value;
        }
      });
    } else {
      toastQuickReplyBaseline = '';
    }
  });

  watch(toastQuickReplyText, (text) => {
    if (!appToast.value?.quickReplyChannelId?.trim()) return;
    if (text === toastQuickReplyBaseline) return;
    extendAppToastDismissForReplyDraft();
  });

  function syncIncomingChatToastDismissForDmNavigation() {
    if (
      !shouldDismissIncomingChatToastForDmContext({
        toastVariant: appToast.value?.variant,
        isDmUiContext: layoutContext.isDmUiContext.value,
      })
    ) {
      return;
    }
    clearAppToastOnly();
  }

  watch(
    () =>
      [
        appToast.value?.variant ?? null,
        layoutContext.isDmUiContext.value,
        layoutContext.activeChannelId.value,
      ] as const,
    syncIncomingChatToastDismissForDmNavigation,
    { immediate: true },
  );

  function onAppToastContextMenu(ev: MouseEvent) {
    const toast = appToast.value;
    if (!canOpenToastMessageContextMenu(toast)) return;
    if (!shouldOpenToastMessageContextMenu(ev)) return;
    void openAppToastContextMenuAtEvent(ev);
  }

  const hasAppToastPrimaryContextAction = computed(() => {
    const toast = appToast.value;
    if (!toast) return false;
    return resolveToastMessagePrimaryAction(toast.actions) != null;
  });

  function openMessageChannelFromToast() {
    const toast = appToast.value;
    if (!toast) return;
    const action = resolveToastMessagePrimaryAction(toast.actions);
    if (!action) return;
    closeAppToastContextMenu();
    onAppToastAction(action);
  }

  function openMessageChannelFromToastContextMenu() {
    openMessageChannelFromToast();
  }

  function dismissToastFromContextMenu() {
    closeAppToastContextMenu();
    dismissAppToast();
  }

  function onChatComposerFocusForToast(e: Event) {
    const ce = e as CustomEvent<{ focused?: boolean }>;
    chatComposerFocusedForToast.value = ce.detail?.focused === true;
  }

  const appToastClearsBottomChrome = computed(() =>
    shouldAppToastClearBottomChrome({
      chatComposerFocused: chatComposerFocusedForToast.value,
      measuredChromeInsetPx: layoutContext.echoChatBottomChromeInsetPx.value,
      useCompactTriPaneShell: layoutContext.useCompactTriPaneShell.value,
      useCompactGuildSplitShell: layoutContext.useCompactGuildSplitShell.value,
      useCompactDmShell: layoutContext.useCompactDmShell.value,
      hasGuildChannelChrome: unref(layoutContext.hasGuildChannelChrome),
      isDmThreadSurface: layoutContext.isDmThreadSurface.value,
    }),
  );

  const visualViewportToastBottomExtraPx = ref(0);
  const visualViewportToastOffsetTopPx = ref(0);
  let appToastViewportMetricsRaf = 0;

  function syncAppToastVisualViewportInsetsNow() {
    if (typeof window === 'undefined') {
      visualViewportToastBottomExtraPx.value = 0;
      visualViewportToastOffsetTopPx.value = 0;
      return;
    }
    const insets = computeVisualViewportToastInsets(
      window.innerHeight,
      window.visualViewport,
    );
    visualViewportToastBottomExtraPx.value = insets.bottomExtraPx;
    visualViewportToastOffsetTopPx.value = insets.offsetTopPx;
  }

  function scheduleAppToastVisualViewportBottomExtra() {
    if (typeof window === 'undefined') return;
    if (appToastViewportMetricsRaf !== 0) return;
    appToastViewportMetricsRaf = window.requestAnimationFrame(() => {
      appToastViewportMetricsRaf = 0;
      syncAppToastVisualViewportInsetsNow();
    });
  }

  function onAppToastVisualViewportChanged() {
    scheduleAppToastVisualViewportBottomExtra();
  }

  const appToastHasQuickReplyFooter = computed(
    () =>
      appToast.value?.variant === 'incoming_chat_message' &&
      !!appToast.value.quickReplyChannelId?.trim(),
  );

  const toastQuickReplyChannelFormat = computed(() => {
    const cid = appToast.value?.quickReplyChannelId?.trim();
    if (!cid) return null;
    return layoutContext.findChannelFormat(cid);
  });

  const showToastQuickReplyOpenButton = computed(
    () =>
      appToastHasQuickReplyFooter.value &&
      !toastQuickReplyText.value.trim() &&
      hasAppToastPrimaryContextAction.value,
  );

  const appToastVisibleActions = computed(() => {
    const toast = appToast.value;
    if (!toast?.actions.length) return [];
    if (!shouldHideToastPrimaryActionForQuickReply(toast)) {
      return toast.actions;
    }
    const primaryAction = resolveToastMessagePrimaryAction(toast.actions);
    if (!primaryAction) return toast.actions;
    return toast.actions.filter((action) => action.id !== primaryAction.id);
  });

  const appToastShellGridRowsClass = computed(() => {
    const rows = ['minmax(0,1fr)'];
    if (appToastHasQuickReplyFooter.value) rows.push('auto');
    if (appToastLinearProgressVisible.value) rows.push('auto');
    return `grid-rows-[${rows.join('_')}]`;
  });

  const appToastProgressGridRowClass = computed(() => {
    if (!appToastLinearProgressVisible.value) return '';
    return appToastHasQuickReplyFooter.value ? '[grid-row:3]' : '[grid-row:2]';
  });

  const appToastShellPositionStyle = computed(() => {
    if (appToastIsBarTimed.value) {
      return buildAppToastBarTimedPositionStyle({
        visualViewportOffsetTopPx: visualViewportToastOffsetTopPx.value,
      });
    }
    const elevated = appToastClearsBottomChrome.value;
    const bottomInset = appToastBottomInsetCss({
      elevated,
      measuredChromeInsetPx: layoutContext.echoChatBottomChromeInsetPx.value,
    });
    return buildAppToastShellPositionStyle({
      bottomInsetCss: bottomInset,
      bottomExtraPx: visualViewportToastBottomExtraPx.value,
      visualViewportOffsetTopPx: visualViewportToastOffsetTopPx.value,
    });
  });

  const appToastShellClass = computed(() => {
    const shell = `pointer-events-auto box-border grid min-h-0 ${appToastShellGridRowsClass.value} overflow-hidden`;
    const richPadding =
      appToast.value?.variant === 'incoming_chat_message'
        ? appToastHasQuickReplyFooter.value
          ? 'px-3 pt-2.5 pb-0'
          : 'px-3 pt-2.5 pb-3.5'
        : 'px-3 py-2.5';
    return appToastIsRich.value
      ? `rounded-xl ${richPadding} text-[13px] shadow-2xl ${shell}`
      : `rounded-xl px-2.5 py-2 text-[13px] shadow-2xl ${shell}`;
  });

  const appToastViewportClass = computed(() => {
    const widthClass = appToastIsRich.value
      ? 'w-[min(26rem,calc(100vw-1rem))]'
      : 'w-[min(24rem,calc(100vw-1rem))]';
    if (appToastIsBarTimed.value) {
      return `pointer-events-none fixed z-[500] min-h-0 ${widthClass}`;
    }
    return `pointer-events-none fixed left-1/2 z-[500] min-h-0 -translate-x-1/2 ${widthClass}`;
  });

  const appToastStackClass = computed(() => {
    if (appToastIsBarTimed.value) {
      return 'pointer-events-auto absolute inset-x-0 top-0 flex max-h-full min-h-0 flex-col gap-2.5 overflow-y-auto overscroll-contain';
    }
    return 'pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-full min-h-0 flex-col-reverse gap-2.5 overflow-y-auto overscroll-contain';
  });

  function scheduleAppToastDismiss(durationMs: number) {
    if (appToastClearTimer != null) {
      clearTimeout(appToastClearTimer);
      appToastClearTimer = null;
    }
    const toast = appToast.value;
    if (!toast || durationMs <= 0) return;

    toast.durationMs = durationMs;
    if (toast.showAutoDismissProgress) {
      appToastProgressEpoch.value += 1;
    }
    appToastClearTimer = setTimeout(() => {
      appToastClearTimer = null;
      appToast.value = null;
    }, durationMs);
  }

  function canExtendAppToastDismiss(): boolean {
    const toast = appToast.value;
    return !!toast && toast.durationMs > 0 && toast.variant !== 'incoming_call';
  }

  function extendAppToastDismissForClick() {
    if (!canExtendAppToastDismiss()) return;
    scheduleAppToastDismiss(
      resolveAppToastClickExtendMs(appToastBaseDurationMs),
    );
  }

  function extendAppToastDismissForReplyDraft() {
    if (!canExtendAppToastDismiss()) return;
    scheduleAppToastDismiss(
      resolveAppToastReplyExtendMs(appToastBaseDurationMs),
    );
  }

  function onAppToastInteractionExtend(ev: MouseEvent) {
    if (!shouldExtendAppToastOnClick(ev.target)) return;
    extendAppToastDismissForClick();
  }

  function clearAppToastOnly() {
    if (appToastClearTimer != null) {
      clearTimeout(appToastClearTimer);
      appToastClearTimer = null;
    }
    appToastBaseDurationMs = 0;
    appToast.value = null;
  }

  function dismissAppToast() {
    const incomingCall = appToast.value?.variant === 'incoming_call';
    clearAppToastOnly();
    toastQuickReplyText.value = '';
    if (incomingCall) {
      void layoutContext.declineIncomingCall();
    }
  }

  function submitToastQuickReply() {
    const t = appToast.value;
    const cid = t?.quickReplyChannelId?.trim();
    if (!cid || t?.variant !== 'incoming_chat_message') return;
    const payload = quickReplyComposerRef?.value?.getReplyPayload?.() ?? {
      text: toastQuickReplyText.value.trim(),
    };
    const body = payload.text?.trim() ?? '';
    if (!body) return;
    if (!sendEchoToastQuickReply(cid, payload)) {
      dispatchAppToast('Could not send message.', 'warning');
      return;
    }
    toastQuickReplyText.value = '';
    clearAppToastOnly();
  }

  function onAppToastAction(action: AppToastAction) {
    try {
      action.run();
    } finally {
      if (action.keepOpen !== true) {
        clearAppToastOnly();
      }
    }
  }

  function incomingCallToastActionIconSrc(actionId: string): string {
    switch (actionId) {
      case 'answer':
        return icons.phoneCall;
      case 'decline':
        return icons.logOut;
      case 'mute_ringtone':
        return ringtoneMuted.value ? icons.volumeUp : icons.notificationsOff;
      default:
        return '';
    }
  }

  function incomingCallToastActionLabel(action: AppToastAction): string {
    if (action.id === 'mute_ringtone') {
      return ringtoneMuted.value ? 'Unmute' : 'Mute';
    }
    return action.label;
  }

  function incomingCallToastActionTitle(action: AppToastAction): string {
    if (action.id === 'mute_ringtone') {
      return ringtoneMuted.value ? 'Unmute ringtone' : 'Mute ringtone';
    }
    if (action.id === 'answer') return 'Answer call';
    if (action.id === 'decline') return 'Decline call';
    return action.label;
  }

  function disposeAppToastSideEffects() {
    unsubscribeAppToastsFn?.();
    unsubscribeAppToastsFn = null;
    if (appToastClearTimer != null) clearTimeout(appToastClearTimer);
    appToastClearTimer = null;
    appToastBaseDurationMs = 0;
    toastQuickReplyBaseline = '';
    window.removeEventListener(
      ECHO_CHAT_COMPOSER_FOCUS_EVENT,
      onChatComposerFocusForToast,
    );
    if (appToastViewportMetricsRaf !== 0) {
      window.cancelAnimationFrame(appToastViewportMetricsRaf);
      appToastViewportMetricsRaf = 0;
    }
    window.removeEventListener('resize', onAppToastVisualViewportChanged);
    if (typeof window !== 'undefined' && window.visualViewport) {
      const vv = window.visualViewport;
      vv.removeEventListener('resize', onAppToastVisualViewportChanged);
      vv.removeEventListener('scroll', onAppToastVisualViewportChanged);
    }
  }

  onMounted(() => {
    unsubscribeAppToastsFn = subscribeAppToasts((d) => {
      const incomingActions = Array.isArray(d.actions) ? d.actions : [];
      const currentHasActions = !!appToast.value?.actions.length;
      const incomingHasActions = incomingActions.length > 0;
      if (
        appToast.value?.variant === 'incoming_call' &&
        currentHasActions &&
        !incomingHasActions &&
        (d.severity ?? 'info') !== 'warning'
      ) {
        return;
      }
      if (appToastClearTimer != null) clearTimeout(appToastClearTimer);
      appToastClearTimer = null;
      const durationMs =
        typeof d.durationMs === 'number' && Number.isFinite(d.durationMs)
          ? Math.max(0, d.durationMs)
          : 3500;
      appToastBaseDurationMs = durationMs;
      const variant =
        d.variant === 'incoming_call'
          ? 'incoming_call'
          : d.variant === 'incoming_chat_message'
            ? 'incoming_chat_message'
            : 'default';
      const showAutoDismissProgress =
        d.showAutoDismissProgress !== false &&
        durationMs > 0 &&
        variant !== 'incoming_call';
      appToast.value = {
        message: d.message,
        severity: d.severity ?? 'info',
        durationMs,
        actions: incomingActions,
        title: d.title,
        subtitle: d.subtitle,
        variant,
        leadingIconSrc: d.leadingIconSrc,
        imageUrl: d.imageUrl,
        badge: d.badge,
        quickReplyChannelId: d.quickReplyChannelId,
        showAutoDismissProgress,
      };
      scheduleAppToastDismiss(durationMs);
    });

    window.addEventListener(
      ECHO_CHAT_COMPOSER_FOCUS_EVENT,
      onChatComposerFocusForToast,
    );

    syncAppToastVisualViewportInsetsNow();
    window.addEventListener('resize', onAppToastVisualViewportChanged);
    if (window.visualViewport) {
      const vv = window.visualViewport;
      vv.addEventListener('resize', onAppToastVisualViewportChanged);
      vv.addEventListener('scroll', onAppToastVisualViewportChanged);
    }
  });

  onUnmounted(() => {
    disposeAppToastSideEffects();
  });

  return {
    appToast,
    toastQuickReplyText,
    appToastProgressEpoch,
    appToastContextMenuOpen,
    appToastContextMenuRef,
    appToastContextMenuPosition,
    appToastIsRich,
    appToastLinearProgressVisible,
    appToastCircularProgressVisible,
    appToastContainerClass,
    appToastLeadingIconSrc,
    onAppToastContextMenu,
    hasAppToastPrimaryContextAction,
    openMessageChannelFromToast,
    openMessageChannelFromToastContextMenu,
    dismissToastFromContextMenu,
    appToastHasQuickReplyFooter,
    toastQuickReplyChannelFormat,
    showToastQuickReplyOpenButton,
    appToastVisibleActions,
    appToastProgressGridRowClass,
    appToastShellPositionStyle,
    appToastShellClass,
    appToastViewportClass,
    appToastStackClass,
    ringtoneMuted,
    dismissAppToast,
    submitToastQuickReply,
    onAppToastAction,
    incomingCallToastActionIconSrc,
    incomingCallToastActionLabel,
    incomingCallToastActionTitle,
    onAppToastInteractionExtend,
  };
}
