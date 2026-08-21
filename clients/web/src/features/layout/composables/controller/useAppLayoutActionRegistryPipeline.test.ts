import { describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { useAppLayoutActionRegistryPipeline } from './useAppLayoutActionRegistryPipeline';

describe('useAppLayoutActionRegistryPipeline', () => {
  it('wires go-to-message then seals with groupDm and navigation', () => {
    const scope = effectScope(true);
    const goToMessage = vi.fn();
    const openServerSettingsFromUrl = vi.fn();
    const openDm = vi.fn();

    const sealed = scope.run(() => {
      const p = useAppLayoutActionRegistryPipeline();
      p.wireMessageGoToMessage(goToMessage);
      return p.sealWithGroupDmAndNavigation({
        groupDm: {
          openGroupDMModal: vi.fn(),
          handleCreateGroupDM: vi.fn(async () => {}),
          handleSelectGroupDM: vi.fn(),
          openGroupSettingsFromHeader: vi.fn(),
          openGroupOverviewPanel: vi.fn(),
          handleUpdateGroupFromSettings: vi.fn(),
        },
        navigation: { openServerSettingsFromUrl, openDm },
      });
    });
    if (!sealed) throw new Error('expected sealed registry');
    const { appLayoutActions } = sealed;

    appLayoutActions.message.goToMessage('c1', 'm1');
    expect(goToMessage).toHaveBeenCalledWith('c1', 'm1');
    void appLayoutActions.navigation.openDm('u1');
    expect(openDm).toHaveBeenCalledWith('u1');

    scope.stop();
  });
});
