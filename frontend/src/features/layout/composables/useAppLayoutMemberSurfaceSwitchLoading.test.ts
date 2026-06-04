import { describe, expect, it } from 'vitest';
import { computed, ref } from 'vue';
import { useAppLayoutMemberSurfaceSwitchLoading } from './useAppLayoutMemberSurfaceSwitchLoading';

describe('useAppLayoutMemberSurfaceSwitchLoading', () => {
  it('is true when pending and member list empty', () => {
    const loading = useAppLayoutMemberSurfaceSwitchLoading({
      isServerRailFastSwitchPending: ref(true),
      isGuildShellSettling: ref(false),
      memberListUsers: ref([]),
    });
    expect(loading.value).toBe(true);
  });

  it('is true when guild shell settling and member list empty', () => {
    const loading = useAppLayoutMemberSurfaceSwitchLoading({
      isServerRailFastSwitchPending: ref(false),
      isGuildShellSettling: ref(true),
      memberListUsers: ref([]),
    });
    expect(loading.value).toBe(true);
  });

  it('is false when list has users', () => {
    const loading = useAppLayoutMemberSurfaceSwitchLoading({
      isServerRailFastSwitchPending: ref(true),
      isGuildShellSettling: ref(true),
      memberListUsers: ref([{ id: '1' }]),
    });
    expect(loading.value).toBe(false);
  });

  it('accepts computed member list', () => {
    const loading = useAppLayoutMemberSurfaceSwitchLoading({
      isServerRailFastSwitchPending: ref(true),
      isGuildShellSettling: ref(false),
      memberListUsers: computed(() => []),
    });
    expect(loading.value).toBe(true);
  });
});
