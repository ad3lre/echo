import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeProfileUiInteractionSuppressed,
  deferAfterProfilePointerAction,
  suppressProfileUiInteraction,
} from './profileUiPointerGuard';

describe('profileUiPointerGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    expect(consumeProfileUiInteractionSuppressed()).toBe(false);
  });

  it('consumes suppression once within the window', () => {
    suppressProfileUiInteraction(500);
    expect(consumeProfileUiInteractionSuppressed()).toBe(true);
    expect(consumeProfileUiInteractionSuppressed()).toBe(false);
  });

  it('expires suppression after the window', () => {
    suppressProfileUiInteraction(100);
    vi.advanceTimersByTime(101);
    expect(consumeProfileUiInteractionSuppressed()).toBe(false);
  });

  it('arms suppression when deferring a profile pointer action', async () => {
    const action = vi.fn();
    deferAfterProfilePointerAction(action);
    if (typeof window === 'undefined') {
      expect(action).toHaveBeenCalledTimes(1);
    } else {
      expect(action).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(action).toHaveBeenCalledTimes(1);
    }
    expect(consumeProfileUiInteractionSuppressed()).toBe(true);
  });
});
