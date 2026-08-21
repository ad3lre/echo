import { describe, it, expect, vi } from 'vitest';
import { createAppActionRegistryBuild } from './appActionRegistry';
import { wireGroupDmIntoAppActionRegistryDraft } from './wireGroupDmIntoAppActionRegistryDraft';
import { wireMessageIntoAppActionRegistryDraft } from './wireMessageIntoAppActionRegistryDraft';
import { wireNavigationIntoAppActionRegistryDraft } from './wireNavigationIntoAppActionRegistryDraft';

describe('wireMessageIntoAppActionRegistryDraft', () => {
  it('assigns draft.message.goToMessage', () => {
    const { draft } = createAppActionRegistryBuild();
    const fn = vi.fn();
    wireMessageIntoAppActionRegistryDraft(draft, { goToMessage: fn });
    expect(draft.message.goToMessage).toBe(fn);
  });

  it('with group + navigation wiring, draft is seal-ready', () => {
    const { draft, seal } = createAppActionRegistryBuild();
    const noop = () => {};
    const asyncNoop = async () => {};

    wireMessageIntoAppActionRegistryDraft(draft, { goToMessage: noop });
    wireGroupDmIntoAppActionRegistryDraft(draft, {
      openGroupDMModal: noop,
      handleCreateGroupDM: asyncNoop,
      handleSelectGroupDM: noop,
      openGroupSettingsFromHeader: noop,
      openGroupOverviewPanel: noop,
      handleUpdateGroupFromSettings: noop,
    });
    wireNavigationIntoAppActionRegistryDraft(draft, {
      openServerSettingsFromUrl: noop,
      openDm: noop,
    });

    expect(() => seal()).not.toThrow();
  });
});
