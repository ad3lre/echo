import { describe, expect, it } from 'vitest';
import { createWorkspaceHydrateSkipLatch } from '../workspaceHydrateSkipLatch';

describe('createWorkspaceHydrateSkipLatch', () => {
  it('consume is false until armed', () => {
    const latch = createWorkspaceHydrateSkipLatch();
    expect(latch.consume()).toBe(false);
    expect(latch.consume()).toBe(false);
  });

  it('consume returns true once then false', () => {
    const latch = createWorkspaceHydrateSkipLatch();
    latch.armSkipNext();
    expect(latch.consume()).toBe(true);
    expect(latch.consume()).toBe(false);
  });

  it('cancel clears armed state', () => {
    const latch = createWorkspaceHydrateSkipLatch();
    latch.armSkipNext();
    latch.cancelSkip();
    expect(latch.consume()).toBe(false);
  });

  it('re-arms after consume', () => {
    const latch = createWorkspaceHydrateSkipLatch();
    latch.armSkipNext();
    expect(latch.consume()).toBe(true);
    latch.armSkipNext();
    expect(latch.consume()).toBe(true);
  });
});
