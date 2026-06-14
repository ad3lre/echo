// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import UserProfileMoreMenu from './UserProfileMoreMenu.vue';
import {
  COMPOSER_INSERT_USER_MENTION_KEY,
  type InsertUserMentionFn,
} from '@/features/chat/chatComposerContext';

vi.mock('@/assets/icons', () => ({
  icons: {
    moreVertical: '/mock-more.svg',
    messageAlt: '/mock-message.svg',
    profileView: '/mock-profile.svg',
    friendAdd: '/mock-friend-add.svg',
    trash: '/mock-trash.svg',
    banUser: '/mock-ban-user.svg',
    shield: '/mock-shield.svg',
  },
}));

vi.mock('@/stores/devSettings', () => ({
  useDevSettingsStore: () => ({
    devModeIdsEnabled: false,
  }),
}));

vi.mock('pinia', () => ({
  storeToRefs: () => ({
    devModeIdsEnabled: ref(false),
  }),
}));

describe('UserProfileMoreMenu quick mention', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  async function mountMenu(mentionFn: InsertUserMentionFn | null) {
    const Host = defineComponent({
      setup() {
        return () =>
          h(UserProfileMoreMenu, {
            userId: 'u9',
            mentionDisplayName: 'Nova',
            isBlocked: false,
          });
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.provide(COMPOSER_INSERT_USER_MENTION_KEY, ref(mentionFn));
    app.mount(container);
    await nextTick();
  }

  it('wires Direct mention action into composer callback', async () => {
    const mentionFn = vi.fn();
    await mountMenu(mentionFn);
    const trigger = container?.querySelector(
      'button[aria-label="More options"]',
    );
    expect(trigger).toBeTruthy();
    (trigger as HTMLButtonElement).click();
    await nextTick();
    const mentionBtn = Array.from(
      document.body.querySelectorAll('[data-profile-more-menu] button'),
    ).find((el) => (el.textContent ?? '').includes('Direct mention'));
    expect(mentionBtn).toBeTruthy();
    (mentionBtn as HTMLButtonElement).click();
    expect(mentionFn).toHaveBeenCalledWith({
      userId: 'u9',
      displayName: 'Nova',
    });
  });

  it('hides Direct mention when composer callback is unavailable', async () => {
    await mountMenu(null);
    const trigger = container?.querySelector(
      'button[aria-label="More options"]',
    );
    expect(trigger).toBeTruthy();
    (trigger as HTMLButtonElement).click();
    await nextTick();
    const mentionBtn = Array.from(
      document.body.querySelectorAll('[data-profile-more-menu] button'),
    ).find((el) => (el.textContent ?? '').includes('Direct mention'));
    expect(mentionBtn).toBeUndefined();
  });
});
