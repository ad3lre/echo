import { describe, expect, it } from 'vitest';
import {
  createMessageListRowInvalidationController,
  shouldDeferInvalidationReason,
} from './messageListRowInvalidation';

describe('createMessageListRowInvalidationController', () => {
  it('propagates dirty to neighbors', () => {
    const ctrl = createMessageListRowInvalidationController();
    const batch = ctrl.invalidate('reaction', ['a', 'b', 'c'], ['b'], false);
    expect(batch.has('a')).toBe(true);
    expect(batch.has('b')).toBe(true);
    expect(batch.has('c')).toBe(true);
  });

  it('defers offscreen reaction updates during scroll', () => {
    const ctrl = createMessageListRowInvalidationController();
    ctrl.invalidate('reaction', ['m1'], ['m1'], true);
    expect(ctrl.drain(true)).toEqual([]);
    ctrl.flushDeferredToImmediate();
    expect(ctrl.drain(false)).toContain('m1');
  });

  it('does not defer own reaction during scroll', () => {
    const ctrl = createMessageListRowInvalidationController();
    ctrl.invalidate('own_reaction', ['m1'], ['m1'], true);
    expect(ctrl.drain(true)).toContain('m1');
  });
});

describe('shouldDeferInvalidationReason', () => {
  it('defers presence during scroll', () => {
    expect(shouldDeferInvalidationReason('presence', true)).toBe(true);
  });

  it('does not defer delete during scroll', () => {
    expect(shouldDeferInvalidationReason('message_delete', true)).toBe(false);
  });
});
