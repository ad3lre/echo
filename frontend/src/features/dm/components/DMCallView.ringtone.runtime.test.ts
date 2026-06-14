// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';

vi.mock('pinia', () => ({
  storeToRefs: () => ({
    selectedEntry: ref({ label: 'Classic' }),
    volumePercent: ref(75),
    muted: ref(false),
  }),
}));

vi.mock('@/stores/callRingtone', () => ({
  useCallRingtoneStore: () => ({
    stepRingtone: vi.fn(),
    toggleMuted: vi.fn(),
    setVolumePercent: vi.fn(),
  }),
}));

vi.mock('@/assets/icons', () => ({
  icons: {
    mic: '/mic.svg',
    headphones: '/headphones.svg',
    cameraOn: '/camera.svg',
    desktop: '/desktop.svg',
    settings: '/settings.svg',
    logOut: '/logout.svg',
  },
}));

vi.mock('@/components/PausedGifAvatar.vue', () => ({
  default: defineComponent({
    name: 'PausedGifAvatar',
    render: () => null,
  }),
}));

vi.mock('@/features/layout/components/QuarterCallMediaBadges.vue', () => ({
  default: defineComponent({
    name: 'QuarterCallMediaBadges',
    render: () => null,
  }),
}));

vi.mock('@/features/voice/components/CallRingtoneControls.vue', () => ({
  default: defineComponent({
    name: 'CallRingtoneControls',
    render: () => h('div', { 'data-testid': 'ringtone-controls' }),
  }),
}));

import DMCallView from './DMCallView.vue';

describe('DMCallView fullscreen ringtone control visibility', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  async function mountView(extraProps: Record<string, unknown> = {}) {
    const Host = defineComponent({
      setup() {
        return () =>
          h(DMCallView, {
            partnerName: 'Ada',
            partnerPfp: '',
            partnerId: 'u2',
            currentUserName: 'You',
            currentUserPfp: '',
            currentUserId: 'u1',
            muted: false,
            deafened: false,
            fullscreen: true,
            ...extraProps,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();
    await nextTick();
  }

  it('hides ringtone controls during active in-call fullscreen state', async () => {
    await mountView({
      ringing: false,
      incoming: false,
      ringUiChrome: false,
      dmCallAwaitingAccept: false,
      lobbyAwaitingRejoin: false,
      ringRemoteVanishing: false,
    });

    expect(
      container?.querySelector('[data-testid="ringtone-controls"]'),
    ).toBeNull();
  });

  it('shows ringtone controls in fullscreen ringing state', async () => {
    await mountView({
      ringing: true,
      incoming: false,
      dmCallAwaitingAccept: true,
    });

    expect(
      container?.querySelector('[data-testid="ringtone-controls"]'),
    ).not.toBeNull();
  });
});
