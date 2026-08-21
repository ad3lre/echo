import { describe, expect, it } from 'vitest';
import {
  REQUIRED_ACTION_KEYS,
  assertAppActionRegistryComplete,
  createAppActionRegistryBuild,
} from '@/features/layout/actions/appActionRegistry';

/**
 * Wiring guard: every registry slot required at runtime is bindable as a function.
 * Complements `assertAppActionRegistryComplete` / `seal()` after controller setup.
 */
describe('controller actions wiring', () => {
  it('satisfies REQUIRED_ACTION_KEYS with plain function bindings (assert + seal)', () => {
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
    expect(() => assertAppActionRegistryComplete(draft)).not.toThrow();
    const sealed = seal();
    expect(sealed.isReady).toBe(true);
    expect(Object.isFrozen(sealed)).toBe(true);
  });

  it('REQUIRED_ACTION_KEYS stays in sync with binding checklist', () => {
    expect(REQUIRED_ACTION_KEYS).toContain('message.goToMessage');
    expect(REQUIRED_ACTION_KEYS).toContain('navigation.openDm');
    expect(REQUIRED_ACTION_KEYS).toContain(
      'navigation.openServerSettingsFromUrl',
    );
  });
});
