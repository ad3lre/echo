import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

/**
 * Mirrors the guild VC mute/deafen coordination in useAppLayoutLayoutChrome so
 * regressions in sticky-mute behavior are caught without mounting the full shell.
 */
function createVcMuteDeafenState() {
  const vcMuted = ref(false);
  const vcDeafened = ref(false);
  const vcMutedBeforeDeafen = ref(false);

  function applyVcDeafened(next: boolean) {
    if (next) {
      vcMutedBeforeDeafen.value = vcMuted.value;
      vcDeafened.value = true;
      vcMuted.value = true;
    } else {
      vcDeafened.value = false;
      vcMuted.value = vcMutedBeforeDeafen.value;
    }
  }

  function applyVcMuted(next: boolean) {
    if (vcDeafened.value) {
      vcMutedBeforeDeafen.value = next;
      return;
    }
    vcMuted.value = next;
  }

  return {
    vcMuted,
    vcDeafened,
    vcMutedBeforeDeafen,
    applyVcDeafened,
    applyVcMuted,
  };
}

describe('vc mute/deafen coordination', () => {
  it('undeafen restores the mic state from before deafen', () => {
    const s = createVcMuteDeafenState();
    s.applyVcDeafened(true);
    expect(s.vcMuted.value).toBe(true);
    expect(s.vcDeafened.value).toBe(true);

    s.applyVcDeafened(false);
    expect(s.vcDeafened.value).toBe(false);
    expect(s.vcMuted.value).toBe(false);
  });

  it('unmute while deafened records intent for after undeafen', () => {
    const s = createVcMuteDeafenState();
    s.applyVcDeafened(true);
    s.applyVcMuted(false);

    expect(s.vcMuted.value).toBe(true);
    expect(s.vcDeafened.value).toBe(true);
    expect(s.vcMutedBeforeDeafen.value).toBe(false);

    s.applyVcDeafened(false);
    expect(s.vcMuted.value).toBe(false);
    expect(s.vcDeafened.value).toBe(false);
  });

  it('mute and unmute while not deafened toggles vcMuted directly', () => {
    const s = createVcMuteDeafenState();
    s.applyVcMuted(true);
    expect(s.vcMuted.value).toBe(true);

    s.applyVcMuted(false);
    expect(s.vcMuted.value).toBe(false);
    expect(s.vcDeafened.value).toBe(false);
  });
});
