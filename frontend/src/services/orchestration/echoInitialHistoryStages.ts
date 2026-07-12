import { ref, type Ref } from 'vue';
import type { EchoApiMessage } from '@/api/echo/messages';
import { fetchEchoChannelMessages } from '@/api/echoClient';
import {
  ECHO_CHANNEL_FAST_TAIL_PAGE_SIZE,
  ECHO_CHANNEL_INITIAL_BACKFILL_PAGE_SIZE,
  ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE,
} from '@/constants/echoHistoryPageSize';
import { messageReadFacade } from '@/features/chat/domain/messageReadFacade';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import {
  applyEchoHistoryInitialPageFromApi,
  applyEchoHistoryLatestPageFromApi,
  applyEchoHistoryOlderPageFromApi,
} from '@/features/chat/domain/echoHistoryChannelApply';
import { ECHO_HISTORY_LOAD_OLDER_TIMEOUT_MS } from '@/features/chat/constants/echoHistoryFetchTimeouts';
import { mapEchoMessagesToRaw } from '@/services/domain/echoMessageSnapshots';
import { cancelChannelMessagePrefetch } from './echoWorkspaceChannelPrefetch';
import { writeWarmChannelHead } from '@/services/persistence/warmChannelHeadCache';
import { emitDiagnostic } from '@/observability/sessionDiagnostics';
import { isEchoGraphId } from '@/utils/echoIds';
import { promiseWithTimeout } from '@/utils/promiseTimeout';

type AuthLike = {
  accessToken?: string | null;
  isAuthenticated: boolean;
  backendUser?: { id?: string } | null;
};

type Input = {
  activeChannelId: Ref<string>;
  auth: AuthLike;
  activeServerId?: () => string | null | undefined;
  currentGeneration: () => number;
  shouldUseFastTail: (channelId: string) => boolean;
};

type BackfillPlan = {
  channelId: string;
  generation: number;
  beforeMessageId: string;
  attempted: boolean;
};

export function createEchoInitialHistoryStages(input: Input) {
  const initialBackfillLoading = ref(false);
  const initialBackfillPending = ref(false);
  let fastTailAbortController: AbortController | null = null;
  let initialBackfillAbortController: AbortController | null = null;
  let backfillPlan: BackfillPlan | null = null;
  let initialChannelId: string | null = null;

  const nowMs = () =>
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  function persistWarmHead(channelId: string): void {
    const userId = input.auth.backendUser?.id?.trim();
    const serverId = input.activeServerId?.()?.trim();
    const messages = messageReadFacade.getChannelMessages(channelId) ?? [];
    if (!userId || !serverId || !isEchoGraphId(serverId) || !messages.length) {
      return;
    }
    void writeWarmChannelHead({
      userId,
      serverId,
      channelId,
      messages,
      hasMoreOlder: messageWindowAuthority.getHasMoreOlderForChannel(channelId),
    });
  }

  function cancel(): void {
    fastTailAbortController?.abort();
    initialBackfillAbortController?.abort();
    fastTailAbortController = null;
    initialBackfillAbortController = null;
    backfillPlan = null;
    initialChannelId = null;
    initialBackfillPending.value = false;
    initialBackfillLoading.value = false;
  }

  function beginInitial(channelId: string, generation: number) {
    cancel();
    const useFastTail = input.shouldUseFastTail(channelId);
    const pageSize = useFastTail
      ? ECHO_CHANNEL_FAST_TAIL_PAGE_SIZE
      : ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE;
    const controller = new AbortController();
    fastTailAbortController = controller;
    initialChannelId = channelId;
    if (useFastTail) cancelChannelMessagePrefetch(channelId);
    return { controller, generation, pageSize, useFastTail };
  }

  function applyInitialResult(inputResult: {
    channelId: string;
    generation: number;
    pageSize: number;
    useFastTail: boolean;
    apiMessages: EchoApiMessage[];
    activeChannelIdForCap: string;
    startedAt: number;
  }) {
    const raw = mapEchoMessagesToRaw(inputResult.apiMessages);
    const rowsArrivedDuringFetch =
      (messageReadFacade.getChannelMessages(inputResult.channelId)?.length ??
        0) > 0;
    const synced = rowsArrivedDuringFetch
      ? (() => {
          applyEchoHistoryLatestPageFromApi(
            inputResult.channelId,
            raw,
            inputResult.activeChannelIdForCap,
          );
          messageWindowAuthority.setHasMoreOlder(
            inputResult.channelId,
            inputResult.apiMessages.length >= inputResult.pageSize,
          );
          return (
            messageReadFacade.getChannelMessages(inputResult.channelId) ?? []
          );
        })()
      : applyEchoHistoryInitialPageFromApi(
          inputResult.channelId,
          raw,
          inputResult.apiMessages.length,
          inputResult.activeChannelIdForCap,
          inputResult.pageSize,
        );
    const oldestLoadedId = synced[0]?.id;
    if (
      inputResult.useFastTail &&
      inputResult.apiMessages.length === ECHO_CHANNEL_FAST_TAIL_PAGE_SIZE &&
      oldestLoadedId
    ) {
      backfillPlan = {
        channelId: inputResult.channelId,
        generation: inputResult.generation,
        beforeMessageId: oldestLoadedId,
        attempted: false,
      };
      initialBackfillPending.value = true;
    }
    persistWarmHead(inputResult.channelId);
    if (inputResult.useFastTail) {
      emitDiagnostic({
        level: 'info',
        domain: 'perf',
        event: 'fast_tail_fetch',
        stage: 'success',
        durationMs: Math.max(0, Math.round(nowMs() - inputResult.startedAt)),
        context: {
          channelId: inputResult.channelId,
          received: inputResult.apiMessages.length,
          hasInitialBackfill: !!backfillPlan,
        },
      });
    }
    return synced;
  }

  function finishInitial(controller: AbortController): void {
    if (fastTailAbortController === controller) fastTailAbortController = null;
    if (!backfillPlan) initialChannelId = null;
  }

  function cancelForJump(channelId: string): boolean {
    if (
      channelId !== input.activeChannelId.value ||
      channelId !== initialChannelId ||
      (!fastTailAbortController && !backfillPlan)
    ) {
      return false;
    }
    cancel();
    return true;
  }

  async function loadInitialBackfill(): Promise<boolean> {
    const plan = backfillPlan;
    const cid = input.activeChannelId.value;
    if (
      !plan ||
      plan.attempted ||
      plan.channelId !== cid ||
      plan.generation !== input.currentGeneration() ||
      !input.auth.isAuthenticated ||
      !messageWindowAuthority.hasMoreOlder.value
    ) {
      return false;
    }
    plan.attempted = true;
    initialBackfillPending.value = false;
    const controller = new AbortController();
    initialBackfillAbortController?.abort();
    initialBackfillAbortController = controller;
    initialBackfillLoading.value = true;
    const startedAt = nowMs();
    try {
      const { messages } = await promiseWithTimeout(
        fetchEchoChannelMessages(input.auth.accessToken?.trim() ?? '', cid, {
          before: plan.beforeMessageId,
          limit: ECHO_CHANNEL_INITIAL_BACKFILL_PAGE_SIZE,
          signal: controller.signal,
        }),
        ECHO_HISTORY_LOAD_OLDER_TIMEOUT_MS,
        { label: 'Load initial message backfill' },
      );
      if (
        controller.signal.aborted ||
        plan.generation !== input.currentGeneration() ||
        cid !== input.activeChannelId.value
      ) {
        return false;
      }
      const { mergedOlderCount } = applyEchoHistoryOlderPageFromApi(
        cid,
        mapEchoMessagesToRaw(messages),
        messages.length,
        input.activeChannelId.value,
        ECHO_CHANNEL_INITIAL_BACKFILL_PAGE_SIZE,
      );
      persistWarmHead(cid);
      emitDiagnostic({
        level: 'info',
        domain: 'perf',
        event: 'initial_backfill',
        stage: 'success',
        durationMs: Math.max(0, Math.round(nowMs() - startedAt)),
        context: {
          channelId: cid,
          received: messages.length,
          mergedOlderCount,
          hasMoreOlder: messageWindowAuthority.hasMoreOlder.value,
        },
      });
      return mergedOlderCount > 0;
    } catch (error) {
      if (controller.signal.aborted) return false;
      messageWindowAuthority.setHasMoreOlder(cid, true);
      emitDiagnostic({
        level: 'warn',
        domain: 'perf',
        event: 'initial_backfill',
        stage: 'fail',
        context: {
          channelId: cid,
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return false;
    } finally {
      if (initialBackfillAbortController === controller) {
        initialBackfillAbortController = null;
      }
      if (plan.generation === input.currentGeneration()) {
        initialBackfillLoading.value = false;
      }
    }
  }

  return {
    initialBackfillLoading,
    initialBackfillPending,
    beginInitial,
    applyInitialResult,
    finishInitial,
    loadInitialBackfill,
    cancelForJump,
    cancel,
  };
}
