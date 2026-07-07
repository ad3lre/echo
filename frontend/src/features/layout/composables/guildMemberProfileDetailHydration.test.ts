import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  createGuildMemberProfileDetailHydrator,
  resetGuildMemberProfileDetailHydrationForTests,
} from '@/features/layout/composables/guildMemberProfileDetailHydration';

vi.mock('@/api/echo/social', () => ({
  fetchEchoUserProfileDetail: vi.fn(),
}));

import { fetchEchoUserProfileDetail } from '@/api/echo/social';
import type { EchoUserPublicProfileFromApi } from '@/api/echo/social';
import type { WorkspaceRosterUserRow } from '@/services/domain/workspaceRoster';

describe('createGuildMemberProfileDetailHydrator', () => {
  beforeEach(() => {
    resetGuildMemberProfileDetailHydrationForTests();
    vi.mocked(fetchEchoUserProfileDetail).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and merges profile detail when roster row lacks bio/banner', async () => {
    const users = ref<WorkspaceRosterUserRow[]>([
      { id: 'u1', name: 'Alice', pfp: 'a.webp', status: 'online' },
    ]);
    vi.mocked(fetchEchoUserProfileDetail).mockResolvedValue({
      id: 'u1',
      name: 'Alice',
      pfp: 'a.webp',
      bio: 'Hello world',
      bannerColor: '#abc',
    });

    const ensure = createGuildMemberProfileDetailHydrator({
      getToken: () => 'token',
      users,
      canFetch: () => true,
    });

    const ok = await ensure('u1');
    expect(ok).toBe(true);
    expect(fetchEchoUserProfileDetail).toHaveBeenCalledWith('token', 'u1');
    expect(users.value[0]?.bio).toBe('Hello world');
    expect(users.value[0]?.bannerColor).toBe('#abc');
  });

  it('skips fetch when profile detail is already present', async () => {
    const users = ref<WorkspaceRosterUserRow[]>([
      {
        id: 'u1',
        name: 'Alice',
        pfp: 'a.webp',
        status: 'online',
        bio: 'Cached',
      },
    ]);
    const ensure = createGuildMemberProfileDetailHydrator({
      getToken: () => 'token',
      users,
      canFetch: () => true,
    });

    await ensure('u1');
    expect(fetchEchoUserProfileDetail).not.toHaveBeenCalled();
  });

  it('dedupes concurrent hydration for the same user', async () => {
    const users = ref<WorkspaceRosterUserRow[]>([
      { id: 'u1', name: 'Alice', pfp: 'a.webp', status: 'online' },
    ]);
    let resolveFetch!: (value: EchoUserPublicProfileFromApi) => void;
    vi.mocked(fetchEchoUserProfileDetail).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }) as ReturnType<typeof fetchEchoUserProfileDetail>,
    );

    const ensure = createGuildMemberProfileDetailHydrator({
      getToken: () => 'token',
      users,
      canFetch: () => true,
    });

    const p1 = ensure('u1');
    const p2 = ensure('u1');
    resolveFetch({
      id: 'u1',
      name: 'Alice',
      pfp: 'a.webp',
      bio: 'Merged once',
    });
    await Promise.all([p1, p2]);
    expect(fetchEchoUserProfileDetail).toHaveBeenCalledTimes(1);
    expect(users.value[0]?.bio).toBe('Merged once');
  });
});
