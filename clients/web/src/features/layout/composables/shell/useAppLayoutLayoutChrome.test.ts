/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, ref } from 'vue';
import { useAppLayoutLayoutChrome } from './useAppLayoutLayoutChrome';

vi.mock('@/features/auth/passkeyWebCeremony', () => ({
  prefetchPasskeyLoginOptions: vi.fn(),
}));

function mountChrome() {
  let chrome!: ReturnType<typeof useAppLayoutLayoutChrome>;
  const app = createApp(
    defineComponent({
      setup() {
        chrome = useAppLayoutLayoutChrome(ref(false));
        return () => null;
      },
    }),
  );
  app.mount(document.createElement('div'));
  return { chrome, unmount: () => app.unmount() };
}

describe('useAppLayoutLayoutChrome', () => {
  let unmount: (() => void) | undefined;

  afterEach(() => {
    unmount?.();
    unmount = undefined;
  });

  it('openAuthModal applies forgot-password preset', () => {
    const mounted = mountChrome();
    unmount = mounted.unmount;
    const chrome = mounted.chrome;
    chrome.openAuthModal({ forgot: true });
    expect(chrome.isAuthModalOpen.value).toBe(true);
    expect(chrome.authModalInitialSubView.value).toBe('forgot');
    expect(chrome.authModalInitialLoginEntry.value).toBe('echo');
    expect(chrome.authModalInitialTab.value).toBe('login');
    expect(chrome.authModalPasskeyOnOpen.value).toBe(false);
  });

  it('openAuthModal resets sub-view and applies entry/tab/passkey', () => {
    const mounted = mountChrome();
    unmount = mounted.unmount;
    const chrome = mounted.chrome;
    chrome.authModalInitialSubView.value = 'forgot';
    chrome.openAuthModal({ entry: 'echo', tab: 'register', passkey: true });
    expect(chrome.authModalInitialSubView.value).toBeNull();
    expect(chrome.authModalInitialLoginEntry.value).toBe('echo');
    expect(chrome.authModalInitialTab.value).toBe('register');
    expect(chrome.authModalPasskeyOnOpen.value).toBe(true);
  });

  it('openUserSettingsToDiscordFromAddServer closes add-server and opens settings on Discord', () => {
    const mounted = mountChrome();
    unmount = mounted.unmount;
    const chrome = mounted.chrome;
    chrome.isAddServerModalOpen.value = true;
    chrome.openUserSettingsToDiscordFromAddServer();
    expect(chrome.isAddServerModalOpen.value).toBe(false);
    expect(chrome.settingsModalInitialSection.value).toBe('Discord');
    expect(chrome.isSettingsModalOpen.value).toBe(true);
  });

  it('clears auth modal initial fields when modal closes', () => {
    const mounted = mountChrome();
    unmount = mounted.unmount;
    const chrome = mounted.chrome;
    chrome.openAuthModal({ entry: 'echo', tab: 'register', passkey: true });
    chrome.isAuthModalOpen.value = false;
    expect(chrome.authModalInitialLoginEntry.value).toBe('social');
    expect(chrome.authModalInitialTab.value).toBe('login');
    expect(chrome.authModalPasskeyOnOpen.value).toBe(false);
    expect(chrome.authModalInitialSubView.value).toBeNull();
  });

  it('clears local media flags when leaving voice', () => {
    const mounted = mountChrome();
    unmount = mounted.unmount;
    const chrome = mounted.chrome;
    chrome.currentVoiceChannelId.value = 'voice-1';
    chrome.currentVoiceChannelName.value = 'General';
    chrome.vcVideo.value = true;
    chrome.vcScreenshare.value = true;
    chrome.fullscreenStreamParticipantId.value = 'self';
    chrome.openVcActivityPicker();
    expect(chrome.vcActivityUi.value.phase).toBe('pick');

    chrome.onLeaveVoice();

    expect(chrome.currentVoiceChannelId.value).toBeNull();
    expect(chrome.currentVoiceChannelName.value).toBe('');
    expect(chrome.vcVideo.value).toBe(false);
    expect(chrome.vcScreenshare.value).toBe(false);
    expect(chrome.fullscreenStreamParticipantId.value).toBeNull();
    expect(chrome.vcActivityUi.value.phase).toBe('closed');
  });
});
