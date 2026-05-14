import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postEchoOpenGroupDm } from '@/api/echo/social';
import { createOpenEchoGroupDmOnServerInvoker } from './openEchoGroupDmOnServer';

vi.mock('@/api/echo/social');

describe('createOpenEchoGroupDmOnServerInvoker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(postEchoOpenGroupDm).mockResolvedValue({
      channelId: 'ch-invoked',
    });
  });

  it('forwards hydrated session + params to the API and returns channel id', async () => {
    const hydrateEchoFromApi = vi.fn().mockResolvedValue(undefined);
    const invoker = createOpenEchoGroupDmOnServerInvoker({
      getIsAuthenticated: () => true,
      getAccessToken: () => 'tok',
      hydrateEchoFromApi,
    });
    const id = await invoker({
      name: 'Squad',
      memberIds: ['u2'],
      currentUserId: 'u1',
    });
    expect(id).toBe('ch-invoked');
    expect(postEchoOpenGroupDm).toHaveBeenCalledWith(
      'tok',
      {
        memberUserIds: expect.arrayContaining(['u1', 'u2']),
        name: 'Squad',
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(hydrateEchoFromApi).toHaveBeenCalled();
  });

  it('returns null without calling the API when unauthenticated', async () => {
    const invoker = createOpenEchoGroupDmOnServerInvoker({
      getIsAuthenticated: () => false,
      getAccessToken: () => 'tok',
      hydrateEchoFromApi: vi.fn(),
    });
    const id = await invoker({
      name: 'X',
      memberIds: [],
      currentUserId: 'u1',
    });
    expect(id).toBeNull();
    expect(postEchoOpenGroupDm).not.toHaveBeenCalled();
  });
});
