import { describe, expect, it } from 'vitest';
import { createMessageRowHydrationQueue } from './messageRowHydrationQueue';

describe('messageRowHydrationQueue', () => {
  it('dequeues in bounded batches and marks hydrated', () => {
    const queue = createMessageRowHydrationQueue({ maxBatchSize: 2 });
    queue.enqueue('ch1', ['a', 'b', 'c']);
    expect(queue.dequeueBatch('ch1')).toEqual(['a', 'b']);
    expect(queue.isHydrated('ch1', 'a')).toBe(true);
    expect(queue.isHydrated('ch1', 'c')).toBe(false);
    expect(queue.dequeueBatch('ch1')).toEqual(['c']);
    expect(queue.isHydrated('ch1', 'c')).toBe(true);
  });

  it('clears channel state', () => {
    const queue = createMessageRowHydrationQueue();
    queue.enqueue('ch1', ['a']);
    queue.dequeueBatch('ch1');
    expect(queue.isHydrated('ch1', 'a')).toBe(true);
    queue.clearChannel('ch1');
    expect(queue.isHydrated('ch1', 'a')).toBe(false);
  });
});
