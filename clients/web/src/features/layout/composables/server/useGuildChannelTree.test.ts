import { computed, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useGuildChannelTree } from './useGuildChannelTree';

function buildHarness(categories: any[]) {
  const selectedServerId = ref('srv-1');
  const categoriesByServer = ref<Record<string, any[]>>({
    'srv-1': categories,
  });
  const tree = useGuildChannelTree({
    serverStore: { selectedServerId } as any,
    workspace: { categoriesByServer } as any,
    selectedServer: computed(() => ({ id: 'srv-1' }) as any),
    rolePreview: computed(() => null),
    isRolePreviewActiveForServer: computed(() => false),
    previewHasUiPermission: () => true,
  });
  return { tree, categoriesByServer };
}

describe('useGuildChannelTree watchActiveChannelWithServerChange', () => {
  it('hides categories with no visible channels', () => {
    const { tree } = buildHarness([
      {
        id: 'cat-hidden',
        name: 'Hidden',
        channels: [
          { id: 'voice-hidden', type: 'voice', canViewChannel: false },
        ],
      },
      {
        id: 'cat-visible',
        name: 'Visible',
        channels: [{ id: 'text-1', type: 'text' }],
      },
    ]);

    expect(tree.categoriesForServer.value.map((c) => c.id)).toEqual([
      'cat-visible',
    ]);
  });

  it('keeps empty categories (new sections with no channels yet)', () => {
    const { tree } = buildHarness([
      {
        id: 'cat-empty',
        name: 'New section',
        channels: [],
      },
      {
        id: 'cat-visible',
        name: 'Visible',
        channels: [{ id: 'text-1', type: 'text' }],
      },
    ]);

    expect(tree.categoriesForServer.value.map((c) => c.id)).toEqual([
      'cat-empty',
      'cat-visible',
    ]);
  });

  it('moves to first text/forum channel when active id is missing', async () => {
    const { tree } = buildHarness([
      {
        id: 'cat-1',
        name: 'General',
        channels: [{ id: 'ch-1', type: 'text' }],
      },
    ]);
    const activeChannelId = ref('deleted-channel');
    tree.watchActiveChannelWithServerChange(activeChannelId);
    await nextTick();
    expect(activeChannelId.value).toBe('ch-1');
  });

  it('clears stale active id when server has zero channels', async () => {
    const { tree, categoriesByServer } = buildHarness([
      {
        id: 'cat-1',
        name: 'General',
        channels: [{ id: 'ch-1', type: 'text' }],
      },
    ]);
    const activeChannelId = ref('ch-1');
    tree.watchActiveChannelWithServerChange(activeChannelId);
    await nextTick();
    categoriesByServer.value = { 'srv-1': [] };
    await nextTick();
    expect(activeChannelId.value).toBe('');
  });

  it('resolves channels when selectedServer is empty but selectedServerId is set', () => {
    const selectedServerId = ref<string | null>('srv-1');
    const categoriesByServer = ref<Record<string, any[]>>({
      'srv-1': [
        {
          id: 'cat-1',
          name: 'General',
          channels: [{ id: 'ch-1', type: 'text', name: 'general' }],
        },
      ],
    });
    const tree = useGuildChannelTree({
      serverStore: {
        get selectedServerId() {
          return selectedServerId.value;
        },
      } as any,
      workspace: { categoriesByServer } as any,
      selectedServer: computed(() => undefined),
      rolePreview: computed(() => null),
      isRolePreviewActiveForServer: computed(() => false),
      previewHasUiPermission: () => true,
    });

    expect(tree.findChannelContextById('ch-1')?.channel.name).toBe('general');
  });

  it('does not rewrite when active channel exists in raw tree but is filtered from sidebar', async () => {
    const { tree } = buildHarness([
      {
        id: 'cat-1',
        name: 'Hidden',
        channels: [
          { id: 'ch-hidden', type: 'text', canViewChannel: false },
          { id: 'ch-visible', type: 'text' },
        ],
      },
    ]);
    const activeChannelId = ref('ch-hidden');
    tree.watchActiveChannelWithServerChange(activeChannelId);
    await nextTick();
    expect(activeChannelId.value).toBe('ch-hidden');
  });
});
