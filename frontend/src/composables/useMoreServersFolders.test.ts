import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useMoreServersFolders } from '@/composables/useMoreServersFolders';

describe('useMoreServersFolders', () => {
  it('assignServerToFolder closes the card menu and context menu', () => {
    const folders = ref([{ id: 'f1', name: 'Gaming', serverIds: [] }]);
    const openMenuId = ref<string | null>('s1');
    const contextMenu = ref({
      target: 'server' as const,
      serverId: 's1',
      left: 0,
      top: 0,
    });
    const closeContextMenu = vi.fn();
    const setServerFolderMembership = vi.fn();

    const { assignServerToFolder } = useMoreServersFolders({
      folders,
      addFolder: vi.fn(),
      removeFolder: vi.fn(),
      renameFolder: vi.fn(),
      moveServerInFolder: vi.fn(),
      setServerFolderMembership,
      setFolderExpandedInCompact: vi.fn(),
      toggleFolderExpandedInCompact: vi.fn(),
      toggleFolderCollapsedInCard: vi.fn(),
      isFolderExpandedInCompact: vi.fn(() => false),
      isFolderCollapsedInCard: vi.fn(() => false),
      compact: () => false,
      contextMenu,
      closeContextMenu,
      openMenuId,
    });

    assignServerToFolder('s1', 'f1');

    expect(setServerFolderMembership).toHaveBeenCalledWith('s1', 'f1');
    expect(openMenuId.value).toBeNull();
    expect(closeContextMenu).toHaveBeenCalledTimes(1);
  });
});
