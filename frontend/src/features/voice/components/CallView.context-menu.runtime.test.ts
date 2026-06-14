// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import CallView from './CallView.vue';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';

vi.mock('@/components/PausedGifAvatar.vue', () => ({
  default: defineComponent({
    name: 'PausedGifAvatar',
    render: () => null,
  }),
}));

vi.mock('@/features/voice/components/StreamVideoTile.vue', () => ({
  default: defineComponent({
    name: 'StreamVideoTile',
    render: () => null,
  }),
}));

vi.mock('@/composables/useCoarsePointer', () => ({
  useCoarsePointer: () => ref(false),
}));

describe('CallView quick mention context menu', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  async function mountCallView(mentionFn: InsertUserMentionFn | null) {
    const Host = defineComponent({
      setup() {
        return () =>
          h(CallView, {
            channelName: 'Voice',
            currentUserId: 'u1',
            participants: [
              { id: 'u1', name: 'You', pfp: '' },
              { id: 'u2', name: 'Ada', pfp: '' },
            ],
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.provide(COMPOSER_INSERT_USER_MENTION_KEY, ref(mentionFn));
    app.mount(container);
    await nextTick();
    await nextTick();
  }

  it('mentions selected participant from call context menu', async () => {
    const mentionFn = vi.fn();
    await mountCallView(mentionFn);
    const participantTile =
      container?.querySelectorAll('.call-audio-circle')[1];
    expect(participantTile).toBeTruthy();
    participantTile!.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 80,
      }),
    );
    await nextTick();
    const quickMentionBtn = Array.from(
      document.body.querySelectorAll('.call-vc-menu button'),
    ).find((el) => (el.textContent ?? '').includes('Quick mention'));
    expect(quickMentionBtn).toBeTruthy();
    (quickMentionBtn as HTMLButtonElement).click();
    await nextTick();
    expect(mentionFn).toHaveBeenCalledWith({
      userId: 'u2',
      displayName: 'Ada',
    });
  });

  it('does not open quick mention menu without composer wiring', async () => {
    await mountCallView(null);
    const participantTile =
      container?.querySelectorAll('.call-audio-circle')[1];
    expect(participantTile).toBeTruthy();
    participantTile!.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 80,
      }),
    );
    await nextTick();
    expect(document.body.querySelector('.call-vc-menu')).toBeNull();
  });
});
