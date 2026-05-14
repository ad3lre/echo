// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';

vi.mock('pinia', () => ({
  storeToRefs: (store: Record<string, unknown>) => store,
}));

vi.mock('@/stores/callRingtone', () => ({
  useCallRingtoneStore: () => ({
    selectedEntry: ref({ label: 'Default' }),
    volumePercent: ref(50),
    muted: ref(false),
    setVolumePercent: () => undefined,
    stepRingtone: () => undefined,
    toggleMuted: () => undefined,
  }),
}));

vi.mock('@/utils/avatarDisplay', () => ({
  resolveCallTileAvatarUrl: (src: string) => src,
}));

vi.mock('@/assets/icons', () => ({
  icons: {
    cameraOn: '/camera.svg',
    desktop: '/desktop.svg',
    mic: '/mic.svg',
    headphones: '/headphones.svg',
    settings: '/settings.svg',
    logOut: '/logout.svg',
    volumeUp: '/volume.svg',
  },
}));

vi.mock('@/components/PausedGifAvatar.vue', () => ({
  default: defineComponent({
    name: 'PausedGifAvatar',
    render: () => h('div', { class: 'avatar-stub' }),
  }),
}));

vi.mock('@/components/CallRingtoneControls.vue', () => ({
  default: defineComponent({
    name: 'CallRingtoneControls',
    render: () => h('div', { class: 'ringtone-controls-stub' }),
  }),
}));

vi.mock('@/features/layout/components/QuarterCallMediaBadges.vue', () => ({
  default: defineComponent({
    name: 'QuarterCallMediaBadges',
    render: () => null,
  }),
}));

import DMCallView from './DMCallView.vue';

describe('DMCallView controls visibility', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    vi.useRealTimers();
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  it('auto-hides controls for active media calls and reveals on interaction', async () => {
    vi.useFakeTimers();

    const Host = defineComponent({
      setup() {
        return () =>
          h(DMCallView, {
            partnerName: 'Ada',
            partnerPfp: '/ada.png',
            partnerId: 'u2',
            currentUserName: 'You',
            currentUserPfp: '/you.png',
            currentUserId: 'u1',
            muted: false,
            deafened: false,
            video: true,
            screenshare: false,
            fullscreen: true,
            callViewParticipants: [{ id: 'u1', name: 'You', pfp: '/you.png' }],
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.mount(container);
    await nextTick();

    const controls = container.querySelector('.dm-call-controls');
    const main = container.querySelector('.dm-call-main');
    expect(controls).not.toBeNull();
    expect(main).not.toBeNull();
    expect(controls!.classList.contains('dm-call-controls--overlay')).toBe(
      true,
    );
    expect(controls!.classList.contains('dm-call-controls--hidden')).toBe(
      false,
    );

    vi.advanceTimersByTime(2200);
    await nextTick();
    expect(controls!.classList.contains('dm-call-controls--hidden')).toBe(true);

    main!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    await nextTick();
    expect(controls!.classList.contains('dm-call-controls--hidden')).toBe(
      false,
    );

    vi.advanceTimersByTime(2400);
    await nextTick();
    expect(controls!.classList.contains('dm-call-controls--hidden')).toBe(true);
  });
});
