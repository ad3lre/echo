import { describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';
import {
  assertAppActionRegistryComplete,
  createAppActionRegistryBuild,
  createStableGoToMessageDelegate,
} from './appActionRegistry';
import type { AppActionRegistryRuntime } from './appActionRegistry.types';

describe('appActionRegistry', () => {
  it('goToMessage delegate throws before seal (not ready)', () => {
    const { draft } = createAppActionRegistryBuild();
    const ref = shallowRef<AppActionRegistryRuntime>(draft);
    const delegate = createStableGoToMessageDelegate(() => ref.value);
    expect(() => delegate('c', 'm')).toThrow(/not ready/i);
  });

  it('goToMessage delegate calls implementation after seal swaps ref', () => {
    const { draft, seal } = createAppActionRegistryBuild();
    const ref = shallowRef<AppActionRegistryRuntime>(draft);
    const delegate = createStableGoToMessageDelegate(() => ref.value);
    const noop = () => {};
    const asyncNoop = async () => {};
    const goToMessageMock = vi.fn();
    draft.message.goToMessage = goToMessageMock;
    draft.navigation.openDm = noop;
    draft.navigation.openServerSettingsFromUrl = noop;
    draft.groupDm.openGroupDMModal = noop;
    draft.groupDm.handleCreateGroupDM = asyncNoop;
    draft.groupDm.handleSelectGroupDM = noop;
    draft.groupDm.openGroupSettingsFromHeader = noop;
    draft.groupDm.openGroupOverviewPanel = noop;
    draft.groupDm.handleUpdateGroupFromSettings = noop;
    ref.value = seal();
    delegate('channel-1', 'msg-1');
    expect(goToMessageMock).toHaveBeenCalledWith('channel-1', 'msg-1');
  });

  it('seal throws when a required slot is missing', () => {
    const { draft, seal } = createAppActionRegistryBuild();
    draft.message.goToMessage = () => {};
    expect(() => seal()).toThrow(/missing required action/);
  });

  it('seal throws when called twice', () => {
    const { draft, seal } = createAppActionRegistryBuild();
    const noop = () => {};
    const asyncNoop = async () => {};
    draft.message.goToMessage = noop;
    draft.navigation.openDm = noop;
    draft.navigation.openServerSettingsFromUrl = noop;
    draft.groupDm.openGroupDMModal = noop;
    draft.groupDm.handleCreateGroupDM = asyncNoop;
    draft.groupDm.handleSelectGroupDM = noop;
    draft.groupDm.openGroupSettingsFromHeader = noop;
    draft.groupDm.openGroupOverviewPanel = noop;
    draft.groupDm.handleUpdateGroupFromSettings = noop;
    seal();
    expect(() => seal()).toThrow(/more than once/);
  });

  it('assertAppActionRegistryComplete passes for fully wired draft', () => {
    const { draft } = createAppActionRegistryBuild();
    const noop = () => {};
    const asyncNoop = async () => {};
    draft.message.goToMessage = noop;
    draft.navigation.openDm = noop;
    draft.navigation.openServerSettingsFromUrl = noop;
    draft.groupDm.openGroupDMModal = noop;
    draft.groupDm.handleCreateGroupDM = asyncNoop;
    draft.groupDm.handleSelectGroupDM = noop;
    draft.groupDm.openGroupSettingsFromHeader = noop;
    draft.groupDm.openGroupOverviewPanel = noop;
    draft.groupDm.handleUpdateGroupFromSettings = noop;
    expect(() => assertAppActionRegistryComplete(draft)).not.toThrow();
  });
});
