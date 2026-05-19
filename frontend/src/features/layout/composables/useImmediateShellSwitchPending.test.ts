import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type Ref } from 'vue';
import { useImmediateShellSwitchPending } from './useImmediateShellSwitchPending';

describe('useImmediateShellSwitchPending', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('bumps pending on rail tab change then clears after debounce', async () => {
    const activeRailTab = ref<'servers' | 'explore' | 'dm'>('servers');
    let immediateShellSwitchPending: Ref<boolean>;
    const scope = effectScope(true);
    scope.run(() => {
      ({ immediateShellSwitchPending } = useImmediateShellSwitchPending({
        activeRailTab,
        selectedServerId: ref('s1'),
      }));
    });
    activeRailTab.value = 'dm';
    await nextTick();
    expect(immediateShellSwitchPending!.value).toBe(true);
    vi.advanceTimersByTime(120);
    expect(immediateShellSwitchPending!.value).toBe(false);
    scope.stop();
  });

  it('bumps when staying on servers rail but selected server id changes', async () => {
    const activeRailTab = ref<'servers' | 'explore' | 'dm'>('servers');
    const serverId = ref('a');
    let immediateShellSwitchPending: Ref<boolean>;
    const scope = effectScope(true);
    scope.run(() => {
      ({ immediateShellSwitchPending } = useImmediateShellSwitchPending({
        activeRailTab,
        selectedServerId: serverId,
      }));
    });
    serverId.value = 'b';
    await nextTick();
    expect(immediateShellSwitchPending!.value).toBe(true);
    vi.advanceTimersByTime(120);
    expect(immediateShellSwitchPending!.value).toBe(false);
    scope.stop();
  });
});
