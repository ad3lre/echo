import { watch, type ComputedRef, type Ref } from 'vue';
import type { EchoChannelType } from '@shared/types';
import { emitDiagnostic } from '@/observability/sessionDiagnostics';
import {
  emitChatSwitchEvent,
  getActiveChatSwitchSnapshot,
} from '@/features/layout/chatSwitchPerfTrace';
import { logMessageList } from '@/features/chat/composables/messageListDebugLog';

type SkeletonSample = {
  startedAtMs: number;
  channelId: string | null;
};

export type UseMessageListDevDiagnosticsOptions = {
  channelId: () => string | undefined;
  transitionLoading: () => boolean;
  initialHistoryLoading: () => boolean;
  displayOrderedIds: Ref<readonly string[]> | ComputedRef<readonly string[]>;
  showLoadingSkeleton: Ref<boolean> | ComputedRef<boolean>;
  isEmpty: Ref<boolean> | ComputedRef<boolean>;
  showNoServersYet: Ref<boolean> | ComputedRef<boolean>;
  discordMessageImportEligible: Ref<boolean> | ComputedRef<boolean>;
  showDiscordImportWidget: Ref<boolean> | ComputedRef<boolean>;
  canShowDiscordChannelImport: () => boolean;
  isDiscordImportedServer: () => boolean;
  discordChannelId: () => string | undefined;
  channelType: () => EchoChannelType | undefined;
  resolveOverscan: () => number;
  hasChannelIndex: () => boolean;
};

function debugNowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function beginSkeletonSample(
  options: UseMessageListDevDiagnosticsOptions,
  sample: SkeletonSample,
): void {
  if (sample.startedAtMs > 0) return;
  sample.startedAtMs = debugNowMs();
  sample.channelId = options.channelId()?.trim() || null;
  logMessageList('history', 'loading_skeleton_visible_start', {
    channelId: sample.channelId,
    transitionLoading: options.transitionLoading(),
    initialHistoryLoading: options.initialHistoryLoading(),
    outcomeOk: true,
    expectation:
      'static skeleton overlay visible until initial anchor settles or channel loads',
  });
}

function finishSkeletonSample(
  options: UseMessageListDevDiagnosticsOptions,
  sample: SkeletonSample,
  hideReason: 'hidden' | 'channel_change',
): void {
  if (sample.startedAtMs <= 0) return;
  const durationMs = Math.max(0, Math.round(debugNowMs() - sample.startedAtMs));
  emitDiagnostic({
    level: 'info',
    domain: 'perf',
    event: 'message_list_loading_skeleton_visible',
    stage: 'success',
    durationMs,
    context: {
      channelId: sample.channelId,
      hideReason,
      finalMessageCount: options.displayOrderedIds.value.length,
      initialHistoryLoading: options.initialHistoryLoading(),
      transitionLoading: options.transitionLoading(),
    },
  });
  logMessageList('history', 'loading_skeleton_visible_end', {
    channelId: sample.channelId,
    durationMs,
    hideReason,
    finalMessageCount: options.displayOrderedIds.value.length,
    initialHistoryLoading: options.initialHistoryLoading(),
    transitionLoading: options.transitionLoading(),
    outcomeOk: true,
    expectation:
      'duration approximates the loading placeholder lifetime visible to the user',
  });
  sample.startedAtMs = 0;
  sample.channelId = null;
}

function watchSkeletonLifetime(
  options: UseMessageListDevDiagnosticsOptions,
): void {
  const loadingSkeletonSample: SkeletonSample = {
    startedAtMs: 0,
    channelId: null,
  };
  watch(
    () => options.channelId(),
    (cid, prevCid) => {
      if (prevCid === undefined || prevCid === cid) return;
      finishSkeletonSample(options, loadingSkeletonSample, 'channel_change');
    },
  );
  watch(options.showLoadingSkeleton, (visible) => {
    if (visible) {
      beginSkeletonSample(options, loadingSkeletonSample);
      return;
    }
    finishSkeletonSample(options, loadingSkeletonSample, 'hidden');
  });
}

function watchFirstMessageVisible(
  options: UseMessageListDevDiagnosticsOptions,
): void {
  let lastFirstMessageVisibleSwitchId = 0;
  watch(
    () =>
      [
        options.channelId() ?? '',
        options.displayOrderedIds.value.length,
      ] as const,
    ([channelId, count], prev) => {
      if (!channelId || count <= 0) return;
      if (prev && prev[0] === channelId && prev[1] > 0) return;
      const snapshot = getActiveChatSwitchSnapshot();
      if (!snapshot || snapshot.channelId !== channelId) return;
      if (snapshot.switchId === lastFirstMessageVisibleSwitchId) return;
      lastFirstMessageVisibleSwitchId = snapshot.switchId;
      emitChatSwitchEvent({
        event: 'chat_switch_first_message_visible',
        channelId,
        context: {
          messageCount: count,
          initialHistoryLoading: options.initialHistoryLoading(),
          transitionLoading: options.transitionLoading(),
        },
      });
    },
  );
}

function watchImportWidgetDecision(
  options: UseMessageListDevDiagnosticsOptions,
): void {
  watch(
    () => ({
      channelId: options.channelId() ?? null,
      isEmpty: options.isEmpty.value,
      showLoadingSkeleton: options.showLoadingSkeleton.value,
      showNoServersYet: options.showNoServersYet.value,
      discordMessageImportEligible: options.discordMessageImportEligible.value,
      showDiscordImportWidget: options.showDiscordImportWidget.value,
      canShowDiscordChannelImport: options.canShowDiscordChannelImport(),
      isDiscordImportedServer: options.isDiscordImportedServer(),
      hasDiscordChannelId: !!options.discordChannelId(),
      channelType: options.channelType() ?? null,
      messageCount: options.displayOrderedIds.value.length,
    }),
    (snapshot) => {
      emitDiagnostic({
        level: 'info',
        domain: 'ui',
        event: 'discord_import_widget_decision',
        stage: 'attempt',
        context: snapshot,
      });
    },
    { immediate: true },
  );
}

function watchVirtualizerOptions(
  options: UseMessageListDevDiagnosticsOptions,
): void {
  watch(
    () => ({
      channelId: options.channelId() ?? null,
      count: options.displayOrderedIds.value.length,
      overscan: options.resolveOverscan(),
      channelIndexOrderRevision: null,
      hasChannelIndex: options.hasChannelIndex(),
    }),
    (snapshot) => {
      emitDiagnostic({
        level: 'info',
        domain: 'ui',
        event: 'message_list_virtualizer_options',
        stage: 'attempt',
        context: snapshot,
      });
    },
    { immediate: true },
  );
}

/**
 * DEV-only MessageList diagnostics. No-ops in production. Does not write scroll.
 */
export function useMessageListDevDiagnostics(
  options: UseMessageListDevDiagnosticsOptions,
): void {
  if (!import.meta.env.DEV) return;
  watchSkeletonLifetime(options);
  watchFirstMessageVisible(options);
  watchImportWidgetDecision(options);
  watchVirtualizerOptions(options);
}
