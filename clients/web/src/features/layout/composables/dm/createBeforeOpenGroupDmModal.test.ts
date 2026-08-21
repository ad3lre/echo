import { describe, expect, it, vi } from 'vitest';
import { createBeforeOpenGroupDmModal } from './createBeforeOpenGroupDmModal';

describe('createBeforeOpenGroupDmModal', () => {
  it('closes pins and clears search', () => {
    const closePinsDropdown = vi.fn();
    const clearSearch = vi.fn();
    const before = createBeforeOpenGroupDmModal({
      closePinsDropdown,
      clearSearch,
    });
    before();
    expect(closePinsDropdown).toHaveBeenCalled();
    expect(clearSearch).toHaveBeenCalled();
  });
});
