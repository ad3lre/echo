import { describe, expect, it, vi } from 'vitest';
import type { AppActionRegistrySealed } from '@/features/layout/actions/appActionRegistry.types';
import { createAppLayoutActionsFromRegistry } from './createAppLayoutActionsFromRegistry';

function sealedStub(): AppActionRegistrySealed {
  return {
    isReady: true,
    message: {
      goToMessage: vi.fn(),
    },
    navigation: {
      openDm: vi.fn(),
      openServerSettingsFromUrl: vi.fn(),
    },
    groupDm: {
      openGroupDMModal: vi.fn(),
      handleCreateGroupDM: vi.fn(),
      handleSelectGroupDM: vi.fn(),
      openGroupSettingsFromHeader: vi.fn(),
      openGroupOverviewPanel: vi.fn(),
      handleUpdateGroupFromSettings: vi.fn(),
    },
  };
}

describe('createAppLayoutActionsFromRegistry', () => {
  it('delegates goToMessage and openDm', () => {
    const registry = sealedStub();
    const actions = createAppLayoutActionsFromRegistry(registry);
    actions.message.goToMessage('c', 'm');
    expect(registry.message.goToMessage).toHaveBeenCalledWith('c', 'm');
    void actions.navigation.openDm('u1');
    expect(registry.navigation.openDm).toHaveBeenCalledWith('u1');
  });
});
