import { describe, expect, it, vi } from 'vitest';
import { createNavigateToDmForAnswer } from './useAppLayoutMessagingGroupDmChrome';

describe('createNavigateToDmForAnswer', () => {
  it('selects a group thread without calling selectDmUser', () => {
    const selectDMTab = vi.fn();
    const selectDmUser = vi.fn();
    const handleSelectGroupDMWithGuestGuard = vi.fn();
    const navigate = createNavigateToDmForAnswer({
      groupDMs: { value: { 'group-1': { id: 'group-1' } } },
      handleSelectGroupDMWithGuestGuard,
      selectDmUser,
      selectDMTab,
      isGuestUser: () => false,
    });
    navigate('group-1');
    expect(handleSelectGroupDMWithGuestGuard).toHaveBeenCalledWith('group-1');
    expect(selectDmUser).not.toHaveBeenCalled();
    expect(selectDMTab).toHaveBeenCalledTimes(1);
  });

  it('no-ops on blank ids and skips the DM tab for guests', () => {
    const selectDMTab = vi.fn();
    const selectDmUser = vi.fn(async () => 'ch-1');
    const navigate = createNavigateToDmForAnswer({
      groupDMs: { value: {} },
      handleSelectGroupDMWithGuestGuard: vi.fn(),
      selectDmUser,
      selectDMTab,
      isGuestUser: () => true,
    });
    navigate('   ');
    expect(selectDmUser).not.toHaveBeenCalled();
    navigate('user-1');
    expect(selectDmUser).toHaveBeenCalledWith('user-1');
    expect(selectDMTab).not.toHaveBeenCalled();
  });
});
