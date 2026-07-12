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

  it('can clear pending work without forgetting hydrated warm rows', () => {
    const queue = createMessageRowHydrationQueue({ maxBatchSize: 1 });
    queue.enqueue('ch1', ['a', 'b']);
    expect(queue.dequeueBatch('ch1')).toEqual(['a']);

    queue.clearQueuedChannel('ch1');

    expect(queue.isHydrated('ch1', 'a')).toBe(true);
    expect(queue.dequeueBatch('ch1')).toEqual([]);
    expect(queue.isHydrated('ch1', 'b')).toBe(false);
  });

  it('prunes oldest hydrated rows when the remembered set reaches its cap', () => {
    const queue = createMessageRowHydrationQueue({ maxHydratedSize: 2 });

    queue.markHydrated('ch1', 'a');
    queue.markHydrated('ch1', 'b');
    queue.markHydrated('ch1', 'c');

    expect(queue.isHydrated('ch1', 'a')).toBe(false);
    expect(queue.isHydrated('ch1', 'b')).toBe(true);
    expect(queue.isHydrated('ch1', 'c')).toBe(true);
  });
});
