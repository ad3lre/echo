import { describe, it, expect } from 'vitest';
import { createAppActionRegistryBuild } from './appActionRegistry';
import { wireGroupDmIntoAppActionRegistryDraft } from './wireGroupDmIntoAppActionRegistryDraft';
import { wireMessageIntoAppActionRegistryDraft } from './wireMessageIntoAppActionRegistryDraft';
import { wireNavigationIntoAppActionRegistryDraft } from './wireNavigationIntoAppActionRegistryDraft';

describe('wireGroupDmIntoAppActionRegistryDraft', () => {
  it('fills groupDm slots so the registry can seal with the rest wired', () => {
    const { draft, seal } = createAppActionRegistryBuild();
    const noop = () => {};
    const asyncNoop = async () => {};

    wireGroupDmIntoAppActionRegistryDraft(draft, {
      openGroupDMModal: noop,
      handleCreateGroupDM: asyncNoop,
      handleSelectGroupDM: noop,
      openGroupSettingsFromHeader: noop,
      openGroupOverviewPanel: noop,
      handleUpdateGroupFromSettings: noop,
    });

    wireMessageIntoAppActionRegistryDraft(draft, { goToMessage: noop });
    wireNavigationIntoAppActionRegistryDraft(draft, {
      openServerSettingsFromUrl: noop,
      openDm: noop,
    });

    expect(() => seal()).not.toThrow();
  });
});
