import { describe, expect, it } from 'vitest';
import { canPublishStageMedia } from '@/features/voice/stage/stagePublishMedia';

describe('canPublishStageMedia', () => {
  it('allows media for voice channels', () => {
    expect(
      canPublishStageMedia(
        { type: 'voice', voiceStageSpeakerByUserId: {} },
        'u1',
      ),
    ).toBe(true);
  });

  it('blocks stage audience', () => {
    expect(
      canPublishStageMedia(
        { type: 'stage', voiceStageSpeakerByUserId: { spk: true } },
        'aud',
      ),
    ).toBe(false);
  });

  it('allows stage speakers', () => {
    expect(
      canPublishStageMedia(
        { type: 'stage', voiceStageSpeakerByUserId: { spk: true } },
        'spk',
      ),
    ).toBe(true);
  });
});
