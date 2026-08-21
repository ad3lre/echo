import { describe, expect, it, vi } from 'vitest';
import { createLiveKitRemoteVolumeControls } from './useAppLayoutCallVoiceLayoutBindings';

describe('createLiveKitRemoteVolumeControls', () => {
  it('defaults get to 100 when LiveKit is unbound', () => {
    const { getRemoteParticipantVolume, setRemoteParticipantVolume } =
      createLiveKitRemoteVolumeControls(() => null);
    expect(getRemoteParticipantVolume('u1')).toBe(100);
    expect(() => setRemoteParticipantVolume('u1', 40)).not.toThrow();
  });

  it('forwards get/set to the LiveKit API', () => {
    const getRemoteParticipantVolume = vi.fn(() => 35);
    const setRemoteParticipantVolume = vi.fn();
    const controls = createLiveKitRemoteVolumeControls(
      () =>
        ({
          getRemoteParticipantVolume,
          setRemoteParticipantVolume,
        }) as never,
    );
    expect(controls.getRemoteParticipantVolume('alice')).toBe(35);
    controls.setRemoteParticipantVolume('alice', 80);
    expect(setRemoteParticipantVolume).toHaveBeenCalledWith('alice', 80);
  });
});
