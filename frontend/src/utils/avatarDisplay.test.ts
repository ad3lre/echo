import { describe, expect, it, vi } from 'vitest';
import { avatarUrlForCallDisplay } from './avatarDisplay';

vi.mock('@/assets/userAvatars', () => ({
  userAvatars: { mockuser: 'https://lo.res/avatar.png' },
  userAvatarsHiRes: { mockuser: 'https://hi.res/avatar.png' },
}));

describe('avatarUrlForCallDisplay', () => {
  it('uses hi-res map when userId matches', () => {
    expect(
      avatarUrlForCallDisplay('https://lo.res/avatar.png', 'mockuser'),
    ).toBe('https://hi.res/avatar.png');
  });

  it('falls back to pfp when user unknown', () => {
    expect(avatarUrlForCallDisplay('https://other.test/p.png', 'unknown')).toBe(
      'https://other.test/p.png',
    );
  });
});
