import { nextTick, type Ref } from 'vue';
import { ECHO_CONTENT_SCHEMA_VERSION } from '@shared/echoMessageFormatV2';
import { useAuthSessionStore } from '@/stores/authSession';
import { useEchoSessionStore } from '@/stores/echoSession';
import { authPatchMe } from '@/api/authClient';
import { postEchoPresenceHttp } from '@/api/echoClient';
import { buildComposerDocFromPlain } from '@/features/chat/editor/composerModel';
import { plainTextFromEchoContentJson } from '@/features/chat/editor/echoContentJsonPlainText';
import { relocateMentionsInEditableText } from '@/features/chat/editor/messageEditDraft';
import {
  docContainsRichContentJsonBlocks,
  rebuildContentJsonPreservingRichBlocks,
} from '@shared/richBlockContentJson';
import { deriveMessageComponentsFromContentJson } from '@shared/buttonRowContentJson';
import { patchImageSlotFill } from '@shared/imageSlotContentJson';
import { writeSortedMessagesForChannel } from '@/services/realtime/channelMessageBucket';
import {
  overwriteLocalProfileFromAuthUser,
  saveLocalProfile,
} from '@/utils/localProfilePersistence';
import { echoSyncCapabilities } from '@/platform/syncCapabilities';
import type { ActionResult } from '@/types/actionResult';
import { failResult } from '@/types/actionResult';
import { propagateActionFailure } from '@/utils/actionFailurePropagation';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import { MessageNavigator } from '@/features/navigation/messageNavigator';
import type { ActiveChatMessageNavApi } from '@/features/navigation/chatMessageNavBridge';
import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';
import { messageWindowAuthority } from '@/features/chat/domain/messageWindowAuthority';
import { getLatestDmPeerUserId } from '@/features/dm/buildDmPanelUserList';
import {
  newUiCorrelationId,
  type UiTransactionManager,
} from '@/ui/transactions/TransactionManager';
import { removeChannelMessageFromBucket } from '@/services/realtime/channelMessageAuthority';
import { emitDiagnostic } from '@/observability/sessionDiagnostics';
import { cloneRawMessageForUiTransaction } from '@/utils/cloneRawMessageForUiTransaction';
import {
  isDmThreadId,
  type DmSubView,
  type RailTab,
} from '@/features/layout/mainSurface';
import type { MentionEntity, MessageAttachmentPayload } from '@shared/types';

/** After switching channels, ChatView unmount can clear the nav bridge before the next surface registers. */
const CHAT_NAV_BRIDGE_WAIT_MS = [
  0, 16, 32, 48, 64, 100, 160, 240, 320, 450,
] as const;

async function waitForActiveChatNavBridge(
  activeChannelId: Ref<string>,
  getNav: () => ActiveChatMessageNavApi | null,
  targetChannelId: string,
): Promise<void> {
  for (let i = 0; i < CHAT_NAV_BRIDGE_WAIT_MS.length; i++) {
    const delayMs = CHAT_NAV_BRIDGE_WAIT_MS[i] ?? 0;
    if (delayMs > 0) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
    if (activeChannelId.value !== targetChannelId) return;
    if (getNav()) return;
  }
}

interface UserLike {
  id: string;
  status?: string;
}

interface UseAppLayoutMessageActionsOptions {
  activeChannelId: Ref<string>;
  currentUser: Ref<UserLike | undefined>;
  users: Ref<UserLike[]>;
  messages: Ref<Record<string, RawMessage[]>>;
  votePoll: (
    channelId: string,
    messageId: string,
    optionId: string,
    userId: string,
  ) => void;
  /** When set (Echo live mode), votes go to the backend instead of local mock mutation. */
  submitEchoPollVote?: (
    channelId: string,
    messageId: string,
    optionId: string,
  ) => void | ActionResult | Promise<ActionResult | void>;
  /** Persisted Echo: send `message:edit` over Socket.IO. */
  submitEchoMessageEdit?: (
    channelId: string,
    messageId: string,
    body: {
      content: string;
      contentJson?: unknown;
      contentSchemaVersion?: number;
      attachments?: MessageAttachmentPayload[];
    },
    correlationId?: string,
  ) => void | ActionResult | Promise<ActionResult | void>;
  /** Persisted Echo: soft-delete via `message:delete`. */
  submitEchoMessageDelete?: (
    channelId: string,
    messageId: string,
    correlationId?: string,
  ) => void | ActionResult | Promise<ActionResult | void>;
  submitEchoImageSlotFill?: (
    channelId: string,
    messageId: string,
    slotId: string,
    body: {
      imageUrl: string;
      storageKey?: string;
      width?: number;
      height?: number;
    },
    correlationId?: string,
  ) => void | ActionResult | Promise<ActionResult | void>;
  isMockDataMode?: boolean;
  uiTransactions?: UiTransactionManager;
  /** Connected socket + adapter (same as `isLiveReactionReady` from `useSocket`). */
  isLiveSocketReady?: () => boolean;
  toggleReaction: (
    channelId: string,
    messageId: string,
    emoji: string,
    userId: string,
  ) => boolean | Promise<boolean>;
  recordReaction: (emoji: string) => void;
  clearSearch: () => void;
  onSelectServerForChannel: (serverId: string) => void;
  onOpenServerChannel?: (serverId: string, channelId: string) => void;
  onSelectDmUser: (userId: string) => void | Promise<unknown>;
  /** Opens group DM (`dm-group-*`) from a thread id (DM rail + selection). */
  onSelectGroupDmChannel?: (channelId: string) => void;
  /**
   * Owning guild id for a server text channel, from the hydrated workspace tree.
   * Required for correct server/channel routing; do not derive server id from `channelId` strings
   * (UUID channel ids contain `-` and legacy `dm-*` ids are not guild-scoped).
   */
  resolveGuildServerIdForChannel?: (channelId: string) => string;
  /** Echo persisted DM channel → other user (for “latest DM” ordering). */
  resolveEchoDmPeer?: (channelId: string) => string | null;
  onAfterDeleteMessage?: (channelId: string, messageId: string) => void;
  /** Load history pages until the message exists (search jump-to / deep links). */
  prefetchEchoMessage?: (
    channelId: string,
    messageId: string,
  ) => Promise<ActionResult | void>;
  /** Active MessageList scroll API (registered by ChatView). */
  getActiveChatMessageNav: () => ActiveChatMessageNavApi | null;
  /** When set, jump-to-message leaves the DM notifications column so chat can mount. */
  dmActiveTab?: Ref<DmSubView>;
  activeRailTab?: Ref<RailTab>;
}

export function useAppLayoutMessageActions(
  options: UseAppLayoutMessageActionsOptions,
) {
  const authSession = useAuthSessionStore();
  const echoSession = useEchoSessionStore();
  const {
    activeChannelId,
    currentUser,
    users,
    messages,
    votePoll,
    submitEchoPollVote,
    toggleReaction,
    recordReaction,
    clearSearch,
    onSelectServerForChannel,
    onOpenServerChannel,
    onSelectDmUser,
    onSelectGroupDmChannel,
    resolveGuildServerIdForChannel,
    onAfterDeleteMessage,
    resolveEchoDmPeer,
    prefetchEchoMessage,
    submitEchoMessageEdit,
    submitEchoMessageDelete,
    isMockDataMode,
    uiTransactions,
    isLiveSocketReady,
    getActiveChatMessageNav,
    dmActiveTab,
    activeRailTab,
  } = options;

  function leaveDmNotificationsSubviewForJump(): void {
    if (
      dmActiveTab &&
      activeRailTab?.value === 'dm' &&
      dmActiveTab.value === 'notifications'
    ) {
      dmActiveTab.value = 'messages';
    }
  }

  function getLatestDMUserId(): string | null {
    const curId = currentUser.value?.id;
    if (!curId) return null;
    const indexedMessages: Record<
      string,
      readonly { timestamp?: string }[] | undefined
    > = {};
    const echoPeerByChannelId = new Map<string, string>();
    for (const [channelId, list] of Object.entries(messages.value)) {
      indexedMessages[channelId] = getChannelIndex(channelId, list ?? []).sorted
        .value as readonly { timestamp?: string }[];
      if (!channelId.startsWith('dm-') && resolveEchoDmPeer) {
        const peerId = resolveEchoDmPeer(channelId)?.trim() ?? '';
        if (peerId) echoPeerByChannelId.set(channelId, peerId);
      }
    }
    return getLatestDmPeerUserId({
      selfId: curId,
      echoPeerByChannelId,
      messages: indexedMessages,
      orderedOtherUserIds: users.value.map((u) => u.id),
    });
  }

  function selectDM(userId: string) {
    void onSelectDmUser(userId);
  }

  function handleGoToChannel(channelId: string) {
    const cid = channelId.trim();
    if (!cid) return;

    if (isDmThreadId(cid)) {
      if (cid.startsWith('dm-group-')) {
        if (onSelectGroupDmChannel) {
          onSelectGroupDmChannel(cid);
          return;
        }
        activeChannelId.value = cid;
        return;
      }
      const peer = cid.startsWith('dm-') ? cid.slice('dm-'.length) : '';
      if (peer) void onSelectDmUser(peer);
      activeChannelId.value = cid;
      return;
    }

    const serverId = resolveGuildServerIdForChannel?.(cid)?.trim() ?? '';
    if (serverId) {
      if (onOpenServerChannel) {
        onOpenServerChannel(serverId, cid);
        return;
      }
      onSelectServerForChannel(serverId);
    }
    activeChannelId.value = cid;
  }

  function handleGoToMessage(channelId: string, messageId: string) {
    leaveDmNotificationsSubviewForJump();
    handleGoToChannel(channelId);
    clearSearch();
    void (async () => {
      await nextTick();
      if (prefetchEchoMessage) {
        const pr = await prefetchEchoMessage(channelId, messageId);
        if (
          pr !== undefined &&
          typeof pr === 'object' &&
          'ok' in pr &&
          !(pr as ActionResult).ok
        ) {
          return;
        }
      }

      if (activeChannelId.value === channelId) {
        await waitForActiveChatNavBridge(
          activeChannelId,
          getActiveChatMessageNav,
          channelId,
        );
      }

      const result = await MessageNavigator.resolveAndScroll({
        channelId,
        messageId,
        strategy: ['memory', 'retry-dom'],
        deps: {
          getChannelMessages: (cid) => messages.value[cid] ?? [],
          activeChannelId: () => activeChannelId.value,
          scrollToMessage: async (cid, mid) => {
            if (cid !== activeChannelId.value) return false;
            const api = getActiveChatMessageNav();
            if (!api) return false;
            return api.scrollToMessage(mid);
          },
          flashHighlight: (mid) => {
            getActiveChatMessageNav()?.flashHighlight(mid);
          },
        },
      });

      if (!result.ok) {
        const fr = failResult(
          'MESSAGE_NOT_IN_VIEW',
          'Could not scroll to that message. It may have been deleted or is still loading.',
          true,
        );
        propagateActionFailure(fr, {
          flow: 'navigation.scroll_to_message',
          context: 'go_to_message',
          severity: 'warning',
          extraContext: { channelId, messageId },
          retryAction: () => handleGoToMessage(channelId, messageId),
        });
      }
    })();
  }

  let statusPatchSeq = 0;

  function updateCurrentUserStatus(
    status: 'online' | 'idle' | 'do_not_disturb' | 'offline',
  ) {
    const curId = currentUser.value?.id;
    if (!curId) return;
    const patchSeq = ++statusPatchSeq;
    users.value = users.value.map((user) =>
      user.id === curId ? { ...user, status } : user,
    );
    if (authSession.backendUser?.id === curId) {
      authSession.backendUser.status = status;
    }
    if (authSession.isAuthenticated && !echoSyncCapabilities.isMockDataMode) {
      echoSession.patchPresence(curId, status);
    }
    if (
      authSession.isAuthenticated &&
      !echoSyncCapabilities.isMockDataMode &&
      authSession.backendUser?.id === curId
    ) {
      void authPatchMe({ status })
        .then(({ user }) => {
          if (patchSeq !== statusPatchSeq) return;
          if (authSession.backendUser?.id === user.id) {
            Object.assign(authSession.backendUser, user);
            overwriteLocalProfileFromAuthUser(user);
          }
        })
        .catch((e) => {
          reportPrimaryFlowFailure('authPatchMe.status', e, { userId: curId });
        });
      // Auth PATCH is canonical for profile; Echo `/presence` updates the social graph + broadcasts `presence:update`.
      if (!echoSyncCapabilities.isMockDataMode) {
        void postEchoPresenceHttp('', status).catch((e) => {
          reportPrimaryFlowFailure('postEchoPresenceHttp', e, {
            userId: curId,
            status,
          });
        });
      }
    }
  }

  async function handlePollVote(messageId: string, optionId: string) {
    const userId = currentUser.value?.id;
    const cid = activeChannelId.value;
    if (!userId || !cid) return;
    if (submitEchoPollVote) {
      const raw = submitEchoPollVote(cid, messageId, optionId);
      let result: ActionResult | undefined;
      if (raw !== undefined) {
        const resolved = await raw;
        if (
          resolved !== undefined &&
          typeof resolved === 'object' &&
          'ok' in resolved
        ) {
          result = resolved as ActionResult;
        }
      }
      if (result && !result.ok) {
        propagateActionFailure(result, {
          flow: 'socket.poll_vote',
          context: 'poll_vote',
        });
        return;
      }
      votePoll(cid, messageId, optionId, userId);
      return;
    }
    votePoll(cid, messageId, optionId, userId);
  }

  async function handleReact(messageId: string, emoji: string) {
    const userId = currentUser.value?.id;
    const cid = activeChannelId.value;
    if (!userId || !cid) return;
    const applied = await toggleReaction(cid, messageId, emoji, userId);
    if (applied) recordReaction(emoji);
  }

  function deleteMessage(messageId: string) {
    const cid = activeChannelId.value;
    const list = cid ? messages.value[cid] : undefined;
    if (!list) return;
    const idx = list.findIndex((m) => m.id === messageId);
    if (idx < 0) return;

    const echoSocketDelete =
      cid &&
      submitEchoMessageDelete &&
      !isMockDataMode &&
      uiTransactions &&
      (isLiveSocketReady?.() ?? false);

    if (echoSocketDelete) {
      const tm = uiTransactions;
      const corr = newUiCorrelationId();
      const m = list[idx]!;
      tm.beginTransaction({
        id: corr,
        type: 'message-delete',
        state: 'pending',
        channelId: cid,
        messageId,
        correlationId: corr,
        deletedMessage: cloneRawMessageForUiTransaction(m),
        deletedIndex: idx,
      });
      if (!removeChannelMessageFromBucket(cid, messageId)) {
        tm.rollbackTransaction(corr);
        return;
      }
      void (async () => {
        const raw = submitEchoMessageDelete(cid, messageId, corr);
        let result: ActionResult | undefined;
        if (raw !== undefined) {
          const resolved = await raw;
          if (
            resolved !== undefined &&
            typeof resolved === 'object' &&
            'ok' in resolved
          ) {
            result = resolved as ActionResult;
          }
        }
        if (result && !result.ok) {
          tm.rollbackTransaction(corr);
          propagateActionFailure(result, {
            flow: 'socket.message_delete',
            context: 'message_delete',
          });
        }
      })();
      onAfterDeleteMessage?.(cid, messageId);
      return;
    }

    if (!removeChannelMessageFromBucket(cid, messageId)) return;
    onAfterDeleteMessage?.(cid, messageId);
  }

  /**
   * @returns false when the edit could not be queued (e.g. socket down); true when emitted or applied locally.
   * Server-side rejection still returns true here; `message_failed` rolls back optimistic UI and surfaces an error.
   */
  async function editMessage(
    messageId: string,
    newContent: string,
    attachmentSnapshot?: MessageAttachmentPayload[],
    composerBody?: {
      contentJson?: Record<string, unknown>;
      mentions?: MentionEntity[];
    },
  ): Promise<boolean> {
    const cid = activeChannelId.value;
    if (!cid) {
      emitDiagnostic({
        level: 'warn',
        domain: 'chat',
        event: 'message_edit',
        stage: 'fail',
        context: {
          action: 'editMessage',
          reason: 'missing_active_channel',
          messageId,
        },
      });
      return false;
    }
    let list = messages.value[cid];
    if (!list?.length && cid === messageWindowAuthority.getActiveChannelId()) {
      try {
        if (messageWindowAuthority.entitiesById.value.has(messageId)) {
          messageWindowAuthority.ensureChannelBucket(cid);
          list = messages.value[cid];
        }
      } catch {
        /* messageWindowAuthority not bound (e.g. isolated unit tests) */
      }
    }
    if (!list?.length) {
      emitDiagnostic({
        level: 'warn',
        domain: 'chat',
        event: 'message_edit',
        stage: 'fail',
        context: {
          action: 'editMessage',
          reason: 'empty_channel_bucket',
          channelId: cid,
          messageId,
        },
      });
      return false;
    }
    const index = getChannelIndex(cid, list);
    const m =
      index.byId.get(messageId) ??
      (cid === messageWindowAuthority.getActiveChannelId()
        ? messageWindowAuthority.entitiesById.value.get(messageId)
        : undefined);
    if (!m) {
      emitDiagnostic({
        level: 'warn',
        domain: 'chat',
        event: 'message_edit',
        stage: 'fail',
        context: {
          action: 'editMessage',
          reason: 'message_not_in_active_channel_bucket',
          channelId: cid,
          messageId,
          messageCount: list.length,
        },
      });
      return false;
    }

    const trimmed = newContent.trim();
    const mf = m.messageFormatVersion ?? 1;
    const relocatedMentions = relocateMentionsInEditableText(
      trimmed,
      m.mentions,
    );
    const mentionsForPatch =
      composerBody?.mentions !== undefined
        ? composerBody.mentions
        : relocatedMentions;
    const composerContentJson = composerBody?.contentJson;
    const docForV2 =
      mf >= 2
        ? composerContentJson !== undefined
          ? composerContentJson
          : docContainsRichContentJsonBlocks(m.contentJson)
            ? rebuildContentJsonPreservingRichBlocks(
                m.contentJson,
                trimmed,
                mentionsForPatch,
              )
            : buildComposerDocFromPlain(trimmed, mentionsForPatch, undefined)
        : undefined;
    const storedPlain =
      docForV2 !== undefined
        ? plainTextFromEchoContentJson(docForV2).trim() || trimmed
        : trimmed;
    const patch: Partial<RawMessage> = {
      content: storedPlain,
      editedAt: new Date().toISOString(),
    };
    if (composerBody?.mentions !== undefined) {
      patch.mentions = mentionsForPatch;
    } else if (mentionsForPatch.length > 0) {
      patch.mentions = mentionsForPatch;
    }
    if (docForV2 !== undefined) {
      patch.contentJson = docForV2;
      patch.contentSchemaVersion = ECHO_CONTENT_SCHEMA_VERSION;
      patch.messageFormatVersion = mf;
      patch.contentText = storedPlain;
      patch.components = deriveMessageComponentsFromContentJson(docForV2);
    }
    if (attachmentSnapshot !== undefined) {
      patch.attachments =
        attachmentSnapshot.length > 0 ? attachmentSnapshot : [];
    }

    function applyEditViaMessageIndex(): boolean {
      const curList = messages.value[cid];
      if (!curList?.length) {
        emitDiagnostic({
          level: 'warn',
          domain: 'chat',
          event: 'message_edit',
          stage: 'fail',
          context: {
            action: 'editMessage',
            reason: 'empty_bucket_during_apply',
            channelId: cid,
            messageId,
          },
        });
        return false;
      }
      const curIndex = getChannelIndex(cid, curList);
      if (!curIndex.byId.has(messageId)) {
        emitDiagnostic({
          level: 'warn',
          domain: 'chat',
          event: 'message_edit',
          stage: 'fail',
          context: {
            action: 'editMessage',
            reason: 'message_missing_during_apply',
            channelId: cid,
            messageId,
            messageCount: curList.length,
          },
        });
        return false;
      }
      curIndex.update(messageId, patch);
      writeSortedMessagesForChannel(messages.value, cid, curIndex);
      if (cid === messageWindowAuthority.getActiveChannelId()) {
        try {
          messageWindowAuthority.refreshActiveWindow();
        } catch {
          /* messageWindowAuthority not bound (e.g. isolated unit tests) */
        }
      }
      return true;
    }

    emitDiagnostic({
      level: 'info',
      domain: 'chat',
      event: 'message_edit',
      stage: 'attempt',
      context: {
        action: 'editMessage',
        channelId: cid,
        messageId,
        bytes: trimmed.length,
        detail: `mf=${mf} doc=${docForV2 !== undefined ? 1 : 0} mock=${isMockDataMode ? 1 : 0}`,
      },
    });

    if (cid && submitEchoMessageEdit && !isMockDataMode) {
      const useTx = !!(uiTransactions && (isLiveSocketReady?.() ?? false));
      let corr: string | undefined;
      if (useTx && uiTransactions) {
        corr = newUiCorrelationId();
        uiTransactions.beginTransaction({
          id: corr,
          type: 'message-edit',
          state: 'pending',
          channelId: cid,
          messageId,
          correlationId: corr,
          previousMessage: cloneRawMessageForUiTransaction(m),
        });
        if (!applyEditViaMessageIndex()) {
          uiTransactions.rollbackTransaction(corr);
          return false;
        }
      }
      let raw: void | ActionResult | Promise<ActionResult | void>;
      if (docForV2 !== undefined) {
        raw = submitEchoMessageEdit(
          cid,
          messageId,
          {
            content: trimmed,
            contentJson: docForV2,
            contentSchemaVersion: ECHO_CONTENT_SCHEMA_VERSION,
            ...(attachmentSnapshot !== undefined
              ? { attachments: attachmentSnapshot }
              : {}),
          },
          corr,
        );
      } else {
        raw = submitEchoMessageEdit(
          cid,
          messageId,
          {
            content: trimmed,
            ...(attachmentSnapshot !== undefined
              ? { attachments: attachmentSnapshot }
              : {}),
          },
          corr,
        );
      }
      let result: ActionResult | undefined;
      if (raw !== undefined) {
        const resolved = await raw;
        if (
          resolved !== undefined &&
          typeof resolved === 'object' &&
          'ok' in resolved
        ) {
          result = resolved as ActionResult;
        }
      }
      if (result && !result.ok) {
        emitDiagnostic({
          level: 'warn',
          domain: 'chat',
          event: 'message_edit',
          stage: 'fail',
          context: {
            action: 'editMessage',
            channelId: cid,
            messageId,
            ok: false,
            code: result.error?.code,
            detail: result.error?.userMessage,
          },
        });
        if (corr && uiTransactions) uiTransactions.rollbackTransaction(corr);
        propagateActionFailure(result, {
          flow: 'socket.message_edit',
          context: 'message_edit',
        });
        return false;
      }
      if (!useTx) {
        if (!applyEditViaMessageIndex()) return false;
      }
      return true;
    }
    return applyEditViaMessageIndex();
  }

  async function fillImageSlot(
    messageId: string,
    slotId: string,
    body: {
      imageUrl: string;
      storageKey?: string;
      width?: number;
      height?: number;
    },
  ): Promise<boolean> {
    const cid = options.activeChannelId.value?.trim();
    if (!cid || !messageId || !slotId) return false;
    const submit = options.submitEchoImageSlotFill;
    if (!submit) {
      propagateActionFailure(
        failResult('UNAVAILABLE', 'Image slot fill is unavailable', true),
        {
          flow: 'socket.message_fill_image_slot',
          context: 'message_fill_image_slot',
        },
      );
      return false;
    }

    const list = messages.value[cid];
    if (list?.length) {
      const index = getChannelIndex(cid, list);
      const prev = index.byId.get(messageId);
      if (prev?.contentJson) {
        const patched = patchImageSlotFill(prev.contentJson, slotId, body);
        if (patched.ok) {
          index.update(messageId, { contentJson: patched.doc });
          writeSortedMessagesForChannel(messages.value, cid, index);
        }
      }
    }

    const r = await Promise.resolve(
      submit(cid, messageId, slotId, body, newUiCorrelationId()),
    );
    if (r && typeof r === 'object' && 'ok' in r && !r.ok) {
      propagateActionFailure(r, {
        flow: 'socket.message_fill_image_slot',
        context: 'message_fill_image_slot',
      });
      return false;
    }
    return true;
  }

  return {
    getLatestDMUserId,
    selectDM,
    handleGoToChannel,
    handleGoToMessage,
    updateCurrentUserStatus,
    handlePollVote,
    handleReact,
    deleteMessage,
    editMessage,
    fillImageSlot,
  };
}
