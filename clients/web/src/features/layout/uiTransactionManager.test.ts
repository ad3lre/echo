import { describe, expect, it } from 'vitest';
import { createUiTransactionManager } from './uiTransactionManager';

describe('createUiTransactionManager', () => {
  it('rollback invokes handler and drops pending tx', () => {
    const tm = createUiTransactionManager();
    let rolled = false;
    tm.register('message-send', {
      rollback() {
        rolled = true;
      },
      commit() {},
    });
    tm.beginTransaction({
      id: 'mid',
      type: 'message-send',
      state: 'pending',
      channelId: 'c1',
      clientMessageId: 'mid',
    });
    expect(tm.getPending('mid')).toBeDefined();
    tm.rollbackTransaction('mid');
    expect(rolled).toBe(true);
    expect(tm.getPending('mid')).toBeUndefined();
  });

  it('commit invokes handler and drops pending tx', () => {
    const tm = createUiTransactionManager();
    let committed = false;
    tm.register('message-send', {
      rollback() {},
      commit() {
        committed = true;
      },
    });
    tm.beginTransaction({
      id: 'mid',
      type: 'message-send',
      state: 'pending',
      channelId: 'c1',
      clientMessageId: 'mid',
    });
    tm.commitTransaction('mid');
    expect(committed).toBe(true);
    expect(tm.getPending('mid')).toBeUndefined();
  });

  it('commitPendingReactionTogglesForMessage commits all matching pending', () => {
    const tm = createUiTransactionManager();
    const committed: string[] = [];
    tm.register('reaction-toggle', {
      rollback() {},
      commit() {
        committed.push('ok');
      },
    });
    tm.beginTransaction({
      id: 'r1',
      type: 'reaction-toggle',
      state: 'pending',
      channelId: 'c1',
      messageId: 'm1',
      correlationId: 'r1',
      previousReactions: undefined,
    });
    tm.beginTransaction({
      id: 'r2',
      type: 'reaction-toggle',
      state: 'pending',
      channelId: 'c1',
      messageId: 'm1',
      correlationId: 'r2',
      previousReactions: undefined,
    });
    tm.beginTransaction({
      id: 'r3',
      type: 'reaction-toggle',
      state: 'pending',
      channelId: 'c2',
      messageId: 'm1',
      correlationId: 'r3',
      previousReactions: undefined,
    });
    tm.commitPendingReactionTogglesForMessage('c1', 'm1');
    expect(committed).toHaveLength(2);
    expect(tm.getPending('r3')).toBeDefined();
  });

  it('commitPendingMessageEditForMessage commits matching edit txs', () => {
    const tm = createUiTransactionManager();
    const committed: string[] = [];
    tm.register('message-edit', {
      rollback() {},
      commit(tx) {
        if (tx.type === 'message-edit') committed.push(tx.messageId);
      },
    });
    const prev = { authorId: 'u1', timestamp: 't', content: 'old' };
    tm.beginTransaction({
      id: 'e1',
      type: 'message-edit',
      state: 'pending',
      channelId: 'c1',
      messageId: 'm1',
      correlationId: 'e1',
      previousMessage: prev,
    });
    tm.beginTransaction({
      id: 'e2',
      type: 'message-edit',
      state: 'pending',
      channelId: 'c2',
      messageId: 'm1',
      correlationId: 'e2',
      previousMessage: prev,
    });
    tm.commitPendingMessageEditForMessage('c1', 'm1');
    expect(committed).toEqual(['m1']);
    expect(tm.getPending('e2')).toBeDefined();
  });

  it('commitPendingMessageDeleteForMessage commits matching delete txs', () => {
    const tm = createUiTransactionManager();
    let committed = 0;
    tm.register('message-delete', {
      rollback() {},
      commit() {
        committed += 1;
      },
    });
    const del = { authorId: 'u1', timestamp: 't', content: 'x' };
    tm.beginTransaction({
      id: 'd1',
      type: 'message-delete',
      state: 'pending',
      channelId: 'c1',
      messageId: 'm9',
      correlationId: 'd1',
      deletedMessage: del,
      deletedIndex: 0,
    });
    tm.commitPendingMessageDeleteForMessage('c1', 'm9');
    expect(committed).toBe(1);
    expect(tm.getPending('d1')).toBeUndefined();
  });

  it('commitPendingPinMutationsForChannel commits all pin txs for channel', () => {
    const tm = createUiTransactionManager();
    let n = 0;
    tm.register('message-pin', {
      rollback() {},
      commit() {
        n += 1;
      },
    });
    tm.beginTransaction({
      id: 'p1',
      type: 'message-pin',
      state: 'pending',
      channelId: 'c1',
      messageId: 'a',
      correlationId: 'p1',
      kind: 'pin',
      previousPinnedIds: [],
    });
    tm.beginTransaction({
      id: 'p2',
      type: 'message-pin',
      state: 'pending',
      channelId: 'c1',
      messageId: 'b',
      correlationId: 'p2',
      kind: 'unpin',
      previousPinnedIds: ['b'],
    });
    tm.beginTransaction({
      id: 'p3',
      type: 'message-pin',
      state: 'pending',
      channelId: 'c2',
      messageId: 'x',
      correlationId: 'p3',
      kind: 'pin',
      previousPinnedIds: [],
    });
    tm.commitPendingPinMutationsForChannel('c1');
    expect(n).toBe(2);
    expect(tm.getPending('p3')).toBeDefined();
  });
});
