import { describe, expect, it, vi } from 'vitest';
import { createSelectDmUserWithShadowGuard } from './createSelectDmUserWithShadowGuard';

describe('createSelectDmUserWithShadowGuard', () => {
  it('blocks shadow users', async () => {
    const inner = vi.fn().mockResolvedValue('ch1');
    const select = createSelectDmUserWithShadowGuard({
      users: () => [{ id: 'u1', isDiscordShadow: true }],
      onSelectDmUser: inner,
    });
    expect(await select('u1')).toBeNull();
    expect(inner).not.toHaveBeenCalled();
  });

  it('delegates normal users', async () => {
    const inner = vi.fn().mockResolvedValue('ch2');
    const select = createSelectDmUserWithShadowGuard({
      users: () => [{ id: 'u2' }],
      onSelectDmUser: inner,
    });
    expect(await select('u2')).toBe('ch2');
    expect(inner).toHaveBeenCalledWith('u2');
  });
});
