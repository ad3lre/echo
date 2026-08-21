import { ref, type Ref } from 'vue';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import type { MessageRequestEntry } from '@/features/layout/echoWorkspace/types';
import type { useAuthSessionStore } from '@/features/auth/authSession';
import type { useServerStore } from '@/features/layout/server';
import type { DmSubView } from '@/features/layout/mainSurface';
import { isEchoAuthUserId, isEchoGraphId } from '@/features/layout/ids/echoIds';
import { echoDmChannelIdForPeerUser } from '@/features/dm/buildDmPanelUserList';
import { clientOnlyDmOpenShellIdForPeerUser } from '@/features/dm/dmOpenShellChannelId';
import { openEchoDirectDmChannel } from '@/features/dm/echoDmCommandFacade';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';

import { reportPrimaryFlowFailure } from '@/features/layout/failures/primaryFlowFailure';
import { dispatchAppToast } from '@/features/layout/failures/controllerMissingAction';
import { dbgReadState } from '@/features/layout/echoReadStateDebug';

function isAbortError(e: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      e instanceof DOMException &&
      e.name === 'AbortError') ||
    (e instanceof Error && e.name === 'AbortError')
  );
}

function relocateChannelMessages(
  messages: Ref<Record<string, RawMessage[]>>,
  fromKey: string,
  toKey: string,
) {
  if (fromKey === toKey) return;
  const rec = messages.value;
  const slice = rec[fromKey];
  if (!slice?.length) return;
  const target = rec[toKey] ?? [];
  if (!target.length) {
    rec[toKey] = slice;
    delete rec[fromKey];
    return;
  }
  const byId = new Map<string, RawMessage>();
  for (const msg of target) {
    if (msg?.id) byId.set(msg.id, msg);
  }
  const merged = [...target];
  for (const msg of slice) {
    if (!msg?.id || !byId.has(msg.id)) {
      merged.push(msg);
    }
  }
  rec[toKey] = merged;
  delete rec[fromKey];
}

/** True when the local bucket has a persisted anchor suitable for instant render. */
function channelHasTrustedMessageCache(
  messages: Ref<Record<string, RawMessage[]>> | undefined,
  channelId: string,
): boolean {
  const cid = channelId.trim();
  if (!messages || !cid) return false;
  const slice = messages.value[cid];
  if (!slice?.length) return false;
  const headId = slice[0]?.id?.trim() ?? '';
  return isEchoGraphId(headId);
}

function isKnownPersistedDirectDmThread(
  channelId: string | null | undefined,
  echoDmThreadIds: ReadonlySet<string>,
): boolean {
  const cid = channelId?.trim() ?? '';
  return !!cid && isEchoGraphId(cid) && echoDmThreadIds.has(cid);
}

export function useAppLayoutOpenDmThread(deps: {
  selectedDMUserId: Ref<string | null>;
  dmActiveTab: Ref<DmSubView>;
  selectedMessageRequestId: Ref<string | null>;
  serverStore: ReturnType<typeof useServerStore>;
  pfpBarExpanded: Ref<boolean>;
  authSession: ReturnType<typeof useAuthSessionStore>;
  activeChannelId: Ref<string>;
  echoDmPeerByChannelId: Ref<Map<string, string>>;
  echoDmThreadIds: Ref<Set<string>>;
  /** Live message buckets (shared with `useEchoHistory` / `useSocket`); optional for tests. */
  messages?: Ref<Record<string, RawMessage[]>>;
  /** Pending request threads so accepting friendship keeps visible history. */
  messageRequests?: Ref<MessageRequestEntry[]>;
  /** Compact shell: close DM list overlay after picking a user so the chat column is visible. */
  isCompactShell?: Ref<boolean>;
  isDMPanelOpen?: Ref<boolean>;
  /** Guests cannot open DMs; show upgrade instead of a broken thread. */
  onGuestDmBlocked?: () => void;
}) {
  const {
    selectedDMUserId,
    dmActiveTab,
    selectedMessageRequestId,
    serverStore,
    pfpBarExpanded,
    authSession,
    activeChannelId,
    echoDmPeerByChannelId,
    echoDmThreadIds,
    messages,
    messageRequests,
    isCompactShell,
    isDMPanelOpen,
    onGuestDmBlocked,
  } = deps;

  /** Monotonic guard so a slower `postEchoOpenDm` cannot overwrite UI after the user picks another DM. */
  let openDmSeq = 0;
  let openDmInFlightCount = 0;
  /** True while `/dm/open` is resolving so UI can show loading instead of empty-state copy. */
  const isOpeningDmThread = ref(false);

  function applyResolvedDirectDmChannel(
    userId: string,
    channelId: string,
    dmShellId: string,
  ): string {
    activeChannelId.value = channelId;
    if (messages) {
      relocateChannelMessages(messages, dmShellId, channelId);
      const requestChannelId = messageRequests?.value.find(
        (r) => r.fromUserId === userId,
      )?.channelId;
      if (requestChannelId?.trim()) {
        relocateChannelMessages(messages, requestChannelId, channelId);
      }
      const previousPeerChannelId = Array.from(
        echoDmPeerByChannelId.value.entries(),
      ).find(([knownChannelId, knownPeerUserId]) => {
        return knownPeerUserId === userId && knownChannelId !== channelId;
      })?.[0];
      if (previousPeerChannelId?.trim()) {
        relocateChannelMessages(messages, previousPeerChannelId, channelId);
      }
    }
    dbgReadState('dm_real_channel_active', { channelId });
    const m = new Map(echoDmPeerByChannelId.value);
    m.set(channelId, userId);
    echoDmPeerByChannelId.value = m;
    const s = new Set(echoDmThreadIds.value);
    s.add(channelId);
    echoDmThreadIds.value = s;
    return channelId;
  }

  /** Resolves the DM channel id used for messaging, or `null` if superseded / aborted. */
  async function onSelectDmUser(userId: string): Promise<string | null> {
    if (authSession.backendUser?.isGuest === true) {
      onGuestDmBlocked?.();
      return null;
    }
    const seq = ++openDmSeq;
    selectedDMUserId.value = userId;
    dmActiveTab.value = 'messages';
    selectedMessageRequestId.value = null;
    serverStore.selectServer('echo');
    pfpBarExpanded.value = false;
    if (isCompactShell?.value && isDMPanelOpen?.value) {
      isDMPanelOpen.value = false;
    }
    const token = authSession.accessToken?.trim() ?? '';
    const previousChannelId = activeChannelId.value;
    const dmShellId = clientOnlyDmOpenShellIdForPeerUser(userId);
    const persistedPeerChannelId = echoDmChannelIdForPeerUser(
      userId,
      echoDmPeerByChannelId.value,
    );
    dbgReadState('dm_select', {
      userId,
      dmShellId,
      persistedPeerChannelId: persistedPeerChannelId ?? null,
      previousChannelId,
      isAuthenticated: authSession.isAuthenticated,
      isMockDataMode: echoSyncCapabilities.isMockDataMode,
    });

    const useRealOpen =
      !echoSyncCapabilities.isMockDataMode &&
      authSession.isAuthenticated &&
      isEchoAuthUserId(userId);

    if (useRealOpen) {
      // `deriveMainSurface` only treats `dm-*` / persisted thread ids as an open DM; without this,
      // `activeChannelId` stays on the prior channel until `/dm/open` returns and the main pane
      // incorrectly shows `dmMessagesIdle` for the whole request.
      activeChannelId.value = persistedPeerChannelId ?? dmShellId;
      dbgReadState(
        persistedPeerChannelId
          ? 'dm_persisted_channel_active'
          : 'dm_optimistic_shell_active',
        persistedPeerChannelId
          ? { channelId: persistedPeerChannelId }
          : { dmShellId },
      );

      if (
        persistedPeerChannelId &&
        isKnownPersistedDirectDmThread(
          persistedPeerChannelId,
          echoDmThreadIds.value,
        )
      ) {
        dbgReadState('dm_open_skip_hydrated', {
          userId,
          channelId: persistedPeerChannelId,
        });
        if (seq !== openDmSeq || selectedDMUserId.value !== userId) {
          return null;
        }
        return applyResolvedDirectDmChannel(
          userId,
          persistedPeerChannelId,
          dmShellId,
        );
      }

      const showOpenLoading = !channelHasTrustedMessageCache(
        messages,
        persistedPeerChannelId ?? dmShellId,
      );
      if (showOpenLoading) {
        openDmInFlightCount += 1;
        isOpeningDmThread.value = openDmInFlightCount > 0;
      }
      try {
        const channelId = await openEchoDirectDmChannel(token, userId);
        dbgReadState('dm_open_result', {
          userId,
          channelId: channelId ?? null,
        });
        if (seq !== openDmSeq || selectedDMUserId.value !== userId) {
          return null;
        }
        if (channelId) {
          return applyResolvedDirectDmChannel(userId, channelId, dmShellId);
        }
        // Keep the optimistic DM shell selected so the user does not snap back
        // to an unrelated server channel when `/dm/open` returns no channel id.
        if (seq === openDmSeq && selectedDMUserId.value === userId) {
          activeChannelId.value = dmShellId;
          dbgReadState('dm_open_no_channel_keep_shell', { dmShellId });
        } else {
          activeChannelId.value = previousChannelId;
          dbgReadState('dm_open_no_channel_restore_prev', {
            previousChannelId,
          });
        }
        return null;
      } catch (e) {
        if (seq !== openDmSeq) return null;
        if (isAbortError(e)) {
          dispatchAppToast(
            'Opening the conversation timed out. Check your connection and try again.',
            'warning',
          );
        } else {
          reportPrimaryFlowFailure('postEchoOpenDm', e, { userId });
        }
        // Preserve DM visual context on request failure instead of bouncing to
        // the previously selected server channel.
        if (selectedDMUserId.value === userId) {
          activeChannelId.value = dmShellId;
          dbgReadState('dm_open_fail_keep_shell', {
            dmShellId,
            message: e instanceof Error ? e.message : String(e),
          });
        } else {
          activeChannelId.value = previousChannelId;
          dbgReadState('dm_open_fail_restore_prev', {
            previousChannelId,
            message: e instanceof Error ? e.message : String(e),
          });
        }
        return null;
      } finally {
        if (showOpenLoading) {
          openDmInFlightCount = Math.max(0, openDmInFlightCount - 1);
          isOpeningDmThread.value = openDmInFlightCount > 0;
        }
      }
    }

    if (seq !== openDmSeq || selectedDMUserId.value !== userId) {
      return null;
    }
    activeChannelId.value = dmShellId;
    dbgReadState('dm_mock_shell_active', { dmShellId });
    return dmShellId;
  }

  return {
    onSelectDmUser,
    isOpeningDmThread,
  };
}
