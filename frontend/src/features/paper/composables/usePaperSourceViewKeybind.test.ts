// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

const { mockFindAction } = vi.hoisted(() => ({ mockFindAction: vi.fn() }));
vi.mock('@/features/settings/keybindPreferences', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@/features/settings/keybindPreferences')
    >();
  return {
    ...actual,
    findActionForKeyboardEvent: mockFindAction,
  };
});

import { createPaperSourceViewKeydownHandler } from '@/features/paper/composables/usePaperSourceViewKeybind';

describe('createPaperSourceViewKeydownHandler', () => {
  it('calls onToggle when paper.toggleSourceView matches', () => {
    const onToggle = vi.fn();
    mockFindAction.mockReturnValue('paper.toggleSourceView');
    const handler = createPaperSourceViewKeydownHandler({
      enabled: () => true,
      onToggle,
    });

    const e = new KeyboardEvent('keydown', { cancelable: true });
    handler(e);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('does nothing when disabled', () => {
    const onToggle = vi.fn();
    mockFindAction.mockReturnValue('paper.toggleSourceView');
    const handler = createPaperSourceViewKeydownHandler({
      enabled: () => false,
      onToggle,
    });

    handler(new KeyboardEvent('keydown', { cancelable: true }));

    expect(onToggle).not.toHaveBeenCalled();
  });
});
