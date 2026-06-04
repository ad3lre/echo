import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';

const h = vi.hoisted(() => ({
  fetchForumPosts: vi.fn(),
  createForumPost: vi.fn(),
  patchForumPost: vi.fn(),
  dispatchAppToast: vi.fn(),
}));

vi.mock('@/services/orchestration/forumPosts', () => ({
  fetchForumPosts: h.fetchForumPosts,
  createForumPost: h.createForumPost,
  patchForumPost: h.patchForumPost,
}));
vi.mock('@/utils/controllerMissingAction', () => ({
  dispatchAppToast: h.dispatchAppToast,
}));

import { useForumPostsController } from './useForumPostsController';

type Deps = Parameters<typeof useForumPostsController>[0];
type Surface =
  | { type: 'serverForum'; forumChannelId: string }
  | { type: 'dmThread' }
  | null;

function makeDeps(overrides: Partial<Deps> = {}): {
  deps: Deps;
  mainSurface: ReturnType<typeof ref<Surface>>;
} {
  const mainSurface = ref<Surface>(null);
  const deps = {
    authSession: { accessToken: 'tok' } as unknown as Deps['authSession'],
    serverStore: {
      selectedServer: { id: 'echo:srv1' },
    } as unknown as Deps['serverStore'],
    workspace: {
      categoriesByServer: ref<Record<string, unknown[]>>({}),
    } as unknown as Deps['workspace'],
    mainSurface: mainSurface as unknown as Deps['mainSurface'],
    isEchoGraphId: vi.fn(() => true),
    canManageThisChannel: vi.fn(() => true),
    findChannelContextById: vi.fn(() => ({
      channel: { id: 'f1' },
    })) as unknown as Deps['findChannelContextById'],
    handleGoToChannel: vi.fn(),
    handleGoToMessage: vi.fn(),
    ...overrides,
  } as Deps;
  return { deps, mainSurface };
}

describe('useForumPostsController', () => {
  let scope: ReturnType<typeof effectScope>;

  beforeEach(() => {
    for (const fn of Object.values(h)) fn.mockReset();
    h.fetchForumPosts.mockResolvedValue([]);
    h.createForumPost.mockResolvedValue({
      created: {},
      refreshedCategories: null,
    });
    h.patchForumPost.mockResolvedValue(undefined);
  });
  afterEach(() => scope?.stop());

  function mount(overrides: Partial<Deps> = {}) {
    const { deps, mainSurface } = makeDeps(overrides);
    scope = effectScope(true);
    const api = scope.run(() => useForumPostsController(deps))!;
    return { api, deps, mainSurface };
  }

  it('refreshForumPosts stores rows and clears loading/error', async () => {
    h.fetchForumPosts.mockResolvedValue([{ id: 'p1' }]);
    const { api } = mount();
    await api.refreshForumPosts('f1');
    expect(api.forumPostsByForumId.value.f1).toEqual([{ id: 'p1' }]);
    expect(api.forumPostsLoadingByForumId.value.f1).toBe(false);
    expect(api.forumPostsErrorByForumId.value.f1).toBe(null);
  });

  it('refreshForumPosts records an error on failure', async () => {
    h.fetchForumPosts.mockRejectedValue(new Error('boom'));
    const { api } = mount();
    await api.refreshForumPosts('f1');
    expect(api.forumPostsErrorByForumId.value.f1).toBe('boom');
    expect(api.forumPostsLoadingByForumId.value.f1).toBe(false);
  });

  it('refreshForumPosts is a no-op for a blank id', async () => {
    const { api } = mount();
    await api.refreshForumPosts('   ');
    expect(h.fetchForumPosts).not.toHaveBeenCalled();
  });

  it('createForumPost creates, refreshes, updates categories, and navigates to the message', async () => {
    h.createForumPost.mockResolvedValue({
      created: { channelId: 'c1', messageId: 'm1' },
      refreshedCategories: [{ id: 'cat1' }],
    });
    const { api, deps } = mount();
    await api.createForumPost({ forumChannelId: 'f1', content: 'hi' });
    expect(h.createForumPost).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'tok',
        forumChannelId: 'f1',
        refreshCategoriesForServerId: 'echo:srv1',
        body: expect.objectContaining({ content: 'hi' }),
      }),
    );
    expect(
      (deps.workspace.categoriesByServer.value as Record<string, unknown>)[
        'echo:srv1'
      ],
    ).toEqual([{ id: 'cat1' }]);
    expect(h.fetchForumPosts).toHaveBeenCalled();
    expect(deps.handleGoToMessage).toHaveBeenCalledWith('c1', 'm1');
  });

  it('createForumPost without a messageId navigates to the channel', async () => {
    h.createForumPost.mockResolvedValue({ created: { channelId: 'c1' } });
    const { api, deps } = mount();
    await api.createForumPost({ forumChannelId: 'f1', content: 'hi' });
    expect(deps.handleGoToChannel).toHaveBeenCalledWith('c1');
    expect(deps.handleGoToMessage).not.toHaveBeenCalled();
  });

  it('createForumPost surfaces a toast on failure', async () => {
    h.createForumPost.mockRejectedValue(new Error('nope'));
    const { api } = mount();
    await api.createForumPost({ forumChannelId: 'f1', content: 'hi' });
    expect(h.dispatchAppToast).toHaveBeenCalledWith('nope', 'warning');
  });

  it('patchForumPost forwards the patch fields', async () => {
    const { api } = mount();
    await api.patchForumPost({ postChannelId: 'p1', pinned: true });
    expect(h.patchForumPost).toHaveBeenCalledWith(
      expect.objectContaining({
        postChannelId: 'p1',
        patch: { pinned: true },
      }),
    );
  });

  it('auto-refreshes immediately when already on a forum surface', () => {
    mount({
      mainSurface: ref({
        type: 'serverForum',
        forumChannelId: 'f9',
      }) as unknown as Deps['mainSurface'],
    });
    expect(h.fetchForumPosts).toHaveBeenCalledWith(
      expect.objectContaining({ forumChannelId: 'f9' }),
    );
  });

  it('auto-refreshes when the surface switches to a forum', async () => {
    const { mainSurface } = mount();
    expect(h.fetchForumPosts).not.toHaveBeenCalled();
    mainSurface.value = { type: 'serverForum', forumChannelId: 'f2' };
    await nextTick();
    expect(h.fetchForumPosts).toHaveBeenCalledWith(
      expect.objectContaining({ forumChannelId: 'f2' }),
    );
  });

  it('canManageForumPosts reflects the active forum channel capability', () => {
    const { api, deps, mainSurface } = mount();
    expect(api.canManageForumPosts.value).toBe(false); // null surface
    mainSurface.value = { type: 'serverForum', forumChannelId: 'f1' };
    expect(api.canManageForumPosts.value).toBe(true);
    (deps.canManageThisChannel as ReturnType<typeof vi.fn>).mockReturnValue(
      false,
    );
    // recompute by toggling the surface reference
    mainSurface.value = { type: 'serverForum', forumChannelId: 'f1b' };
    expect(api.canManageForumPosts.value).toBe(false);
  });
});
