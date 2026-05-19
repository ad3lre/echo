import type { MessageReaction } from '@shared/types';
import type { RawMessage } from '@/features/chat/chatMessageTypes';

export type UITransactionMessageSend = {
  id: string;
  type: 'message-send';
  state: 'pending' | 'confirmed' | 'failed';
  channelId: string;
  clientMessageId: string;
};

export type UITransactionReactionToggle = {
  id: string;
  type: 'reaction-toggle';
  state: 'pending' | 'confirmed' | 'failed';
  channelId: string;
  messageId: string;
  correlationId: string;
  previousReactions: MessageReaction[] | undefined;
};

export type UITransactionMessageEdit = {
  id: string;
  type: 'message-edit';
  state: 'pending' | 'confirmed' | 'failed';
  channelId: string;
  messageId: string;
  correlationId: string;
  previousMessage: RawMessage;
};

export type UITransactionMessageDelete = {
  id: string;
  type: 'message-delete';
  state: 'pending' | 'confirmed' | 'failed';
  channelId: string;
  messageId: string;
  correlationId: string;
  deletedMessage: RawMessage;
  deletedIndex: number;
};

export type UITransactionMessagePin = {
  id: string;
  type: 'message-pin';
  state: 'pending' | 'confirmed' | 'failed';
  channelId: string;
  messageId: string;
  correlationId: string;
  kind: 'pin' | 'unpin';
  previousPinnedIds: string[];
};

export type UITransaction =
  | UITransactionMessageSend
  | UITransactionReactionToggle
  | UITransactionMessageEdit
  | UITransactionMessageDelete
  | UITransactionMessagePin;

export type UITransactionType = UITransaction['type'];

export type TransactionLifecycleHandler = {
  rollback: (tx: UITransaction) => void;
  /** Called when server success is observed; may be a no-op if UI already matches server. */
  commit: (tx: UITransaction) => void;
};

export function newUiCorrelationId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Central registry for optimistic UI: every feature registers rollback/commit for its transaction type.
 */
export function createUiTransactionManager() {
  const handlers = new Map<UITransactionType, TransactionLifecycleHandler>();
  const byId = new Map<string, UITransaction>();

  function register(
    type: UITransactionType,
    handler: TransactionLifecycleHandler,
  ): void {
    handlers.set(type, handler);
  }

  function beginTransaction(tx: UITransaction): void {
    if (byId.has(tx.id)) return;
    byId.set(tx.id, { ...tx, state: 'pending' });
  }

  function getPending(id: string): UITransaction | undefined {
    const tx = byId.get(id);
    if (!tx || tx.state !== 'pending') return undefined;
    return tx;
  }

  function rollbackTransaction(id: string): void {
    const tx = byId.get(id);
    if (!tx || tx.state !== 'pending') return;
    const h = handlers.get(tx.type);
    h?.rollback(tx);
    byId.delete(id);
  }

  function commitTransaction(id: string): void {
    const tx = byId.get(id);
    if (!tx || tx.state !== 'pending') return;
    const h = handlers.get(tx.type);
    h?.commit(tx);
    byId.delete(id);
  }

  /** After `message:reactions`, server snapshot is authoritative — drop pending reaction txs for that message. */
  function commitPendingReactionTogglesForMessage(
    channelId: string,
    messageId: string,
  ): void {
    const toCommit: string[] = [];
    for (const [id, tx] of byId) {
      if (
        tx.type === 'reaction-toggle' &&
        tx.state === 'pending' &&
        tx.channelId === channelId &&
        tx.messageId === messageId
      ) {
        toCommit.push(id);
      }
    }
    for (const id of toCommit) commitTransaction(id);
  }

  /** After `message:updated`, drop pending edit txs for that row (server body is authoritative). */
  function commitPendingMessageEditForMessage(
    channelId: string,
    messageId: string,
  ): void {
    const toCommit: string[] = [];
    for (const [id, tx] of byId) {
      if (
        tx.type === 'message-edit' &&
        tx.state === 'pending' &&
        tx.channelId === channelId &&
        tx.messageId === messageId
      ) {
        toCommit.push(id);
      }
    }
    for (const id of toCommit) commitTransaction(id);
  }

  /** After `message:deleted`, drop pending delete txs for that row. */
  function commitPendingMessageDeleteForMessage(
    channelId: string,
    messageId: string,
  ): void {
    const toCommit: string[] = [];
    for (const [id, tx] of byId) {
      if (
        tx.type === 'message-delete' &&
        tx.state === 'pending' &&
        tx.channelId === channelId &&
        tx.messageId === messageId
      ) {
        toCommit.push(id);
      }
    }
    for (const id of toCommit) commitTransaction(id);
  }

  /** After `message:pins`, server list is authoritative — drop pending pin/unpin txs for the channel. */
  function commitPendingPinMutationsForChannel(channelId: string): void {
    const toCommit: string[] = [];
    for (const [id, tx] of byId) {
      if (
        tx.type === 'message-pin' &&
        tx.state === 'pending' &&
        tx.channelId === channelId
      ) {
        toCommit.push(id);
      }
    }
    for (const id of toCommit) commitTransaction(id);
  }

  return {
    register,
    beginTransaction,
    getPending,
    rollbackTransaction,
    commitTransaction,
    commitPendingReactionTogglesForMessage,
    commitPendingMessageEditForMessage,
    commitPendingMessageDeleteForMessage,
    commitPendingPinMutationsForChannel,
  };
}

export type UiTransactionManager = ReturnType<
  typeof createUiTransactionManager
>;
