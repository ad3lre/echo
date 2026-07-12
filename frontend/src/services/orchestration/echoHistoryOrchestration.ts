import { onScopeDispose, ref, watch, type Ref, type ShallowRef } from 'vue';
import { useAuthSessionStore } from '@/stores/authSession';
import { useEchoAttentionStore } from '@/stores/echoAttention';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import {
  fetchEchoChannelMessage,
  fetchEchoChannelMessages,
  fetchEchoAttentionSummary,
  putEchoChannelReadState,
} from '@/api/echoClient';
import { EchoApiError } from '@/api/echo/transport';
import { isEchoGraphId } from '@/utils/echoIds';
import {
  type ActionResult,
  okResult,
  toFailResultFromUnknown,
} from '@/types/actionResult';
import { propagateActionFailure } from '@/utils/actionFailurePropagation';
import {
  isBenignPrimaryFlowError,
  reportPrimaryFlowFailure,
} from '@/utils/primaryFlowFailure';
import { emitDiagnostic } from '@/observability/sessionDiagnostics';
import {
  hasChannelMessageInBucket,
  insertChannelMessageFromHistory,
  updateChannelMessageInBucket,
} from '@/services/realtime/channelMessageAuthority';
import {
  rawMessageBodyPatchFromApi,
  shouldRefreshRawMessageBodyFromApi,
} from '@/services/domain/messageDisplayPlain';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import {
  applyEchoHistoryChannelClientCap,
  applyEchoHistoryInitialPageFromApi,
  applyEchoHistoryLatestPageFromApi,
  applyEchoHistoryOlderPageFromApi,
  applyEchoHistorySeedFromCachedMessages,
} from '@/features/chat/domain/echoHistoryChannelApply';
import {
  ECHO_CHANNEL_INITIAL_MESSAGE_PAGE_SIZE,
  ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
} from '@/constants/echoHistoryPageSize';
import {
  mapEchoMessageToRaw,
  mapEchoMessagesToRaw,
} from '@/services/domain/echoMessageSnapshots';
import { logMessageList } from '@/utils/messageListDebugLog';
import { emitChatSwitchEvent } from '@/features/layout/chatSwitchPerfTrace';
import { scheduleDeferredTask } from '@/utils/scheduleDeferredTask';
import { dbgReadState } from '@/utils/echoReadStateDebug';
import { isEchoPendingOutboundMessageId } from '@/services/realtime/echoPendingClientMessageRegistry';
import { messageReadFacade } from '@/features/chat/domain/messageReadFacade';
import { isSeenAheadOfCursor } from '@/services/domain/echoMessageReadState';
import { withTransientFetchRetries } from '@/utils/retryTransientFetch';
import { dispatchAppToast } from '@/utils/controllerMissingAction';
import {
  isPromiseTimeoutError,
  promiseWithTimeout,
} from '@/utils/promiseTimeout';
import {
  ECHO_HISTORY_INITIAL_FETCH_TIMEOUT_MS,
  ECHO_HISTORY_LOAD_OLDER_TIMEOUT_MS,
  ECHO_HISTORY_PREFETCH_FETCH_TIMEOUT_MS,
} from '@/features/chat/constants/echoHistoryFetchTimeouts';
import { createEchoInitialHistoryStages } from './echoInitialHistoryStages';
export type CreateEchoHistoryControllerDeps = {
  activeChannelId: Ref<string>;
  auth: ReturnType<typeof useAuthSessionStore>;
  lastReadMessageIdByChannel: Ref<Record<string, string | null>>;
  echoAttention: Pick<
    ReturnType<typeof useEchoAttentionStore>,
    'replaceSnapshot' | 'reset' | 'patchReadState' | 'mergeReadStateUpdate'
  >;
  /**
   * When both are set, `dm-*` ids only load after they appear in workspace DM state
   * (real thread id from `/dm/threads` or `/dm/open`). This avoids calling
   * `GET …/channels/dm-<userId>/messages` for the optimistic DM shell used while `/dm/open` resolves.
   */
  echoDmThreadIds?: ShallowRef<Set<string>> | Ref<ReadonlySet<string>>;
  echoDmPeerByChannelId?:
    | ShallowRef<Map<string, string>>
    | Ref<ReadonlyMap<string, string>>;
  /** When true, cache-hit reopen skips tail sync and deferred attention refresh. */
  isRealtimeConnected?: () => boolean;
  activeServerId?: () => string | null | undefined;
  shouldUseFastTail?: (channelId: string) => boolean;
};

/** Controller owns history IO/timing; message bucket writes delegate to `channelMessageAuthority`. */
export function createEchoHistoryController(
  deps: CreateEchoHistoryControllerDeps,
) {
  const {
    activeChannelId,
    auth,
    lastReadMessageIdByChannel,
    echoAttention,
    echoDmThreadIds,
    echoDmPeerByChannelId,
    isRealtimeConnected,
    activeServerId,
    shouldUseFastTail,
  } = deps;

  const initialLoading = ref(false);
  const loadingOlder = ref(false);
  const error = ref<string | null>(null);
  const hasMoreOlder = messageWindowAuthority.hasMoreOlder;
  let initialLoadToken = 0;
  let prependLoadToken = 0;
  let jumpPrefetchToken = 0;
  const replyTargetBackfillLastAttemptMs = new Map<string, number>();
  const REPLY_TARGET_BACKFILL_DEDUP_MS = 30_000;
  let tailSyncToken = 0;
  const tailSyncLastAttemptMsByChannel = new Map<string, number>();
  const TAIL_SYNC_MIN_INTERVAL_MS = 2_000;
  const TAIL_SYNC_AFTER_CONNECT_DELAY_MS = 400;

  function bumpAllHistoryLoadTokensOnActiveChannelChange(): void {
    initialLoadToken += 1;
    prependLoadToken += 1;
    jumpPrefetchToken += 1;
    initialStages.cancel();
  }

  const initialStages = createEchoInitialHistoryStages({
    activeChannelId,
    auth,
    activeServerId,
    currentGeneration: () => initialLoadToken,
    shouldUseFastTail: shouldUseFastTail ?? (() => true),
  });
  const { initialBackfillLoading, initialBackfillPending } = initialStages;

  function invalidatePrependAndJumpForNewInitialFetch(): void {
    prependLoadToken += 1;
    jumpPrefetchToken += 1;
  }

  let pendingReadWriteTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingReadWriteChannelId = '';
  let pendingReadWriteMessageId = '';
  const READ_STATE_WRITE_DEBOUNCE_MS = 400;
  const READ_STATE_WRITE_RATE_LIMIT_RETRY_MS = 5_000;
  let deferredAttentionRefresh: ReturnType<typeof scheduleDeferredTask> | null =
    null;
  const activeChannelSeenMessageId = ref<string | null>(null);
  const seenReadExplicitChannelId = ref<string | null>(null);

  function applyEchoChannelClientCap(channelId: string): boolean {
    return applyEchoHistoryChannelClientCap(channelId, activeChannelId.value);
  }

  /**
   * History APIs accept persisted graph ids and legacy DM thread ids (`dm-*`).
   * Some existing DM/group threads still use `dm-*` channel ids from `/dm/threads`.
   *
   * `dm-<peerUserId>` is also used as a **client-only** shell while `/dm/open` runs; that id is not
   * a row in `echo_channels`, so we must not hit the messages API until the real channel id is known
   * or the legacy id is present in the hydrated DM thread registry.
   */
  function canLoadHistoryForChannelId(channelId: string): boolean {
    const cid = channelId.trim();
    if (isEchoGraphId(cid)) return true;
    if (!cid.startsWith('dm-')) return false;
    if (echoDmThreadIds && echoDmPeerByChannelId) {
      return (
        echoDmThreadIds.value.has(cid) || echoDmPeerByChannelId.value.has(cid)
      );
    }
    return true;
  }

  function isPersistedHistoryAnchor(
    channelId: string,
    messageId: string | undefined,
  ): boolean {
    const normalizedMessageId = messageId?.trim() ?? '';
    if (!normalizedMessageId || !isEchoGraphId(normalizedMessageId)) {
      return false;
    }
    return !isEchoPendingOutboundMessageId(channelId, normalizedMessageId);
  }

  async function refreshAttentionSnapshot(reason: string, channelId?: string) {
    if (!auth.isAuthenticated) {
      dbgReadState('attention_refresh_skipped', {
        channelId: channelId ?? null,
        reason,
        isAuthenticated: auth.isAuthenticated,
      });
      return;
    }
    dbgReadState('attention_refresh_start', {
      channelId: channelId ?? null,
      reason,
    });
    emitDiagnostic({
      level: 'info',
      domain: 'api',
      event: 'echo_history_attention_refresh',
      stage: 'start',
      context: { channelId: channelId ?? null, reason },
    });
    try {
      const snapshot = await withTransientFetchRetries(() =>
        fetchEchoAttentionSummary(''),
      );
      echoAttention.replaceSnapshot(snapshot);
      dbgReadState('attention_refresh_success', {
        channelId: channelId ?? null,
        reason,
      });
      emitDiagnostic({
        level: 'info',
        domain: 'api',
        event: 'echo_history_attention_refresh',
        stage: 'success',
        context: { channelId: channelId ?? null, reason },
      });
    } catch (e) {
      dbgReadState('attention_refresh_fail', {
        channelId: channelId ?? null,
        reason,
        message: e instanceof Error ? e.message : String(e),
      });
      emitDiagnostic({
        level: 'warn',
        domain: 'api',
        event: 'echo_history_attention_refresh',
        stage: 'fail',
        context: { channelId: channelId ?? null, reason },
      });
      const fr = toFailResultFromUnknown(
        e,
        'ATTENTION_REFRESH_FAILED',
        'Could not refresh attention state.',
        true,
      );
      propagateActionFailure(fr, {
        flow: 'fetchEchoAttentionSummary',
        context: 'attention_refresh',
        extraContext: { channelId, reason },
        cause: e,
      });
    }
  }

  function scheduleAttentionRefresh(reason: string, channelId?: string): void {
    deferredAttentionRefresh?.cancel();
    deferredAttentionRefresh = null;
    if (channelId && !isEchoGraphId(channelId)) {
      dbgReadState('attention_refresh_schedule_skipped', {
        channelId,
        reason,
        isEchoGraphId: isEchoGraphId(channelId),
      });
      return;
    }
    dbgReadState('attention_refresh_scheduled', {
      channelId: channelId ?? null,
      reason,
    });
    deferredAttentionRefresh = scheduleDeferredTask(
      () => {
        deferredAttentionRefresh = null;
        void refreshAttentionSnapshot(reason, channelId);
      },
      {
        timeoutMs: 1500,
        fallbackDelayMs: 400,
      },
    );
  }

  async function hydrateAttentionSnapshot() {
    if (!auth.isAuthenticated) {
      echoAttention.reset();
      return;
    }
    try {
      const snapshot = await withTransientFetchRetries(() =>
        fetchEchoAttentionSummary(''),
      );
      echoAttention.replaceSnapshot(snapshot);
    } catch (e) {
      const fr = toFailResultFromUnknown(
        e,
        'ATTENTION_SNAPSHOT_FAILED',
        'Could not hydrate attention state.',
        true,
      );
      propagateActionFailure(fr, {
        flow: 'fetchEchoAttentionSummary',
        context: 'attention_snapshot',
        cause: e,
      });
    }
  }

  async function persistReadState(
    channelId: string,
    lastReadMessageId: string,
  ): Promise<void> {
    if (!auth.isAuthenticated || !isEchoGraphId(channelId)) {
      dbgReadState('write_skipped', {
        channelId,
        lastReadMessageId,
        isAuthenticated: auth.isAuthenticated,
        isEchoGraphId: isEchoGraphId(channelId),
      });
      return;
    }
    if (isEchoPendingOutboundMessageId(channelId, lastReadMessageId)) {
      dbgReadState('write_skipped_pending_outbound', {
        channelId,
        lastReadMessageId,
      });
      return;
    }
    dbgReadState('write_start', { channelId, lastReadMessageId });
    emitDiagnostic({
      level: 'info',
      domain: 'api',
      event: 'echo_history_read_state_write',
      stage: 'start',
      context: { channelId, lastReadMessageId },
    });
    try {
      const readState = await putEchoChannelReadState(
        '',
        channelId,
        lastReadMessageId,
      );
      echoAttention.mergeReadStateUpdate(
        channelId,
        readState.lastReadMessageId,
        readState.channelAttention,
      );
      dbgReadState('write_success', { channelId, lastReadMessageId });
      emitDiagnostic({
        level: 'info',
        domain: 'api',
        event: 'echo_history_read_state_write',
        stage: 'success',
        context: { channelId, lastReadMessageId },
      });
    } catch (e) {
      if (
        e instanceof EchoApiError &&
        e.status === 403 &&
        e.body.code === 'GUEST_FORBIDDEN'
      ) {
        dbgReadState('write_skip_guest', { channelId, lastReadMessageId });
        scheduleAttentionRefresh('write_fail', channelId);
        return;
      }
      if (
        e instanceof EchoApiError &&
        e.status === 404 &&
        e.body.code === 'NOT_FOUND' &&
        (e.body.message === 'Message not in this channel' ||
          e.message.includes('Message not in this channel'))
      ) {
        dbgReadState('write_skip_stale_anchor', {
          channelId,
          lastReadMessageId,
        });
        scheduleAttentionRefresh('write_fail', channelId);
        return;
      }
      if (
        e instanceof EchoApiError &&
        e.status === 429 &&
        (e.body.code === 'RATE_LIMIT' ||
          e.body.code === 'RATE_LIMITED' ||
          e.message.toLowerCase().includes('too many'))
      ) {
        dbgReadState('write_rate_limited_retry', {
          channelId,
          lastReadMessageId,
        });
        if (pendingReadWriteTimer) clearTimeout(pendingReadWriteTimer);
        pendingReadWriteChannelId = channelId;
        pendingReadWriteMessageId = lastReadMessageId;
        pendingReadWriteTimer = setTimeout(() => {
          pendingReadWriteTimer = null;
          void persistReadState(
            pendingReadWriteChannelId,
            pendingReadWriteMessageId,
          );
        }, READ_STATE_WRITE_RATE_LIMIT_RETRY_MS);
        scheduleAttentionRefresh('write_fail', channelId);
        return;
      }
      dbgReadState('write_fail', {
        channelId,
        lastReadMessageId,
        message: e instanceof Error ? e.message : String(e),
      });
      emitDiagnostic({
        level: 'warn',
        domain: 'api',
        event: 'echo_history_read_state_write',
        stage: 'fail',
        context: { channelId, lastReadMessageId },
      });
      const fr = toFailResultFromUnknown(
        e,
        'READ_STATE_WRITE_FAILED',
        'Could not save your read position.',
        true,
      );
      propagateActionFailure(fr, {
        flow: 'putEchoChannelReadState',
        context: 'read_state_write',
        extraContext: { channelId, lastReadMessageId },
        cause: e,
      });
      scheduleAttentionRefresh('write_fail', channelId);
    }
  }

  function scheduleReadStateWrite(
    channelId: string,
    lastReadMessageId: string,
  ): void {
    if (!channelId || !lastReadMessageId || !isEchoGraphId(channelId)) {
      dbgReadState('write_schedule_skipped', {
        channelId,
        lastReadMessageId,
        isEchoGraphId: channelId ? isEchoGraphId(channelId) : false,
      });
      return;
    }
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'hidden'
    ) {
      dbgReadState('write_schedule_skipped_hidden', { channelId });
      return;
    }
    if (isEchoPendingOutboundMessageId(channelId, lastReadMessageId)) {
      dbgReadState('write_schedule_skipped_pending_outbound', {
        channelId,
        lastReadMessageId,
      });
      if (pendingReadWriteTimer && pendingReadWriteChannelId === channelId) {
        clearTimeout(pendingReadWriteTimer);
        pendingReadWriteTimer = null;
        pendingReadWriteChannelId = '';
        pendingReadWriteMessageId = '';
      }
      return;
    }
    dbgReadState('write_scheduled', { channelId, lastReadMessageId });
    if (
      pendingReadWriteTimer &&
      pendingReadWriteChannelId &&
      pendingReadWriteChannelId !== channelId &&
      pendingReadWriteMessageId
    ) {
      clearTimeout(pendingReadWriteTimer);
      pendingReadWriteTimer = null;
      void persistReadState(
        pendingReadWriteChannelId,
        pendingReadWriteMessageId,
      );
    }
    pendingReadWriteChannelId = channelId;
    pendingReadWriteMessageId = lastReadMessageId;
    if (pendingReadWriteTimer) clearTimeout(pendingReadWriteTimer);
    pendingReadWriteTimer = setTimeout(() => {
      pendingReadWriteTimer = null;
      void persistReadState(
        pendingReadWriteChannelId,
        pendingReadWriteMessageId,
      );
    }, READ_STATE_WRITE_DEBOUNCE_MS);
  }

  async function loadHistory() {
    const cid = activeChannelId.value;
    const token = auth.accessToken?.trim() ?? '';
    if (!cid || !auth.isAuthenticated || !canLoadHistoryForChannelId(cid)) {
      error.value = null;
      initialLoading.value = false;
      return;
    }
    const loadStartedAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const existing = messageReadFacade.getChannelMessages(cid);
    const oldestExistingMessageId = existing?.[0]?.id;
    const canTrustCachedHead = isPersistedHistoryAnchor(
      cid,
      oldestExistingMessageId,
    );
    if (existing && existing.length > 0 && canTrustCachedHead) {
      applyEchoHistorySeedFromCachedMessages(
        cid,
        existing as RawMessage[],
        activeChannelId.value,
      );
      error.value = null;
      initialLoading.value = false;
      const durationMs = Math.max(
        0,
        Math.round(
          (typeof performance !== 'undefined'
            ? performance.now()
            : Date.now()) - loadStartedAt,
        ),
      );
      emitDiagnostic({
        level: 'info',
        domain: 'perf',
        event: 'echo_history_step2_load_initial',
        stage: 'success',
        durationMs,
        context: {
          channelId: cid,
          source: 'cache',
          existingMessageCount: existing.length,
          hasMoreOlder: hasMoreOlder.value,
        },
      });
      emitChatSwitchEvent({
        event: 'chat_switch_merge_done',
        channelId: cid,
        context: {
          source: 'cache',
          storedMessageCount: existing.length,
          hasMoreOlder: hasMoreOlder.value,
        },
      });
      logMessageList('history', 'loadHistory_cache_hit', {
        channelId: cid,
        durationMs,
        existingMessageCount: existing.length,
        hasMoreOlder: hasMoreOlder.value,
        outcomeOk: true,
        expectation: 'cached bucket seeds active window immediately',
      });
      const realtimeConnected = isRealtimeConnected?.() ?? false;
      if (!realtimeConnected) {
        scheduleAttentionRefresh('history_cache_hit', cid);
        void syncActiveChannelTailFromApi('history_cache_hit').finally(() => {
          scheduleMissingReplyTargetBackfill(cid, 'history_cache_hit');
        });
      } else {
        scheduleMissingReplyTargetBackfill(cid, 'history_cache_hit');
      }
      return;
    }
    invalidatePrependAndJumpForNewInitialFetch();
    const seq = ++initialLoadToken;
    const initialStage = initialStages.beginInitial(cid, seq);
    const {
      controller: initialAbortController,
      pageSize: initialPageSize,
      useFastTail,
    } = initialStage;
    initialLoading.value = true;
    error.value = null;
    messageWindowAuthority.setHasMoreOlder(cid, true);
    emitDiagnostic({
      level: 'info',
      domain: 'api',
      event: 'echo_history_load_initial',
      stage: 'start',
      context: {
        channelId: cid,
        seq,
        pageSize: initialPageSize,
        useFastTail,
      },
    });
    logMessageList('history', 'loadHistory_initial_api_start', {
      channelId: cid,
      seq,
      pageSize: initialPageSize,
      source: 'network',
      outcomeOk: true,
      expectation:
        'cold channel load: visible history skeleton stays up until API result applies',
    });
    emitChatSwitchEvent({
      event: 'chat_switch_fetch_start',
      channelId: cid,
      context: {
        source: 'network',
        seq,
        pageSize: initialPageSize,
      },
    });
    try {
      const { messages: apiMsgs } = await promiseWithTimeout(
        fetchEchoChannelMessages(token, cid, {
          limit: initialPageSize,
          signal: initialAbortController.signal,
        }),
        ECHO_HISTORY_INITIAL_FETCH_TIMEOUT_MS,
        { label: 'Load messages' },
      );
      if (seq !== initialLoadToken) return;
      emitChatSwitchEvent({
        event: 'chat_switch_fetch_end',
        channelId: cid,
        context: {
          source: 'network',
          seq,
          apiMessageCount: apiMsgs.length,
        },
      });
      const synced = initialStages.applyInitialResult({
        channelId: cid,
        generation: seq,
        pageSize: initialPageSize,
        useFastTail,
        apiMessages: apiMsgs,
        activeChannelIdForCap: activeChannelId.value,
        startedAt: loadStartedAt,
      });
      emitDiagnostic({
        level: 'info',
        domain: 'api',
        event: 'echo_history_load_initial',
        stage: 'success',
        context: {
          channelId: cid,
          seq,
          apiMessageCount: apiMsgs.length,
          storedMessageCount: synced.length,
          hasMoreOlder: hasMoreOlder.value,
        },
      });
      const durationMs = Math.max(
        0,
        Math.round(
          (typeof performance !== 'undefined'
            ? performance.now()
            : Date.now()) - loadStartedAt,
        ),
      );
      emitDiagnostic({
        level: 'info',
        domain: 'perf',
        event: 'echo_history_step2_load_initial',
        stage: 'success',
        durationMs,
        context: {
          channelId: cid,
          source: 'network',
          seq,
          apiMessageCount: apiMsgs.length,
          storedMessageCount: synced.length,
          hasMoreOlder: hasMoreOlder.value,
        },
      });
      emitChatSwitchEvent({
        event: 'chat_switch_merge_done',
        channelId: cid,
        context: {
          source: 'network',
          seq,
          apiMessageCount: apiMsgs.length,
          storedMessageCount: synced.length,
          hasMoreOlder: hasMoreOlder.value,
        },
      });
      logMessageList('history', 'loadHistory_initial_api_success', {
        channelId: cid,
        seq,
        durationMs,
        apiMessageCount: apiMsgs.length,
        storedMessageCount: synced.length,
        hasMoreOlder: hasMoreOlder.value,
        outcomeOk: synced.length > 0 || apiMsgs.length === 0,
        expectation:
          'cold load should populate active window and let the history skeleton disappear',
      });
      scheduleAttentionRefresh('history_loaded', cid);
      scheduleMissingReplyTargetBackfill(cid, 'history_loaded');
    } catch (e) {
      if (seq !== initialLoadToken) return;
      if (initialAbortController.signal.aborted) return;
      const durationMs = Math.max(
        0,
        Math.round(
          (typeof performance !== 'undefined'
            ? performance.now()
            : Date.now()) - loadStartedAt,
        ),
      );
      emitDiagnostic({
        level: 'warn',
        domain: 'api',
        event: 'echo_history_load_initial',
        stage: 'fail',
        context: { channelId: cid, seq },
      });
      emitDiagnostic({
        level: 'warn',
        domain: 'perf',
        event: 'echo_history_step2_load_initial',
        stage: 'fail',
        durationMs,
        context: {
          channelId: cid,
          source: 'network',
          seq,
        },
      });
      logMessageList('history', 'loadHistory_initial_api_error', {
        channelId: cid,
        seq,
        durationMs,
        message: e instanceof Error ? e.message : String(e),
        outcomeOk: false,
        expectation: 'cold load failed so the history skeleton cannot complete',
      });
      if (isPromiseTimeoutError(e)) {
        error.value = 'Timed out loading messages';
        dispatchAppToast(
          'This channel took too long to load. Switch channels or try again.',
          'warning',
        );
        reportPrimaryFlowFailure('fetchEchoChannelMessages', e, {
          cid,
          timeoutMs: e.timeoutMs,
          timedOut: true,
        });
      } else if (
        isBenignPrimaryFlowError(e, 'fetchEchoChannelMessages', { cid })
      ) {
        error.value = null;
      } else {
        reportPrimaryFlowFailure('fetchEchoChannelMessages', e, { cid });
        error.value =
          e instanceof Error ? e.message : 'Failed to load messages';
      }
    } finally {
      initialStages.finishInitial(initialAbortController);
      if (seq === initialLoadToken) initialLoading.value = false;
    }
  }

  async function loadOlder(): Promise<boolean> {
    const cid = activeChannelId.value;
    const token = auth.accessToken?.trim() ?? '';
    if (
      !cid ||
      !auth.isAuthenticated ||
      !canLoadHistoryForChannelId(cid) ||
      initialBackfillLoading.value
    ) {
      logMessageList('history', 'loadOlder_not_started', {
        reason: !cid
          ? 'no_channel'
          : !auth.isAuthenticated
            ? 'not_authenticated'
            : 'unsupported_channel_id',
        cid: cid ?? null,
      });
      return false;
    }
    const list = messageReadFacade.getChannelMessages(cid);
    const first = list?.[0];
    if (!first?.id || !hasMoreOlder.value) {
      logMessageList('history', 'loadOlder_not_started', {
        reason: !first?.id ? 'no_first_message_id' : 'hasMoreOlder_false',
        channelId: cid,
        listLength: list?.length ?? 0,
      });
      return false;
    }
    const seq = ++prependLoadToken;
    loadingOlder.value = true;
    error.value = null;
    const olderLoadStartedAt =
      import.meta.env.DEV && typeof performance !== 'undefined'
        ? performance.now()
        : 0;
    emitDiagnostic({
      level: 'info',
      domain: 'api',
      event: 'echo_history_load_older',
      stage: 'start',
      context: {
        channelId: cid,
        seq,
        before: first.id,
        pageSize: ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
      },
    });
    logMessageList('history', 'loadOlder_api_start', {
      channelId: cid,
      seq,
      beforeMessageId: first.id,
      pageSize: ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
      note: 'seq correlates with prepend token; MessageList prepend uses separate txId',
    });
    try {
      const { messages: apiMsgs } = await promiseWithTimeout(
        fetchEchoChannelMessages(token, cid, {
          before: first.id,
          limit: ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
        }),
        ECHO_HISTORY_LOAD_OLDER_TIMEOUT_MS,
        { label: 'Load older messages' },
      );
      if (seq !== prependLoadToken) {
        logMessageList('history', 'loadOlder_api_stale_seq', {
          channelId: cid,
          seq,
          currentPrependToken: prependLoadToken,
          outcomeOk: false,
          expectation:
            'discard result — user changed channel or invalidated prepend',
        });
        return false;
      }
      if (apiMsgs.length === 0) {
        messageWindowAuthority.setHasMoreOlder(cid, false);
        logMessageList('history', 'loadOlder_api_empty_page', {
          channelId: cid,
          seq,
          beforeMessageId: first.id,
          outcomeOk: true,
          expectation: 'no older rows from API — hasMoreOlder cleared',
        });
        return false;
      }
      const older = mapEchoMessagesToRaw(apiMsgs);
      const { mergedOlderCount } = applyEchoHistoryOlderPageFromApi(
        cid,
        older,
        apiMsgs.length,
        activeChannelId.value,
      );
      const synced = messageReadFacade.getChannelMessages(cid) ?? [];
      emitDiagnostic({
        level: 'info',
        domain: 'api',
        event: 'echo_history_load_older',
        stage: 'success',
        context: {
          channelId: cid,
          seq,
          before: first.id,
          apiMessageCount: apiMsgs.length,
          mergedOlderCount,
          totalMessageCount: synced.length,
          hasMoreOlder: hasMoreOlder.value,
        },
      });
      if (
        import.meta.env.DEV &&
        typeof performance !== 'undefined' &&
        seq === prependLoadToken
      ) {
        emitDiagnostic({
          level: 'info',
          domain: 'api',
          event: 'echo_history_step2_load_older',
          stage: 'success',
          context: {
            channelId: cid,
            durationMs: Math.round(performance.now() - olderLoadStartedAt),
            mergedOlderCount,
            apiMessageCount: apiMsgs.length,
          },
        });
      }
      logMessageList('history', 'loadOlder_api_success', {
        channelId: cid,
        seq,
        durationMs:
          typeof performance !== 'undefined' && olderLoadStartedAt
            ? Math.round(performance.now() - olderLoadStartedAt)
            : undefined,
        mergedOlderCount,
        apiMessageCount: apiMsgs.length,
        totalMessageCount: synced.length,
        hasMoreOlder: hasMoreOlder.value,
        outcomeOk: mergedOlderCount > 0,
        expectation:
          'mergedOlderCount > 0 so MessageList loadOlder can return true and run prepend restore',
      });
      scheduleMissingReplyTargetBackfill(cid, 'load_older');
      return mergedOlderCount > 0;
    } catch (e) {
      if (seq !== prependLoadToken) return false;
      logMessageList('history', 'loadOlder_api_error', {
        channelId: cid,
        seq,
        beforeMessageId: first.id,
        message: e instanceof Error ? e.message : String(e),
        outcomeOk: false,
        expectation: 'no merge — prepend transaction should not restore',
      });
      emitDiagnostic({
        level: 'warn',
        domain: 'api',
        event: 'echo_history_load_older',
        stage: 'fail',
        context: { channelId: cid, seq, before: first.id },
      });
      if (isPromiseTimeoutError(e)) {
        error.value = 'Timed out loading older messages';
        dispatchAppToast(
          'Older messages took too long to load. Scroll up to retry.',
          'warning',
        );
        reportPrimaryFlowFailure('fetchEchoChannelMessages.older', e, {
          cid,
          timedOut: true,
          timeoutMs: e.timeoutMs,
        });
      } else if (
        isBenignPrimaryFlowError(e, 'fetchEchoChannelMessages.older', { cid })
      ) {
        error.value = null;
      } else {
        reportPrimaryFlowFailure('fetchEchoChannelMessages.older', e, { cid });
        error.value =
          e instanceof Error ? e.message : 'Failed to load older messages';
      }
      return false;
    } finally {
      if (seq === prependLoadToken && cid === activeChannelId.value) {
        loadingOlder.value = false;
      }
    }
  }

  watch(
    () => activeChannelId.value,
    (_cid, prevCid) => {
      activeChannelSeenMessageId.value = null;
      seenReadExplicitChannelId.value = null;
      deferredAttentionRefresh?.cancel();
      deferredAttentionRefresh = null;
      if (prevCid === undefined) return;
      bumpAllHistoryLoadTokensOnActiveChannelChange();
      loadingOlder.value = false;
    },
  );

  watch(
    [
      activeChannelId,
      () => auth.isAuthenticated,
      ...(echoDmThreadIds && echoDmPeerByChannelId
        ? [echoDmThreadIds, echoDmPeerByChannelId]
        : []),
    ],
    loadHistory,
    { immediate: true },
  );

  watch(
    () => auth.isAuthenticated,
    () => {
      void hydrateAttentionSnapshot();
    },
    { immediate: true },
  );

  function isSeenAheadInChannel(
    channelId: string,
    seenId: string,
    cursorId: string,
  ): boolean {
    return isSeenAheadOfCursor(
      seenId,
      cursorId,
      messageReadFacade.getChannelMessages(channelId),
    );
  }

  watch(
    () => ({
      channelId:
        seenReadExplicitChannelId.value?.trim() || activeChannelId.value,
      seenMessageId: activeChannelSeenMessageId.value,
    }),
    ({ channelId, seenMessageId }) => {
      if (!channelId || !isEchoGraphId(channelId)) {
        dbgReadState('seen_message_skipped_non_graph_id', {
          activeChannelId: channelId,
          seenMessageId,
        });
        return;
      }
      if (!seenMessageId) {
        dbgReadState('seen_message_missing', {
          channelId,
          seenMessageId: null,
        });
        return;
      }
      const prevLastReadMessageId =
        lastReadMessageIdByChannel.value[channelId] ?? null;
      if (
        prevLastReadMessageId &&
        !isSeenAheadInChannel(channelId, seenMessageId, prevLastReadMessageId)
      ) {
        dbgReadState('seen_message_not_ahead', {
          channelId,
          seenMessageId,
          prevLastReadMessageId,
        });
        return;
      }
      dbgReadState('seen_message_changed', {
        channelId,
        seenMessageId,
        prevLastReadMessageId,
      });
      echoAttention.patchReadState(channelId, seenMessageId);
      dbgReadState('seen_message_applied_locally', {
        channelId,
        seenMessageId,
      });
      scheduleReadStateWrite(channelId, seenMessageId);
    },
    { immediate: true },
  );

  function reportSeenMessageId(
    seenMessageId: string | null,
    explicitReportChannelId?: string | null,
  ): void {
    const normalizedSeenMessageId = seenMessageId?.trim() ?? '';
    activeChannelSeenMessageId.value = normalizedSeenMessageId || null;
    if (!normalizedSeenMessageId) {
      seenReadExplicitChannelId.value = null;
    } else {
      const ec = explicitReportChannelId?.trim() ?? '';
      seenReadExplicitChannelId.value = ec || null;
    }
    dbgReadState('seen_message_reported', {
      channelId:
        seenReadExplicitChannelId.value?.trim() || activeChannelId.value,
      seenMessageId: activeChannelSeenMessageId.value,
    });
  }

  onScopeDispose(() => {
    deferredAttentionRefresh?.cancel();
    initialStages.cancel();
    initialLoading.value = false;
    initialBackfillLoading.value = false;
    loadingOlder.value = false;
  });

  async function syncActiveChannelTailFromApi(reason: string): Promise<void> {
    const cid = activeChannelId.value;
    const token = auth.accessToken?.trim() ?? '';
    if (!cid || !auth.isAuthenticated || !canLoadHistoryForChannelId(cid)) {
      return;
    }
    const local = messageReadFacade.getChannelMessages(cid);
    if (!local?.length) return;

    const now = Date.now();
    const last = tailSyncLastAttemptMsByChannel.get(cid) ?? 0;
    if (now - last < TAIL_SYNC_MIN_INTERVAL_MS) return;
    tailSyncLastAttemptMsByChannel.set(cid, now);

    const seq = ++tailSyncToken;
    try {
      const { messages: apiMsgs } = await withTransientFetchRetries(() =>
        fetchEchoChannelMessages(token, cid, {
          limit: ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
        }),
      );
      if (seq !== tailSyncToken || cid !== activeChannelId.value) return;

      const raw = mapEchoMessagesToRaw(apiMsgs);
      const index = messageWindowAuthority.getIndex(cid);
      let refreshedExisting = 0;
      for (const apiRow of raw) {
        const id = apiRow.id?.trim();
        if (!id) continue;
        const local = index.byId.get(id);
        if (!local) continue;
        if (!shouldRefreshRawMessageBodyFromApi(local, apiRow)) continue;
        updateChannelMessageInBucket(
          cid,
          id,
          rawMessageBodyPatchFromApi(apiRow),
        );
        refreshedExisting += 1;
      }
      const missing = raw.filter((m) => m.id && !index.byId.has(m.id));
      scheduleMissingReplyTargetBackfill(cid, reason);
      if (missing.length === 0 && refreshedExisting === 0) return;

      const { mergedNewerCount } = applyEchoHistoryLatestPageFromApi(
        cid,
        missing,
        activeChannelId.value,
      );
      if (mergedNewerCount === 0 && refreshedExisting === 0) return;

      logMessageList('history', 'syncActiveChannelTailFromApi', {
        channelId: cid,
        reason,
        apiMessageCount: apiMsgs.length,
        mergedNewerCount,
        refreshedExisting,
        outcomeOk: true,
        expectation:
          'background tail sync fills gaps and refreshes stale bodies after missed realtime or partial optimistic rows',
      });
      emitDiagnostic({
        level: 'info',
        domain: 'api',
        event: 'echo_history_tail_sync',
        stage: 'success',
        context: {
          channelId: cid,
          reason,
          apiMessageCount: apiMsgs.length,
          mergedNewerCount,
          refreshedExisting,
        },
      });
    } catch (e) {
      if (seq !== tailSyncToken) return;
      logMessageList('history', 'syncActiveChannelTailFromApi_fail', {
        channelId: cid,
        reason,
        outcomeOk: false,
        expectation: 'tail sync is best-effort; realtime + scroll still work',
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function scheduleActiveChannelTailSyncAfterConnect(reason: string): void {
    const cid = activeChannelId.value;
    if (!cid) return;
    setTimeout(() => {
      if (activeChannelId.value !== cid) return;
      void syncActiveChannelTailFromApi(reason);
    }, TAIL_SYNC_AFTER_CONNECT_DELAY_MS);
  }

  /**
   * After history load / tail sync, quoted originals may still be outside the local bucket
   * (refresh + cache-only window). Realtime only backfills on inbound `message`; this covers
   * messages already present in the loaded page.
   */
  function scheduleMissingReplyTargetBackfill(
    channelId: string,
    reason: string,
  ): void {
    const cid = channelId.trim();
    if (!cid || cid !== activeChannelId.value) return;
    const list = messageReadFacade.getChannelMessages(cid);
    if (!list?.length) return;
    const pending: string[] = [];
    for (const msg of list) {
      const rid = msg.replyTo?.messageId?.trim();
      if (!rid || hasChannelMessageInBucket(cid, rid)) continue;
      const key = `${cid}\u001f${rid}`;
      const now = Date.now();
      const last = replyTargetBackfillLastAttemptMs.get(key) ?? 0;
      if (now - last < REPLY_TARGET_BACKFILL_DEDUP_MS) continue;
      replyTargetBackfillLastAttemptMs.set(key, now);
      pending.push(rid);
    }
    if (pending.length === 0) return;
    logMessageList('history', 'missing_reply_target_backfill', {
      channelId: cid,
      reason,
      targetCount: pending.length,
      outcomeOk: true,
      expectation:
        'prefetch quoted originals missing from bucket so reply rows and targets render after refresh',
    });
    for (const rid of pending) {
      void prefetchUntilMessageVisible(cid, rid);
    }
  }

  async function prefetchUntilMessageVisible(
    channelId: string,
    messageId: string,
    maxPages = 12,
  ): Promise<ActionResult> {
    if (initialStages.cancelForJump(channelId)) {
      initialLoadToken += 1;
    }
    const token = auth.accessToken?.trim() ?? '';
    if (!auth.isAuthenticated || !canLoadHistoryForChannelId(channelId)) {
      return okResult();
    }
    if (channelId !== activeChannelId.value) return okResult();
    const seq = ++jumpPrefetchToken;
    let pagesLoaded = 0;
    function emitStep2PrefetchStats(targetFound: boolean) {
      if (!import.meta.env.DEV) return;
      emitDiagnostic({
        level: 'info',
        domain: 'api',
        event: 'echo_history_step2_prefetch_pages',
        stage: 'success',
        context: {
          channelId,
          messageId,
          pagesLoaded,
          targetFound,
        },
      });
    }
    try {
      const { message } = await promiseWithTimeout(
        fetchEchoChannelMessage(token, channelId, messageId),
        ECHO_HISTORY_PREFETCH_FETCH_TIMEOUT_MS,
        { label: 'Load target message' },
      );
      if (seq !== jumpPrefetchToken || channelId !== activeChannelId.value) {
        return okResult();
      }
      const raw = mapEchoMessageToRaw(message);
      const { inserted } = insertChannelMessageFromHistory(channelId, raw);
      if (inserted) {
        applyEchoChannelClientCap(channelId);
      }
    } catch (e) {
      if (seq !== jumpPrefetchToken) return okResult();
      const fr = toFailResultFromUnknown(
        e,
        'FETCH_MESSAGE_FAILED',
        'Could not load the target message.',
        true,
      );
      propagateActionFailure(fr, {
        flow: 'fetchEchoChannelMessage',
        context: 'prefetch_jump',
        extraContext: { channelId, messageId },
        cause: e,
      });
      return fr;
    }
    if (hasChannelMessageInBucket(channelId, messageId)) {
      emitStep2PrefetchStats(true);
      return okResult();
    }
    for (let p = 0; p < maxPages; p++) {
      if (seq !== jumpPrefetchToken || channelId !== activeChannelId.value) {
        return okResult();
      }
      if (hasChannelMessageInBucket(channelId, messageId)) {
        emitStep2PrefetchStats(true);
        return okResult();
      }
      const list = messageReadFacade.getChannelMessages(channelId);
      if (!list?.length) {
        try {
          const { messages: apiMsgs } = await promiseWithTimeout(
            fetchEchoChannelMessages(token, channelId, {
              limit: ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
            }),
            ECHO_HISTORY_PREFETCH_FETCH_TIMEOUT_MS,
            { label: 'Prefetch message history' },
          );
          if (
            seq !== jumpPrefetchToken ||
            channelId !== activeChannelId.value
          ) {
            return okResult();
          }
          const firstPage = mapEchoMessagesToRaw(apiMsgs);
          applyEchoHistoryInitialPageFromApi(
            channelId,
            firstPage,
            apiMsgs.length,
            activeChannelId.value,
          );
          pagesLoaded += 1;
        } catch (e) {
          if (seq !== jumpPrefetchToken) return okResult();
          const fr = toFailResultFromUnknown(
            e,
            'PREFETCH_FIRST_PAGE_FAILED',
            'Could not load message history.',
            true,
          );
          propagateActionFailure(fr, {
            flow: 'fetchEchoChannelMessages.prefetch',
            context: 'prefetch_jump',
            extraContext: { channelId, page: p },
            cause: e,
          });
          return fr;
        }
        continue;
      }
      const first = list[0];
      if (!first?.id) {
        emitStep2PrefetchStats(false);
        return okResult();
      }
      try {
        const { messages: apiMsgs } = await promiseWithTimeout(
          fetchEchoChannelMessages(token, channelId, {
            before: first.id,
            limit: ECHO_CHANNEL_MESSAGE_PAGE_SIZE,
          }),
          ECHO_HISTORY_PREFETCH_FETCH_TIMEOUT_MS,
          { label: 'Prefetch older messages' },
        );
        if (seq !== jumpPrefetchToken || channelId !== activeChannelId.value) {
          return okResult();
        }
        if (apiMsgs.length === 0) {
          emitStep2PrefetchStats(false);
          return okResult();
        }
        const older = mapEchoMessagesToRaw(apiMsgs);
        const { mergedOlderCount } = applyEchoHistoryOlderPageFromApi(
          channelId,
          older,
          apiMsgs.length,
          activeChannelId.value,
        );
        if (mergedOlderCount === 0) {
          emitStep2PrefetchStats(false);
          return okResult();
        }
        pagesLoaded += 1;
      } catch (e) {
        if (seq !== jumpPrefetchToken) return okResult();
        const fr = toFailResultFromUnknown(
          e,
          'PREFETCH_PAGE_FAILED',
          'Could not load older messages while opening that message.',
          true,
        );
        propagateActionFailure(fr, {
          flow: 'fetchEchoChannelMessages.prefetch.page',
          context: 'prefetch_jump',
          extraContext: { channelId, page: p },
          cause: e,
        });
        return fr;
      }
    }
    emitStep2PrefetchStats(hasChannelMessageInBucket(channelId, messageId));
    return okResult();
  }

  watch(
    activeChannelId,
    (cid) => {
      messageWindowAuthority.setActiveChannel(cid);
      // Eagerly mark loading so MessageList shows skeletons immediately after
      // the channel window clears — without this, there is a render gap between
      // setActiveChannel (orderedIds → []) and the async loadHistory watcher
      // where isEmpty=true and initialLoading=false causes "No messages here yet"
      // to flash before the skeleton appears.
      if (cid && auth.isAuthenticated && canLoadHistoryForChannelId(cid)) {
        initialLoading.value = true;
      }
    },
    { immediate: true, flush: 'sync' },
  );

  return {
    initialLoading,
    initialBackfillLoading,
    initialBackfillPending,
    loadingOlder,
    error,
    hasMoreOlder,
    loadOlder,
    loadInitialBackfill: () =>
      loadingOlder.value
        ? Promise.resolve(false)
        : initialStages.loadInitialBackfill(),
    reload: loadHistory,
    hydrateAttentionSnapshot,
    prefetchUntilMessageVisible,
    syncActiveChannelTailFromApi,
    scheduleActiveChannelTailSyncAfterConnect,
    lastReadMessageIdByChannel,
    applyEchoChannelClientCap,
    reportSeenMessageId,
  };
}
