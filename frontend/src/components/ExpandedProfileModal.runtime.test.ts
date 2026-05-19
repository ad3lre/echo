// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  type App,
} from 'vue';
import { createPinia } from 'pinia';
import type { ExpandedProfile } from '@/utils/memberProfiles';

vi.mock('@/composables/useUserVoiceChannelPresenceForProfile', () => ({
  useUserVoiceChannelPresenceForProfile: () => computed(() => []),
}));

import ExpandedProfileModal from '@/components/ExpandedProfileModal.vue';
import UserProfileMoreMenu from '@/components/UserProfileMoreMenu.vue';

function minimalExpandedProfile(
  overrides: Partial<ExpandedProfile> = {},
): ExpandedProfile {
  return {
    id: 'peer-1',
    displayName: 'Peer User',
    username: 'peer',
    pfp: 'https://example.com/p.png',
    bio: '',
    bannerColor: '#1a1a2e',
    bannerRefractionEnabled: false,
    bannerBlurEnabled: false,
    bannerBlackoutEnabled: false,
    bannerPositionY: 50,
    serverName: 'S',
    joinedAt: '',
    roles: [],
    mutualServers: [],
    mutualFriends: [],
    ...overrides,
  } as ExpandedProfile;
}

describe('ExpandedProfileModal runtime', () => {
  let app: App<Element> | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    document.body.innerHTML = '';
    app = null;
    container = null;
  });

  it('UserProfileMoreMenu exposes ⋮ trigger when enabled prop omitted', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(UserProfileMoreMenu, {
            userId: 'u1',
            isBlocked: false,
          });
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.use(createPinia());
    app.mount(container);
    await nextTick();
    expect(container.querySelector('[aria-label="More options"]')).toBeTruthy();
  });

  it('UserProfileMoreMenu hides ⋮ when enabled is false', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(UserProfileMoreMenu, {
            userId: 'u1',
            isBlocked: false,
            enabled: false,
          });
      },
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.use(createPinia());
    app.mount(container);
    await nextTick();
    expect(container.querySelector('[aria-label="More options"]')).toBeNull();
  });

  it('renders ⋮ overflow trigger for a non-self profile (name row)', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(ExpandedProfileModal, {
            modelValue: true,
            profile: minimalExpandedProfile(),
            note: '',
            currentUserId: 'viewer-1',
            friendshipKnown: true,
            isFriend: false,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.use(createPinia());
    app.mount(container);
    await nextTick();

    const overlay = document.body.querySelector('.ep-overlay');
    expect(overlay).toBeTruthy();
    const more = overlay?.querySelector(
      '[aria-label="More options"]',
    ) as HTMLButtonElement | null;
    expect(more).toBeTruthy();
    expect(more!.closest('.ep-profile-head-row__actions')).toBeTruthy();
  });

  it('omits ⋮ overflow trigger for self profile', async () => {
    const Host = defineComponent({
      setup() {
        return () =>
          h(ExpandedProfileModal, {
            modelValue: true,
            profile: minimalExpandedProfile({ id: 'me', displayName: 'Me' }),
            note: '',
            currentUserId: 'me',
            friendshipKnown: true,
          });
      },
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(Host);
    app.use(createPinia());
    app.mount(container);
    await nextTick();

    expect(
      document.body.querySelector('[aria-label="More options"]'),
    ).toBeNull();
  });
});
