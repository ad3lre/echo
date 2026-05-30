import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EchoApiError } from '@/api/echo/transport';
import { postEchoRemoveFriend } from '@/api/echo/social';
import {
  removeEchoFriend,
  shouldUseEchoProfileSocialApi,
} from '@/services/orchestration/profileSocial';

vi.mock('@/api/echo/social', () => ({
  postEchoRemoveFriend: vi.fn(),
}));

describe('removeEchoFriend', () => {
  beforeEach(() => {
    vi.mocked(postEchoRemoveFriend).mockReset();
  });

  it('succeeds when remove API returns 204', async () => {
    vi.mocked(postEchoRemoveFriend).mockResolvedValueOnce(undefined);
    await expect(
      removeEchoFriend({ token: 't', peerId: 'peer-1' }),
    ).resolves.toEqual({ benign: false });
  });

  it('treats translated NOT_FOUND as benign (already not friends)', async () => {
    vi.mocked(postEchoRemoveFriend).mockRejectedValueOnce(
      new EchoApiError(404, {
        code: 'NOT_FOUND',
        message: 'No accepted friendship with that user',
      }),
    );
    await expect(
      removeEchoFriend({ token: 't', peerId: 'peer-1' }),
    ).resolves.toEqual({ benign: true });
  });

  it('surfaces real failures to the caller', async () => {
    vi.mocked(postEchoRemoveFriend).mockRejectedValueOnce(
      new EchoApiError(503, {
        code: 'SERVER_BUSY',
        message: 'Could not remove friend right now',
      }),
    );
    await expect(
      removeEchoFriend({ token: 't', peerId: 'peer-1' }),
    ).rejects.toThrow('Could not remove friend right now');
  });
});

describe('shouldUseEchoProfileSocialApi', () => {
  it('allows cookie-authenticated sessions without a bearer token', () => {
    expect(
      shouldUseEchoProfileSocialApi({
        isMockDataMode: false,
        isAuthenticated: true,
        isGuest: false,
        token: '',
      }),
    ).toBe(true);
  });
});
