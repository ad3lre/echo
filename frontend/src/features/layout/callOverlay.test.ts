import { describe, expect, it } from 'vitest';
import { deriveCallOverlay } from './callOverlay';
import type { MainSurface } from './mainSurface';

const baseDm = {
  dmCallWithUserId: null as string | null,
  dmPartnerUserId: null as string | null,
  isGroupDm: false,
  activeGroupDmId: null as string | null,
  dmCallFullscreen: false,
};

describe('deriveCallOverlay', () => {
  it('maps serverVoice main surface to serverVoice overlay when no DM call', () => {
    const mainSurface: MainSurface = { type: 'serverVoice', channelId: 'vc-1' };
    expect(
      deriveCallOverlay({
        mainSurface,
        ...baseDm,
      }),
    ).toEqual({ type: 'serverVoice', channelId: 'vc-1' });
  });

  it('prefers dmCall overlay when call is active even on serverVoice surface', () => {
    const mainSurface: MainSurface = { type: 'serverVoice', channelId: 'vc-1' };
    expect(
      deriveCallOverlay({
        mainSurface,
        dmCallWithUserId: 'u9',
        dmPartnerUserId: null,
        isGroupDm: false,
        activeGroupDmId: null,
        dmCallFullscreen: false,
      }),
    ).toEqual({ type: 'dmCall', fullscreen: false });
  });

  it('dmCall when active call id is set (any main surface)', () => {
    const mainSurface: MainSurface = { type: 'dmThread', threadId: 'dm-u1' };
    expect(
      deriveCallOverlay({
        mainSurface,
        dmCallWithUserId: 'u1',
        dmPartnerUserId: 'u1',
        isGroupDm: false,
        activeGroupDmId: null,
        dmCallFullscreen: true,
      }),
    ).toEqual({ type: 'dmCall', fullscreen: true });
  });

  it('none when no active dm call', () => {
    const mainSurface: MainSurface = { type: 'serverText', channelId: 'c1' };
    expect(deriveCallOverlay({ mainSurface, ...baseDm })).toEqual({
      type: 'none',
    });
  });

  it('dmCall persists on server surface while call id is set', () => {
    const mainSurface: MainSurface = { type: 'serverText', channelId: 'c1' };
    expect(
      deriveCallOverlay({
        mainSurface,
        dmCallWithUserId: 'u9',
        dmPartnerUserId: null,
        isGroupDm: false,
        activeGroupDmId: null,
        dmCallFullscreen: false,
      }),
    ).toEqual({ type: 'dmCall', fullscreen: false });
  });
});
