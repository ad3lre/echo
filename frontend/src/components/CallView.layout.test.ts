// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';

vi.mock('@/components/PausedGifAvatar.vue', () => ({
  default: defineComponent({
    name: 'PausedGifAvatar',
    render: () => null,
  }),
}));

vi.mock('@/components/StreamVideoTile.vue', () => ({
  default: defineComponent({
    name: 'StreamVideoTile',
    props: {
      participantId: { type: String, default: '' },
      participantName: { type: String, default: '' },
      isScreenShare: { type: Boolean, default: false },
    },
    render() {
      return h(
        'div',
        {
          class: 'stream-video-tile-stub',
          'data-participant-id': this.participantId,
          'data-is-screen-share': this.isScreenShare ? '1' : '0',
        },
        this.participantName,
      );
    },
  }),
}));

import CallView from './CallView.vue';

describe('CallView meet-style layout', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = null;
    container = null;
  });

  async function mountWithParticipants(
    participants: Array<{
      id: string;
      name: string;
      pfp: string;
      video?: boolean;
      streaming?: boolean;
    }>,
  ) {
    const Host = defineComponent({
      setup() {
        return () =>
          h(CallView, {
            channelName: 'General',
            participants,
            currentUserId: 'u1',
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

  it('uses dominant stage + side rail when media tiles exist', async () => {
    await mountWithParticipants([
      { id: 'u1', name: 'You', pfp: '', video: true },
      { id: 'u2', name: 'Ada', pfp: '', streaming: true },
      { id: 'u3', name: 'Lin', pfp: '' },
    ]);

    const shell = container?.querySelector('.call-participants-shell');
    expect(
      shell?.classList.contains('call-participants-shell--meet-stage'),
    ).toBe(true);
    expect(container?.querySelector('.call-meet-stage')).not.toBeNull();
    expect(
      container?.querySelectorAll('.call-meet-stage .stream-video-tile-stub')
        .length,
    ).toBe(1);
    expect(
      container?.querySelectorAll(
        '.call-participant-rail-media .stream-video-tile-stub',
      ).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('falls back when no media tiles are present', async () => {
    await mountWithParticipants([
      { id: 'u1', name: 'You', pfp: '' },
      { id: 'u2', name: 'Ada', pfp: '' },
    ]);

    const shell = container?.querySelector('.call-participants-shell');
    expect(
      shell?.classList.contains('call-participants-shell--meet-stage'),
    ).toBe(false);
    expect(container?.querySelector('.call-meet-stage')).toBeNull();
    expect(container?.querySelector('.call-participant-rail-media')).toBeNull();
  });
});
