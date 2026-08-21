import { describe, expect, it } from 'vitest';
import { createPreserveActiveChannelOnHydrateRace } from './useAppLayoutVoiceShellChannelGuards';

describe('createPreserveActiveChannelOnHydrateRace', () => {
  it('preserves DM context and known DM channel ids', () => {
    const preserve = createPreserveActiveChannelOnHydrateRace({
      isDmUiContext: { value: true },
      isInDMMode: { value: false },
      isKnownDmChannelId: () => false,
    });
    expect(preserve('ch-1')).toBe(true);

    const known = createPreserveActiveChannelOnHydrateRace({
      isDmUiContext: { value: false },
      isInDMMode: { value: false },
      isKnownDmChannelId: (id) => id === 'dm-9',
    });
    expect(known('dm-9')).toBe(true);
    expect(known('guild-1')).toBe(false);
  });
});
