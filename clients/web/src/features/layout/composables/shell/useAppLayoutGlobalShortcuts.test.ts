// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import type { KeybindActionId } from '@/features/settings/keybindPreferences';

const { mockFindAction } = vi.hoisted(() => ({ mockFindAction: vi.fn() }));
vi.mock('@/features/settings/keybindPreferences', () => ({
  findActionForKeyboardEvent: mockFindAction,
}));

import { useAppLayoutGlobalShortcuts } from './useAppLayoutGlobalShortcuts';

type Deps = Parameters<typeof useAppLayoutGlobalShortcuts>[0];

function makeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    dmCallWithUserId: ref<string | null>(null),
    dmCallDeafened: ref(false),
    channelPanelVcMutedEffective: ref(false),
    channelPanelVcDeafenedEffective: ref(false),
    serverStore: {
      visibleServers: [{ id: 's1' }, { id: 's2' }],
    } as unknown as Deps['serverStore'],
    toggleDmCallMuted: vi.fn(),
    applyDmCallDeafened: vi.fn(),
    onGuildChannelVcMuted: vi.fn(),
    onGuildChannelVcDeafened: vi.fn(),
    markActiveChannelAsRead: vi.fn(),
    openServerSurface: vi.fn(),
    ...overrides,
  };
}

/** Dispatch a bubbling keydown from a real element so `e.target` has `.closest`/`.tagName`. */
function pressKeyFrom(tagName: string) {
  const el = document.createElement(tagName);
  document.body.appendChild(el);
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  el.remove();
}

describe('useAppLayoutGlobalShortcuts', () => {
  let scope: ReturnType<typeof effectScope>;

  beforeEach(() => {
    mockFindAction.mockReset();
  });
  afterEach(() => {
    scope?.stop();
  });

  function mount(overrides: Partial<Deps> = {}) {
    const deps = makeDeps(overrides);
    scope = effectScope(true);
    scope.run(() => useAppLayoutGlobalShortcuts(deps));
    return deps;
  }

  function setAction(action: KeybindActionId | null) {
    mockFindAction.mockReturnValue(action);
  }

  it('voice.toggleMute toggles guild mute when not in a DM call', () => {
    const deps = mount({ channelPanelVcMutedEffective: ref(false) });
    setAction('voice.toggleMute');
    pressKeyFrom('div');
    expect(deps.onGuildChannelVcMuted).toHaveBeenCalledWith(true);
    expect(deps.toggleDmCallMuted).not.toHaveBeenCalled();
  });

  it('voice.toggleMute toggles the DM call when in a DM call', () => {
    const deps = mount({ dmCallWithUserId: ref('user-9') });
    setAction('voice.toggleMute');
    pressKeyFrom('div');
    expect(deps.toggleDmCallMuted).toHaveBeenCalledTimes(1);
    expect(deps.onGuildChannelVcMuted).not.toHaveBeenCalled();
  });

  it('voice.toggleDeafen routes to guild vs DM call', () => {
    const guild = mount({ channelPanelVcDeafenedEffective: ref(true) });
    setAction('voice.toggleDeafen');
    pressKeyFrom('div');
    expect(guild.onGuildChannelVcDeafened).toHaveBeenCalledWith(false);
    scope.stop();

    const dm = mount({
      dmCallWithUserId: ref('u1'),
      dmCallDeafened: ref(false),
    });
    setAction('voice.toggleDeafen');
    pressKeyFrom('div');
    expect(dm.applyDmCallDeafened).toHaveBeenCalledWith(true);
  });

  it('navigation.markChannelRead marks the active channel read', () => {
    const deps = mount();
    setAction('navigation.markChannelRead');
    pressKeyFrom('div');
    expect(deps.markActiveChannelAsRead).toHaveBeenCalledTimes(1);
  });

  it('navigation.selectRailServerN opens the matching rail server', () => {
    const deps = mount();
    setAction('navigation.selectRailServer2');
    pressKeyFrom('div');
    expect(deps.openServerSurface).toHaveBeenCalledWith('s2');
  });

  it('navigation.openSearch dispatches the focus-search event', () => {
    mount();
    const seen = vi.fn();
    window.addEventListener('echo:focus-search', seen as EventListener);
    setAction('navigation.openSearch');
    pressKeyFrom('div');
    window.removeEventListener('echo:focus-search', seen as EventListener);
    expect(seen).toHaveBeenCalledTimes(1);
    const evt = seen.mock.calls[0][0] as CustomEvent;
    expect(evt.detail).toEqual({ selectAll: true });
  });

  it('ignores non-navigation shortcuts while typing in an editable target', () => {
    const deps = mount();
    setAction('voice.toggleMute');
    pressKeyFrom('input');
    expect(deps.onGuildChannelVcMuted).not.toHaveBeenCalled();
  });

  it('still honours navigation shortcuts from an editable target', () => {
    const deps = mount();
    setAction('navigation.markChannelRead');
    pressKeyFrom('input');
    expect(deps.markActiveChannelAsRead).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no action matches', () => {
    const deps = mount();
    setAction(null);
    pressKeyFrom('div');
    expect(deps.markActiveChannelAsRead).not.toHaveBeenCalled();
    expect(deps.onGuildChannelVcMuted).not.toHaveBeenCalled();
  });

  it('removes the keydown listener when the scope is disposed', () => {
    const deps = mount();
    scope.stop();
    setAction('navigation.markChannelRead');
    pressKeyFrom('div');
    expect(deps.markActiveChannelAsRead).not.toHaveBeenCalled();
  });
});
