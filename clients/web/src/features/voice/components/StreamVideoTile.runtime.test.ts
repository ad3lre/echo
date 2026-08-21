// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';

vi.mock('@/components/PausedGifAvatar.vue', () => ({
  default: defineComponent({
    name: 'PausedGifAvatar',
    render: () => null,
  }),
}));

vi.mock('@/assets/icons', () => ({
  icons: {
    volumeUp: '/mock-volume.svg',
    notificationsOff: '/mock-volume-muted.svg',
  },
}));

vi.mock('@/features/layout/display/avatarDisplay', () => ({
  resolveCallTileAvatarUrl: () => '',
}));

vi.mock('@/features/voice/livekitTrackMediaStream', () => ({
  clearHtmlVideoElement: () => undefined,
  mediaStreamFromLiveKitTrack: () => null,
}));

vi.mock(
  '@/features/voice/composables/useLocalScreenSharePreviewSuspend',
  () => ({
    useLocalScreenSharePreviewSuspend: () => ({
      previewSuspended: ref(false),
      bumpPreviewActivity: () => undefined,
    }),
  }),
);

vi.mock(
  '@/features/voice/composables/useLiveKitTrackSurfaceGeneration',
  () => ({
    useLiveKitTrackSurfaceGeneration: () => ref(0),
  }),
);

import StreamVideoTile from './StreamVideoTile.vue';

describe('StreamVideoTile runtime context menu', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  it('shows participant volume in the tile right-click menu and emits changes', async () => {
    const seen: number[] = [];

    const Host = defineComponent({
      setup() {
        const volume = ref(100);
        return () =>
          h(StreamVideoTile, {
            track: null,
            participantName: 'Ada',
            participantId: 'u1',
            remoteStreamVolumeControl: true,
            remoteStreamVolumePercent: volume.value,
            onRemoteStreamVolumeChange: (v: number) => {
              seen.push(v);
              volume.value = v;
            },
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    const tile = container.querySelector('.stream-video-tile');
    expect(tile).not.toBeNull();

    tile!.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 60,
      }),
    );
    await nextTick();

    const menu = document.body.querySelector('.stream-quality-menu');
    expect(menu?.textContent).toContain('Their volume');

    const slider = document.body.querySelector(
      'input[aria-label="Participant volume"]',
    ) as HTMLInputElement | null;
    expect(slider).not.toBeNull();

    slider!.value = '84';
    slider!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    expect(seen.at(-1)).toBe(84);
    expect(menu?.textContent).toContain('42%');
  });

  it('shows a stream volume speaker control on the tile chrome', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(StreamVideoTile, {
            track: null,
            participantName: 'Ada',
            participantId: 'u1',
            remoteStreamVolumeControl: true,
            remoteStreamVolumePercent: 80,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    const volBtn = container.querySelector(
      'button[aria-label="Stream volume"]',
    ) as HTMLButtonElement | null;
    expect(volBtn).not.toBeNull();
    volBtn!.click();
    await nextTick();

    const slider = document.body.querySelector(
      '.stream-tile-volume-popover input[aria-label="Stream volume"]',
    ) as HTMLInputElement | null;
    expect(slider).not.toBeNull();
    expect(slider?.value).toBe('80');
  });

  it('resets stream volume to 100 from the volume popover', async () => {
    const seen: number[] = [];

    const Host = defineComponent({
      setup() {
        const volume = ref(60);
        return () =>
          h(StreamVideoTile, {
            track: null,
            participantName: 'Ada',
            participantId: 'u1',
            remoteStreamVolumeControl: true,
            remoteStreamVolumePercent: volume.value,
            onRemoteStreamVolumeChange: (v: number) => {
              seen.push(v);
              volume.value = v;
            },
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    const volBtn = container.querySelector(
      'button[aria-label="Stream volume"]',
    ) as HTMLButtonElement;
    volBtn.click();
    await nextTick();

    const resetBtn = document.body.querySelector(
      '.stream-tile-volume-popover button[aria-label="Reset stream volume to default"]',
    ) as HTMLButtonElement;
    expect(resetBtn).not.toBeNull();
    resetBtn.click();
    await nextTick();

    expect(seen.at(-1)).toBe(100);
  });

  it('shows avatar fallback when track exists but media stream is unavailable', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(StreamVideoTile, {
            track: {} as { track?: MediaStreamTrack },
            participantName: 'Ada',
            participantId: 'u1',
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    const loading = container.querySelector('.stream-video-tile__loading');
    expect(loading).not.toBeNull();
  });
});
