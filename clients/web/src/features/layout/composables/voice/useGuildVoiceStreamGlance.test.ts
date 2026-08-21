import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  pickGuildVoiceStreamGlance,
  useGuildVoiceStreamGlance,
} from '@/features/layout/composables/voice/useGuildVoiceStreamGlance';
import type { LayoutChatSurfaceContext } from '@/features/layout/layoutInjectionKeys';

function mockLayout(
  overrides: Partial<Record<string, unknown>> = {},
): LayoutChatSurfaceContext {
  return {
    currentVoiceChannelId: ref('vc-1'),
    isViewingVoiceChannel: ref(false),
    fullscreenStreamParticipantId: ref(null),
    activeVoiceChannelParticipants: ref([]),
    remoteParticipants: ref(new Map()),
    getLocalScreenTrack: ref(() => null),
    getLocalCameraTrack: ref(() => null),
    currentUser: ref({ id: 'self' }),
    ...overrides,
  } as unknown as LayoutChatSurfaceContext;
}

describe('pickGuildVoiceStreamGlance', () => {
  it('prefers remote screen share over local', () => {
    const layout = mockLayout({
      getLocalScreenTrack: ref(() => ({ id: 'local-screen' })),
    });
    const glance = pickGuildVoiceStreamGlance(
      [
        {
          id: 'self',
          name: 'Me',
          streaming: true,
        },
        {
          id: 'peer',
          name: 'Peer',
          streaming: true,
          screenTrack: { id: 'peer-screen' },
        },
      ],
      layout,
      'self',
    );
    expect(glance?.id).toBe('peer');
    expect(glance?.isScreenShare).toBe(true);
  });

  it('shows local screen when streamer browses away from VC', () => {
    const layout = mockLayout({
      getLocalScreenTrack: ref(() => ({ id: 'local-screen' })),
    });
    const glance = pickGuildVoiceStreamGlance(
      [
        {
          id: 'self',
          name: 'Me',
          streaming: true,
        },
      ],
      layout,
      'self',
    );
    expect(glance?.id).toBe('self');
    expect(glance?.isLocal).toBe(true);
    expect(glance?.isScreenShare).toBe(true);
  });
});

describe('useGuildVoiceStreamGlance', () => {
  it('hides PiP when viewing voice channel or fullscreen overlay', () => {
    const layout = mockLayout({
      isViewingVoiceChannel: ref(true),
      activeVoiceChannelParticipants: ref([
        {
          id: 'peer',
          streaming: true,
          screenTrack: { id: 't' },
        },
      ]),
    });
    const { pipVisible } = useGuildVoiceStreamGlance(layout);
    expect(pipVisible.value).toBe(false);

    layout.isViewingVoiceChannel = ref(false);
    layout.fullscreenStreamParticipantId = ref('peer');
    const again = useGuildVoiceStreamGlance(layout);
    expect(again.pipVisible.value).toBe(false);
  });

  it('shows PiP when connected, away from VC, and a stream is live', () => {
    const layout = mockLayout({
      activeVoiceChannelParticipants: ref([
        {
          id: 'peer',
          name: 'Peer',
          streaming: true,
          screenTrack: { id: 't' },
        },
      ]),
    });
    const { pipVisible, glance } = useGuildVoiceStreamGlance(layout);
    expect(pipVisible.value).toBe(true);
    expect(glance.value?.id).toBe('peer');
  });
});
