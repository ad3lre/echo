import { describe, expect, it, vi } from 'vitest';
import { createPromptSignInHandler } from './createPromptSignInHandler';

describe('createPromptSignInHandler', () => {
  it('invokes openAuthModal', () => {
    const openAuthModal = vi.fn();
    const onPrompt = createPromptSignInHandler(openAuthModal);
    onPrompt();
    expect(openAuthModal).toHaveBeenCalledTimes(1);
  });
});
