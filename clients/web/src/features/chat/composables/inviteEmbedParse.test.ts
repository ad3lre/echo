import { describe, expect, it } from 'vitest';
import {
  isEchoInviteEmbedUrl,
  splitContentByEchoInviteLinks,
} from './inviteEmbedParse';

/** Must match default `PUBLIC_INVITE_BASE` in config so `collectInviteBases()` picks it up. */
const BASE = 'https://chat-echo.com';

describe('isEchoInviteEmbedUrl', () => {
  const bases = [BASE];

  it('rejects wrong origin', () => {
    expect(isEchoInviteEmbedUrl('https://evil.test/invite/abcdef', bases)).toBe(
      false,
    );
  });

  it('accepts /invite/{hex}', () => {
    expect(isEchoInviteEmbedUrl(`${BASE}/invite/abcdef123456`, bases)).toBe(
      true,
    );
  });

  it('accepts single vanity segment', () => {
    expect(isEchoInviteEmbedUrl(`${BASE}/my-server`, bases)).toBe(true);
  });

  it('accepts Open Graph share page under /api/v1/echo/invites/…/share', () => {
    expect(
      isEchoInviteEmbedUrl(
        `${BASE}/api/v1/echo/invites/my-server/share`,
        bases,
      ),
    ).toBe(true);
  });

  it('rejects bare invite path', () => {
    expect(isEchoInviteEmbedUrl(`${BASE}/invite`, bases)).toBe(false);
  });

  it('rejects multi-segment vanity', () => {
    expect(isEchoInviteEmbedUrl(`${BASE}/a/b`, bases)).toBe(false);
  });
});

describe('splitContentByEchoInviteLinks', () => {
  it('returns empty text for empty content', () => {
    expect(splitContentByEchoInviteLinks('')).toEqual([
      { type: 'text', text: '' },
    ]);
  });

  it('splits invite URL when bases match', () => {
    const url = `${BASE}/invite/abcdef123456`;
    const parts = splitContentByEchoInviteLinks(`join ${url} now`);
    expect(parts).toEqual([
      { type: 'text', text: 'join ' },
      { type: 'invite', url },
      { type: 'text', text: ' now' },
    ]);
  });
});
