import type { RawMessage } from '@/features/chat/chatMessageTypes';
import { reactive } from 'vue';
import type {
  MentionEntity,
  MessageAttachmentPayload,
  ReplyTo,
} from '@shared/types';
import { getChannelIndex } from '@/features/chat/domain/channelMessageIndex';
import {
  ensureChannelBucket,
  updateChannelMessageInBucket,
} from '@/services/realtime/channelMessageAuthority';
import type { UiTransactionManager } from '@/ui/transactions/TransactionManager';
import {
  newClientMessageId,
  newCorrelationId,
  optimisticAuthorEchoPatch,
  type LocalAuthorEchoSnapshot,
  type SocketAdapterInstance,
} from '@/services/realtime/socketOutbound';
import {
  PENDING_CLIENT_MESSAGE_MAX_AGE_MS,
  recordPendingClientMessage,
} from '@/services/realtime/socketPendingClientMessages';
import type { PendingClientEchoMessage } from '@/services/realtime/socketPendingClientMessages';
import { assertOutboundSendSocketReady } from '@/services/realtime/socketOutboundSendPreflight';
import { reportPrimaryFlowFailure } from '@/utils/primaryFlowFailure';
import {
  socketDiagInfo,
  socketDiagWarn,
} from '@/observability/socketDiagnostics';
import { recordEmittedAttachmentUrls } from '@/services/realtime/attachmentSendDiag';

export type DeferredMediaOutboundSendDeps = {
  getAuthorId: () => string | undefined;
  socketOff: () => boolean;
  isSocketConnected: () => boolean;
  getAdapter: () => SocketAdapterInstance | null;
  appendChannelMessage: (channelId: string, msg: RawMessage) => void;
  cleanupOptimisticSend: (channelId: string, clientMessageId: string) => void;
  pendingSentMessages: PendingClientEchoMessage[];
  uiTx: UiTransactionManager;
  getLocalAuthorEcho?: () => LocalAuthorEchoSnapshot | undefined;
  dispatchEchoMessageFailed: (detail: Record<string, unknown>) => void;
};

let deps: DeferredMediaOutboundSendDeps | null = null;

const pendingMediaUploadKeys = new Set<string>();

/** Bumped when pending-send UI state changes so message rows re-render. */
export const outboundSendPendingUiState = reactive({ revision: 0 });

export function touchOutboundSendPendingUi(): void {
  outboundSendPendingUiState.revision += 1;
}

function pendingMediaUploadKey(channelId: string, messageId: string): string {
  return `${channelId}:${messageId}`;
}

function readOptimisticMessageContent(
  channelId: string,
  clientMessageId: string,
): string | undefined {
  const list = ensureChannelBucket(channelId);
  const index = getChannelIndex(channelId, list);
  return index.byId.get(clientMessageId)?.content;
}

export function registerDeferredMediaOutboundSend(
  next: DeferredMediaOutboundSendDeps,
): void {
  deps = next;
}

export function isDeferredMediaOutboundSendAvailable(): boolean {
  return deps != null;
}

/** True while attachments are still uploading locally (before the socket emit). */
export function isPendingMediaUploadMessage(
  channelId: string,
  messageId: string,
): boolean {
  const cid = channelId.trim();
  const mid = messageId.trim();
  if (!cid || !mid) return false;
  return pendingMediaUploadKeys.has(pendingMediaUploadKey(cid, mid));
}

export function isOutboundMessageSendPending(
  channelId: string,
  messageId: string,
): boolean {
  void outboundSendPendingUiState.revision;
  if (isPendingMediaUploadMessage(channelId, messageId)) return true;
  if (!deps) return false;
  const cid = channelId.trim();
  const mid = messageId.trim();
  if (!cid || !mid) return false;
  const nowMs = Date.now();
  return deps.pendingSentMessages.some(
    (entry) =>
      entry.channelId === cid &&
      entry.clientMessageId === mid &&
      nowMs - entry.createdAtMs <= PENDING_CLIENT_MESSAGE_MAX_AGE_MS,
  );
}

export function beginDeferredMediaOutboundSend(opts: {
  channelId: string;
  content: string;
  mentions: MentionEntity[];
  replyTo?: ReplyTo;
  optimisticAttachments: MessageAttachmentPayload[];
}): string | undefined {
  if (!deps) return undefined;

  const authorId = deps.getAuthorId()?.trim();
  if (!authorId) return undefined;

  const clientMessageId = newClientMessageId();
  const wireContent = opts.content.trim();

  deps.uiTx.beginTransaction({
    id: clientMessageId,
    type: 'message-send',
    state: 'pending',
    channelId: opts.channelId,
    clientMessageId,
  });

  deps.appendChannelMessage(opts.channelId, {
    id: clientMessageId,
    authorId,
    timestamp: new Date().toISOString(),
    content: wireContent,
    ...(opts.mentions.length ? { mentions: opts.mentions } : {}),
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    attachments: opts.optimisticAttachments,
    ...optimisticAuthorEchoPatch(deps.getLocalAuthorEcho),
  });

  pendingMediaUploadKeys.add(
    pendingMediaUploadKey(opts.channelId, clientMessageId),
  );
  touchOutboundSendPendingUi();

  return clientMessageId;
}

export function completeDeferredMediaOutboundSend(opts: {
  channelId: string;
  clientMessageId: string;
  content: string;
  mentions: MentionEntity[];
  replyTo?: ReplyTo;
  attachments: MessageAttachmentPayload[];
}): void {
  if (!deps) return;

  const { channelId, clientMessageId } = opts;
  pendingMediaUploadKeys.delete(
    pendingMediaUploadKey(channelId, clientMessageId),
  );
  touchOutboundSendPendingUi();

  const wireContent = opts.content.trim();
  const hasAttachments = opts.attachments.length > 0;

  if (hasAttachments) {
    updateChannelMessageInBucket(channelId, clientMessageId, {
      content: wireContent,
      attachments: opts.attachments,
      ...(opts.mentions.length ? { mentions: opts.mentions } : {}),
    });
  }

  if (!hasAttachments && wireContent) {
    updateChannelMessageInBucket(channelId, clientMessageId, {
      content: wireContent,
      attachments: undefined,
      ...(opts.mentions.length ? { mentions: opts.mentions } : {}),
    });
  }

  if (!hasAttachments && !wireContent) {
    deps.uiTx.rollbackTransaction(clientMessageId);
    return;
  }

  const authorId = deps.getAuthorId()?.trim();
  const liveSocketExpected = !deps.socketOff();

  try {
    assertOutboundSendSocketReady({
      channelId,
      contentPreviewSource: wireContent,
      liveSocketExpected,
      isSocketConnected: deps.isSocketConnected(),
      reportPrimaryFlowFailure,
      socketDiagInfo,
      socketDiagWarn,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    failDeferredMediaOutboundSend({
      channelId,
      clientMessageId,
      error: err,
      draftContent: wireContent,
    });
    throw err;
  }

  if (!deps.isSocketConnected()) {
    deps.uiTx.commitTransaction(clientMessageId);
    return;
  }

  const adapter = deps.getAdapter();
  if (!adapter) {
    const err = new Error(
      'Realtime connection is not ready. Wait for Echo to reconnect, then try again.',
    );
    failDeferredMediaOutboundSend({
      channelId,
      clientMessageId,
      error: err,
      draftContent: wireContent,
    });
    throw err;
  }

  if (authorId) {
    recordPendingClientMessage(
      deps.pendingSentMessages,
      {
        channelId,
        clientMessageId,
        authorId,
        replyToId: opts.replyTo?.messageId,
      },
      Date.now(),
    );
    touchOutboundSendPendingUi();
  }

  socketDiagInfo('emitting_deferred_media_message', {
    channelId,
    clientMessageId,
    attachmentCount: opts.attachments.length,
  });
  if (hasAttachments) {
    recordEmittedAttachmentUrls(opts.attachments.map((a) => a.url));
  }

  try {
    adapter.sendMessage({
      channelId,
      content: wireContent,
      mentions: opts.mentions,
      authorId,
      replyTo: opts.replyTo,
      id: clientMessageId,
      correlationId: newCorrelationId(),
      attachments: hasAttachments ? opts.attachments : undefined,
    });
  } catch (e) {
    deps.uiTx.rollbackTransaction(clientMessageId);
    throw e;
  }
}

export function failDeferredMediaOutboundSend(opts: {
  channelId: string;
  clientMessageId: string;
  error: Error;
  draftContent?: string;
}): void {
  if (!deps) return;

  pendingMediaUploadKeys.delete(
    pendingMediaUploadKey(opts.channelId, opts.clientMessageId),
  );
  touchOutboundSendPendingUi();

  const draftContent =
    opts.draftContent ??
    readOptimisticMessageContent(opts.channelId, opts.clientMessageId);

  deps.uiTx.rollbackTransaction(opts.clientMessageId);

  deps.dispatchEchoMessageFailed({
    code: 'UPLOAD_FAILED',
    channelId: opts.channelId,
    clientMessageId: opts.clientMessageId,
    detail: opts.error.message,
    draftContent,
  });
}
