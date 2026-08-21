import { afterEach, describe, expect, it, vi } from 'vitest';
import { isEchoAppActivelyFocused } from '@/features/layout/composables/shell/isEchoAppActivelyFocused';

describe('isEchoAppActivelyFocused', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when the document is hidden', () => {
    vi.stubGlobal('document', {
      visibilityState: 'hidden',
      hasFocus: () => true,
    });
    expect(isEchoAppActivelyFocused()).toBe(false);
  });

  it('returns false when another app has focus', () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: () => false,
    });
    expect(isEchoAppActivelyFocused()).toBe(false);
  });

  it('returns true when Echo is visible and focused', () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      hasFocus: () => true,
    });
    expect(isEchoAppActivelyFocused()).toBe(true);
  });
});
