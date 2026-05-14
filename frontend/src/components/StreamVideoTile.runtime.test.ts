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
  },
}));

vi.mock('@/utils/avatarDisplay', () => ({
  resolveCallTileAvatarUrl: () => '',
}));

vi.mock('@/utils/livekitTrackMediaStream', () => ({
  clearHtmlVideoElement: () => undefined,
  mediaStreamFromLiveKitTrack: () => null,
}));

vi.mock('@/composables/useLocalScreenSharePreviewSuspend', () => ({
  useLocalScreenSharePreviewSuspend: () => ({
    previewSuspended: ref(false),
    bumpPreviewActivity: () => undefined,
  }),
}));

vi.mock('@/composables/useLiveKitTrackSurfaceGeneration', () => ({
  useLiveKitTrackSurfaceGeneration: () => ref(0),
}));

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

    slider!.value = '42';
    slider!.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();

    expect(seen.at(-1)).toBe(42);
    expect(menu?.textContent).toContain('42%');
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
